import { NextRequest } from 'next/server';
import { apiError, limitRequest, noStoreJson } from '@/lib/api-security';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return noStoreJson({ error: 'Não autorizado.' }, { status: 401 });
  await limitRequest(request, 'account-read', 120, { subject: user.id });

  const { data: account, error } = await supabase.from('accounts')
    .select('id, display_name, status, kyc_status, payout_key_last4, created_at')
    .eq('user_id', user.id).maybeSingle();
  if (error || !account) return noStoreJson({ error: 'Conta não encontrada.' }, { status: 404 });

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [ledgerResult, pendingPaymentsResult, monthLedgerResult, withdrawalsResult, requestsResult] = await Promise.all([
    supabase.from('ledger_entries')
      .select('id, direction, amount_cents, entry_type, reference_type, occurred_at')
      .eq('account_id', account.id)
      .order('occurred_at', { ascending: false })
      .limit(50),
    supabase.from('payments')
      .select('amount_cents, fee_cents')
      .eq('account_id', account.id)
      .eq('status', 'pending'),
    supabase.from('ledger_entries')
      .select('direction, amount_cents')
      .eq('account_id', account.id)
      .eq('direction', 'credit')
      .gte('occurred_at', startOfMonth.toISOString()),
    supabase.from('withdrawals')
      .select('id, amount_cents, fee_cents, status, requested_at, failure_reason')
      .eq('account_id', account.id)
      .order('requested_at', { ascending: false })
      .limit(20),
    supabase.from('payment_requests')
      .select('id, label, amount_cents, status, created_at, expires_at, paid_at')
      .eq('account_id', account.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const ledger = ledgerResult.data || [];
  const availableCents = ledger.reduce((total, entry) => {
    const amount = Number(entry.amount_cents) || 0;
    return total + (entry.direction === 'credit' ? amount : -amount);
  }, 0);
  const pendingCents = (pendingPaymentsResult.data || []).reduce((total, payment) => total + Math.max(0, Number(payment.amount_cents) - Number(payment.fee_cents)), 0);
  const receivedThisMonthCents = (monthLedgerResult.data || []).reduce((total, entry) => total + (Number(entry.amount_cents) || 0), 0);

  return noStoreJson({
    account,
    available_cents: Math.max(0, availableCents),
    pending_cents: Math.max(0, pendingCents),
    received_this_month_cents: Math.max(0, receivedThisMonthCents),
    ledger,
    withdrawals: withdrawalsResult.data || [],
    payment_requests: requestsResult.data || [],
  });
  } catch (error) {
    return apiError(error);
  }
}
