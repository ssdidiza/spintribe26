-- Serialize ride check-ins at the ride row so capacity cannot be exceeded by
-- concurrent requests. Club authorization remains in the server route; this
-- function is service-role-only and has no coaching/payment dependencies.

create or replace function public.check_in_team_ride(
  p_ride_id uuid,
  p_champ_id text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ride public.team_rides%rowtype;
  v_checkin_count integer;
begin
  select * into v_ride
  from public.team_rides
  where id = p_ride_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if abs(extract(epoch from (clock_timestamp() - v_ride.starts_at))) > 12 * 60 * 60 then
    return 'outside_window';
  end if;

  if exists (
    select 1
    from public.ride_checkins
    where ride_id = p_ride_id and champ_id = p_champ_id
  ) then
    return 'already_checked_in';
  end if;

  select count(*)::integer into v_checkin_count
  from public.ride_checkins
  where ride_id = p_ride_id;

  if v_checkin_count >= v_ride.capacity then
    return 'full';
  end if;

  insert into public.ride_checkins (ride_id, champ_id)
  values (p_ride_id, p_champ_id)
  on conflict (ride_id, champ_id) do nothing;

  if not found then
    return 'already_checked_in';
  end if;

  return 'checked_in';
end;
$$;

revoke execute on function public.check_in_team_ride(uuid, text) from public, anon, authenticated;
grant execute on function public.check_in_team_ride(uuid, text) to service_role;
