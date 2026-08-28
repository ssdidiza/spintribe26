-- Enforce the canonical split between platform roles and club roles.
-- Legacy global champions are normalized only after proving that their club
-- capability is preserved in team_memberships.

do $$
begin
  if exists (
    select 1
    from public.users u
    where u.role = 'champion'
      and not exists (
        select 1
        from public.team_memberships tm
        where tm.user_strava_id = u.strava_id
          and tm.role = 'champion'
      )
  ) then
    raise exception 'Cannot normalize users.role: a legacy champion is missing a canonical champion membership';
  end if;
end
$$;

update public.users
set role = 'member', updated_at = now()
where role = 'champion';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_role_platform_only'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_role_platform_only
      check (role in ('member', 'admin')) not valid;
    alter table public.users validate constraint users_role_platform_only;
  end if;
end
$$;
