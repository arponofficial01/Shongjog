import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL_KEY = 'contact_app_supabase_url';
const SUPABASE_KEY_KEY = 'contact_app_supabase_anon_key';

// User configured live credentials
const DEFAULT_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  (import.meta.env as any).NEXT_PUBLIC_SUPABASE_URL ||
  'https://ndzuimzgxfvqmmwtbrnh.supabase.co';

const DEFAULT_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  (import.meta.env as any).NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_HXje7q3K-cXbCwfLHp3P-Q_hm6ZEv4d';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseConfig(): { url: string; anonKey: string; isConfigured: boolean } {
  const customUrl = localStorage.getItem(SUPABASE_URL_KEY);
  const customKey = localStorage.getItem(SUPABASE_KEY_KEY);

  const url = customUrl || DEFAULT_URL;
  const anonKey = customKey || DEFAULT_ANON_KEY;
  const isConfigured = Boolean(
    url &&
    !url.includes('placeholder') &&
    anonKey &&
    !anonKey.includes('placeholder')
  );

  return { url, anonKey, isConfigured };
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  localStorage.setItem(SUPABASE_URL_KEY, url.trim());
  localStorage.setItem(SUPABASE_KEY_KEY, anonKey.trim());
  supabaseInstance = null; // force reinitialization
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem(SUPABASE_URL_KEY);
  localStorage.removeItem(SUPABASE_KEY_KEY);
  supabaseInstance = null;
}

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const { url, anonKey } = getSupabaseConfig();
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }
  return supabaseInstance;
}
