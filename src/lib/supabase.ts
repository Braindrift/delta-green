import { createClient } from '@supabase/supabase-js';
import type { AppDatabase } from '@/types/database-overrides';

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
 * Parameterised with `AppDatabase` — the generated `Database`
 * (`src/types/database.ts`, regenerated with
 * `npx supabase gen types typescript --linked --schema public`) with its
 * CHECK-text / JSONB columns narrowed to the app's literal unions
 * (`src/types/database-overrides.ts`). `.from(...)` reads therefore return
 * RLS-aware, app-shaped row types automatically — the data layer no longer
 * hand-casts PostgREST results to row shapes.
 */
export const supabase = createClient<AppDatabase>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
