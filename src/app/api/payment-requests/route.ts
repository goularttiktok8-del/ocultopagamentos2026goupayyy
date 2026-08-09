import { NextRequest } from 'next/server';
import {
  ApiError,
  apiError,
  assertSmallJsonRequest,
  createOpaqueToken,
  limitRequest,
  noStoreJson,
  parseAmountToCents,
  requireAuthenticatedUser,
  requireSameOrigin,
  sha256,
} from '@/lib/api-security';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    assertSmallJsonRequest(request);
    const user = await requireAuthenticatedUser();
    await limitRequest(request, 'payment-request-ip', 60, { windowSeconds: 3600 });
    await limitRequest(request, 'payment-request-user', 30, { windowSeconds: 3600, subject: user.id });
    const body = await request.json() as { label?: unknown; amount?: unknown; singleUse?: unknown };

    const label = typeof body.label === 'string' ? body.label.trim().replace(/\s+/g, ' ') : '';
    if (label.length < 2 || label.length > 80) throw new ApiError('Informe uma descrição entre 2 e 80 caracteres.', 400);
    const amountCents = parseAmountToCents(typeof body.amount === 'string' ? body.amount : '', { allowEmpty: true });

    const admin = createSupabaseAdminClient();
    const { data: account, error: accountError } = await admin.from('accounts')
      .select('id, status, kyc_status, pagarme_recipient_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (accountError || !account) throw new ApiError('Não foi possível localizar sua conta.', 404);
    if (account.status !== 'active' || account.kyc_status !== 'approved' || !account.pagarme_recipient_id) {
      throw new ApiError('Conclua a verificação da conta antes de criar um recebimento.', 409);
    }

    const token = createOpaqueToken();
    const { data: paymentRequest, error: insertError } = await admin.from('payment_requests').insert({
      account_id: account.id,
      public_token_hash: sha256(token),
      label,
      amount_cents: amountCents,
      single_use: body.singleUse !== false,
      status: 'active',
    }).select('id, label, amount_cents, single_use, status, created_at').single();
    if (insertError || !paymentRequest) throw new ApiError('Não foi possível criar o recebimento.', 500);

    await admin.from('audit_events').insert({
      account_id: account.id,
      actor_user_id: user.id,
      event_type: body.singleUse === false ? 'payment_request.created_reusable' : 'payment_request.created',
      entity_type: 'payment_request',
      entity_id: paymentRequest.id,
    });

    const publicUrl = new URL(`/p/${token}`, request.nextUrl.origin).toString();
    return noStoreJson({ payment_request: paymentRequest, public_url: publicUrl }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
