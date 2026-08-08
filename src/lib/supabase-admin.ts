import { createClient } from '@supabase/supabase-js';

function getAdminConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // The new Supabase secret key is preferred, while the legacy service-role key
  // remains supported for projects that have not migrated their API keys yet.
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secret) {
    throw new Error('A configuração privada do Supabase ainda não foi concluída.');
  }

  return { url, secret };
}

export function createSupabaseAdminClient() {
  const { url, secret } = getAdminConfig();
  return createClient(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
