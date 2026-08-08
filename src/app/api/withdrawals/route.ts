import { NextRequest } from 'next/server';
import {
  ApiError,
  apiError,
  assertSmallJsonRequest,
  limitRequest,
  noStoreJson,
  parseAmountToCents,
  requireAuthenticatedUser,
  requireSameOrigin,
} from '@/lib/api-security';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    assertSmallJsonRequest(request);
    limitRequest(request, 'withdrawal', 5);
    const user = await requireAuthenticatedUser();
    const body = await request.json() as { amount?: unknown };
    const amountCents = parseAmountToCents(typeof body.amount === 'string' ? body.amount : '');
    if (amountCents === null) throw new ApiError('Informe um valor válido.', 400);

    const admin = createSupabaseAdminClient();
    const { data: account, error: accountError } = await admin.from('accounts')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (accountError || !account) throw new ApiError('Não foi possível localizar sua conta.', 404);

    // The database function locks the account and checks the ledger in one transaction,
    // preventing two simultaneous browser requests from spending the same balance.
    const { data: withdrawalId, error: reserveError } = await admin.rpc('reserve_withdrawal', {
      p_account_id: account.id,
      p_amount_cents: amountCents,
    });
    if (reserveError || !withdrawalId) {
      const message = reserveError?.message?.includes('INSUFFICIENT_FUNDS')
        ? 'Seu saldo disponível não é suficiente para este saque.'
        : reserveError?.message?.includes('ACCOUNT_NOT_ELIGIBLE')
          ? 'Conclua a verificação e cadastre a conta de destino antes de sacar.'
          : 'Não foi possível solicitar o saque.';
      throw new ApiError(message, reserveError?.message?.includes('INSUFFICIENT_FUNDS') ? 409 : 400);
    }

    await admin.from('audit_events').insert({
      account_id: account.id,
      actor_user_id: user.id,
      event_type: 'withdrawal.requested',
      entity_type: 'withdrawal',
      entity_id: withdrawalId,
    });

    return noStoreJson({ withdrawal_id: withdrawalId, status: 'pending_review' }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
