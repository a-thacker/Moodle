// Supabase client for the Hub. Only the ANON key ever appears here —
// injected at build time from env vars (Vite locally via hub/.env, Netlify
// via site environment variables). RLS in supabase/schema.sql is what
// actually protects the data; the anon key is public by design.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Null when unconfigured so the app can render a setup notice instead of
// crashing at import time.
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
