-- Track when optional Strava FTP profile data was cached.
-- Application code treats FTP older than seven days as unavailable.
alter table public.users
  add column if not exists ftp_cached_at timestamptz;

grant select (ftp_cached_at)
  on public.users
  to authenticated;
