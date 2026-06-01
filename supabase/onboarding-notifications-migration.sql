-- ============================================================
-- SpinTribe26 — Onboarding + Notifications Migration
-- ============================================================

-- Truncate all user data (fresh start)
TRUNCATE public.champion_sessions, public.activities, public.zones, public.users RESTART IDENTITY CASCADE;

-- Add onboarded + zone + leaderboard_consent to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zone text,
  ADD COLUMN IF NOT EXISTS leaderboard_consent boolean NOT NULL DEFAULT false;

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id bigserial PRIMARY KEY,
  user_strava_id text NOT NULL REFERENCES public.users(strava_id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text NOT NULL,
  dismissed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifs_read_all" ON public.notifications FOR SELECT USING (true);
GRANT SELECT ON public.notifications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.notifications_id_seq TO authenticated;

-- Enable Supabase Realtime on notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
