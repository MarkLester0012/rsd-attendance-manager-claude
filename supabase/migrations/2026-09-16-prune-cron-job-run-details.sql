-- Meeting Room Manager — prune pg_cron's own job-run history
-- Not an app-schema change (cron/net are Supabase-managed extension schemas),
-- but recorded here for the same reason every other DB change in this repo is.
--
-- Root-cause investigation (2026-09-16, /meeting-room "operation_timeout"):
-- cron.job_run_details logs one row per pg_cron run with nothing pruning it.
-- The meeting-room auto-start/complete job (jobid 1) fires every minute
-- (`* * * * *` -> /api/cron/meetings), so this table grows ~1,400 rows/day
-- forever. Confirmed via direct query: 15,539 rows / 5.4MB, growing since
-- 2026-09-05 (when the cron job was added) with no existing cleanup. This
-- contributed to a Supabase "Disk IO budget" warning on the project's Nano
-- compute tier and to a database resource-contention episode that caused
-- /meeting-room to time out in Slack.
--
-- net._http_response (pg_net's own request/response log, also written by
-- this same cron job) was checked too and does NOT need a matching cleanup
-- job: its rows are already self-pruned by pg_net to roughly a 6-hour
-- window (oldest row present was only ~6h old at check time). Its 40MB size
-- at check time was leftover autovacuum bloat from the incident (dead tuples
-- were back to 0 immediately after the project was restarted), not
-- unbounded growth, and resolves on its own as normal autovacuum continues.

select cron.schedule(
  'prune-cron-job-run-details',
  '17 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '3 days'; $$
);
