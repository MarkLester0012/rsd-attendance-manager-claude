-- Meeting Room Manager — reduce auto-start/auto-complete cron cadence
-- From every minute to every 15 minutes, keeping the same jobid/history via
-- cron.alter_job rather than unschedule+reschedule.
--
-- Every booking's start_time/end_time is generated from one of two shared
-- 30-minute-step option arrays (no free-text time entry exists anywhere in
-- this app), and the only extension path (+15m Extend) always adds exactly
-- 15 minutes. So every time this app ever writes is already on the same
-- 15-minute grid this schedule ticks on (:00/:15/:30/:45) — this loses no
-- practical precision, it only reduces how much slack there is if a single
-- tick is ever missed. This also cuts the per-minute pg_cron/pg_net write
-- churn identified as a driver of a recent Disk IO budget incident to 1/15th.

select cron.alter_job(job_id := 1, schedule := '*/15 * * * *');
