import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = url.searchParams.get('next') || '/dashboard';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  const destination = new URL(safeNext, url.origin);
  const supabase = await createSupabaseServerClient();

  if (code) await supabase.auth.exchangeCodeForSession(code);
  else if (tokenHash && (type === 'signup' || type === 'email_change' || type === 'recovery')) {
    await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  }
  return NextResponse.redirect(destination);
}
