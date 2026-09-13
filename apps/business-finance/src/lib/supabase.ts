import { createClient } from '@supabase/supabase-js';

const defaultUrl = 'https://qzvpayjaadbmpayeglon.supabase.co';
const defaultPublishableKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6dnBheWphYWRibXBheWVnbG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ4MDUwMTMsImV4cCI6MjA2MDM4MTAxM30.ti7DYVtr4GdlzCeoUF8zD1lStDQfNuDj3mbsnYWP5H8';
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || defaultUrl;
const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
  || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
  || defaultPublishableKey;

export const hasSupabaseConfig = Boolean(url && anonKey);

export const supabase = hasSupabaseConfig
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
