import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL_KEY = 'contact_app_supabase_url';
const SUPABASE_KEY_KEY = 'contact_app_supabase_anon_key';

// Default public sandbox or user configured credentials
const DEFAULT_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xyzcompany.supabase.co';
const DEFAULT_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'public-anon-key-placeholder';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseConfig(): { url: string; anonKey: string; isConfigured: boolean } {
  const customUrl = localStorage.getItem(SUPABASE_URL_KEY);
  const customKey = localStorage.getItem(SUPABASE_KEY_KEY);

  const url = customUrl || DEFAULT_URL;
  const anonKey = customKey || DEFAULT_ANON_KEY;
  const isConfigured = Boolean(
    url &&
    !url.includes('placeholder') &&
    !url.includes('xyzcompany') &&
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
