import { createClient } from '@supabase/supabase-js';

const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const publicKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const hasValidUrl = (() => {
  try {
    const parsed = new URL(url);
    return ['https:', ...(import.meta.env.DEV ? ['http:'] : [])].includes(parsed.protocol);
  } catch {
    return false;
  }
})();
const configured = Boolean(
  hasValidUrl &&
  publicKey &&
  !url.includes('YOUR-PROJECT') &&
  !publicKey.includes('YOUR_SUPABASE')
);

export const supabaseReady = configured;
export const supabase = configured
  ? createClient(url, publicKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
