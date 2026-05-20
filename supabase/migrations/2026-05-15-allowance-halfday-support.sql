-- ============================================
-- Allow decimal values (e.g. 1.5 half-days) for days_worked and wfh_days
-- in allowance_snapshots. Safe to re-run.
-- ============================================

alter table allowance_snapshots
  alter column days_worked type numeric using days_worked::numeric,
  alter column wfh_days    type numeric using wfh_days::numeric;
