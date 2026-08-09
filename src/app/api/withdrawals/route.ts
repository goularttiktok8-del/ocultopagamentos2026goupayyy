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
import { createTransfer, PagarmeError } from '@/lib/pagarme';
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
      .select('id, pagarme_recipient_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (accountError || !account) throw new ApiError('Não foi possível localizar sua conta.', 404);
    if (!account.pagarme_recipient_id) {
      throw new ApiError('A conta de destino ainda não foi configurada.', 409);
    }

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

    try {
      const transfer = await createTransfer({
        amountCents,
        recipientId: account.pagarme_recipient_id,
        withdrawalId,
        idempotencyKey: withdrawalId,
      });
      if (!transfer.id) throw new PagarmeError('O provedor não retornou a transferência.');

      const providerStatus = transfer.status?.toLowerCase() || '';
      const completeNow = ['transferred', 'paid', 'completed'].includes(providerStatus);
      const { error: stateError } = await admin.rpc(
        completeNow ? 'complete_pagarme_withdrawal' : 'mark_pagarme_withdrawal_processing',
        { p_withdrawal_id: withdrawalId, p_transfer_id: transfer.id },
      );
      if (stateError) throw new ApiError('Não foi possível registrar a transferência.', 500);

      await admin.from('audit_events').insert({
        account_id: account.id,
        actor_user_id: user.id,
        event_type: completeNow ? 'withdrawal.provider_completed' : 'withdrawal.provider_processing',
        entity_type: 'withdrawal',
        entity_id: withdrawalId,
      });
      return noStoreJson({ withdrawal_id: withdrawalId, status: completeNow ? 'paid' : 'processing' }, { status: 201 });
    } catch (providerError) {
      // A timeout can still mean that the provider accepted the idempotent transfer.
      // Preserve the reserved funds in that case; never create a second transfer or credit them back blindly.
      if (providerError instanceof PagarmeError && providerError.status && providerError.status < 500) {
        await admin.rpc('fail_pagarme_withdrawal', {
          p_withdrawal_id: withdrawalId,
          p_provider_event_id: `withdrawal_failed:${withdrawalId}`,
          p_reason: 'Transferência recusada pelo provedor.',
        });
        throw new ApiError('O provedor recusou este saque. Seu saldo foi liberado novamente.', 409);
      }
      await admin.from('withdrawals').update({
        status: 'processing',
        failure_reason: 'Aguardando confirmação do provedor.',
        updated_at: new Date().toISOString(),
      }).eq('id', withdrawalId);
      return noStoreJson({ withdrawal_id: withdrawalId, status: 'processing' }, { status: 202 });
    }
  } catch (error) {
    return apiError(error);
  }
}
