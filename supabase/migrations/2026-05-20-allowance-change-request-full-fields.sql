-- Expand distance_change_requests to support changing all allowance fields,
-- not just distance_km and mode. New columns are nullable for backwards compat.
ALTER TABLE public.distance_change_requests
  ADD COLUMN IF NOT EXISTS requested_days_worked    numeric,
  ADD COLUMN IF NOT EXISTS requested_wfh_days       numeric,
  ADD COLUMN IF NOT EXISTS requested_jeep_rides     integer,
  ADD COLUMN IF NOT EXISTS requested_bus_rides      integer,
  ADD COLUMN IF NOT EXISTS requested_undertime_days integer,
  ADD COLUMN IF NOT EXISTS requested_owns_vehicle   boolean;
