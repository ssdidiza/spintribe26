import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Client-side Supabase (anon key, subject to RLS) */
export const supabase = createClient(url, anon);

/** Server-side Supabase (service role, bypasses RLS — only use in API routes) */
export const supabaseAdmin = () => createClient(url, service);
