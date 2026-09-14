import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qzvpayjaadbmpayeglon.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6dnBheWphYWRibXBheWVnbG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MDUwMTMsImV4cCI6MjA2MDM4MTAxM30.ti7DYVtr4GdlzCeoUF8zD1lStDQfNuDj3mbsnYWP5H8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
