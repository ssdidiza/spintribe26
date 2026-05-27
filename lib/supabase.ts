import { createClient } from "@supabase/supabase-js";

const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";

/** Client-side Supabase (anon key, subject to RLS) */
export const supabase = createClient(publicUrl, anonKey);

/** Server-side Supabase (service role, bypasses RLS - only use in API routes) */
export const supabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error("Supabase server environment variables are not configured.");
  }
  return createClient(url, service);
};
