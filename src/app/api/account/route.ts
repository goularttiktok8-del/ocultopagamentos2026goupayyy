import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const { data: account, error } = await supabase.from('accounts')
    .select('id, display_name, status, kyc_status, payout_key_last4, created_at')
    .eq('user_id', user.id).maybeSingle();
  if (error || !account) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 });

  const { data: entries } = await supabase.from('ledger_entries')
    .select('direction, amount_cents').eq('account_id', account.id);
  const availableCents = (entries || []).reduce((total, entry) => total + (entry.direction === 'credit' ? entry.amount_cents : -entry.amount_cents), 0);
  return NextResponse.json({ account, available_cents: Math.max(0, availableCents) });
}
