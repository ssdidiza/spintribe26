-- Move the retired messaging provider to a generic historical label, then
-- make email the only active delivery channel. Safe to re-run.

alter table public.lesson_reminders
  drop constraint if exists lesson_reminders_channel_check;

update public.lesson_reminders
set channel = 'legacy'
where channel not in ('email', 'legacy');

alter table public.lesson_reminders
  alter column channel set default 'email';

alter table public.lesson_reminders
  add constraint lesson_reminders_channel_check
  check (channel in ('email', 'legacy'));

comment on column public.lesson_reminders.channel is
  'Email is the only active delivery channel. Legacy is retained solely for historical log rows.';
