import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.',
  );
}

/**
 * Singleton Supabase client used across the app.
 * Auth state is persisted to localStorage by default and survives page refreshes.
 *
 * Once we generate database types (DEL-11+), swap `createClient` for
 * `createClient<Database>(...)` to pick up RLS-aware row types automatically.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
