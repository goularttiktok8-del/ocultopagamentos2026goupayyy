import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import {
  ApiError,
  apiError,
  assertSmallJsonRequest,
  limitRequest,
  noStoreJson,
  parseAmountToCents,
  requireSameOrigin,
  sha256,
} from '@/lib/api-security';
import { createPixOrder, PagarmeError } from '@/lib/pagarme';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type PixBody = {
  amount?: unknown;
  payer?: { name?: unknown; email?: unknown; document?: unknown; phone?: unknown };
};

function validToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

function text(value: unknown, field: string, min: number, max: number) {
  const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (normalized.length < min || normalized.length > max) throw new ApiError(`Informe ${field} corretamente.`, 400);
  return normalized;
}

function platformFeeCents() {
  const raw = process.env.PLATFORM_PIX_FEE_CENTS?.trim();
  if (!raw || !/^\d{1,8}$/.test(raw)) {
    throw new ApiError('A taxa da plataforma ainda não foi configurada.', 503);
  }
  return Number(raw);
}

function paymentResponse(payment: { status: string; amount_cents: number; pix_qr_code: string | null; pix_expires_at: string | null }) {
  return {
    payment: {
      status: payment.status,
      amount_cents: Number(payment.amount_cents),
      pix_qr_code: payment.pix_qr_code,
      pix_expires_at: payment.pix_expires_at,
    },
  };
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    requireSameOrigin(request);
    assertSmallJsonRequest(request);
    await limitRequest(request, 'public-payment-pix', 5, { windowSeconds: 600 });
    const { token } = await context.params;
    if (!validToken(token)) throw new ApiError('Cobrança não encontrada.', 404);
    const body = await request.json() as PixBody;
    const payer = body.payer || {};
    const name = text(payer.name, 'seu nome', 2, 120);
    const email = text(payer.email, 'seu e-mail', 5, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError('Informe seu e-mail corretamente.', 400);
    const document = typeof payer.document === 'string' ? payer.document.replace(/\D/g, '') : '';
    if (!/^\d{11}$/.test(document)) throw new ApiError('Informe um CPF válido.', 400);
    const phone = typeof payer.phone === 'string' ? payer.phone.replace(/\D/g, '') : '';
    if (!/^\d{10,11}$/.test(phone)) throw new ApiError('Informe um celular válido.', 400);

    const admin = createSupabaseAdminClient();
    const { data: paymentRequest, error: requestError } = await admin.from('payment_requests')
      .select('id, account_id, label, amount_cents, status, expires_at')
      .eq('public_token_hash', sha256(token))
      .maybeSingle();
    if (requestError || !paymentRequest || paymentRequest.status !== 'active') throw new ApiError('Cobrança indisponível.', 404);
    if (paymentRequest.expires_at && new Date(paymentRequest.expires_at).getTime() <= Date.now()) {
      throw new ApiError('Esta cobrança expirou.', 410);
    }

    const amountCents = paymentRequest.amount_cents === null
      ? parseAmountToCents(typeof body.amount === 'string' ? body.amount : '')
      : Number(paymentRequest.amount_cents);
    if (!amountCents) throw new ApiError('Informe um valor válido.', 400);
    const feeCents = platformFeeCents();
    if (feeCents >= amountCents) throw new ApiError('O valor informado deve ser maior que a taxa da plataforma.', 400);

    const { data: account, error: accountError } = await admin.from('accounts')
      .select('id, status, kyc_status, pagarme_recipient_id')
      .eq('id', paymentRequest.account_id)
      .maybeSingle();
    if (accountError || !account || account.status !== 'active' || account.kyc_status !== 'approved' || !account.pagarme_recipient_id) {
      throw new ApiError('Cobrança indisponível.', 404);
    }
    const platformRecipientId = process.env.PLATFORM_RECIPIENT_ID?.trim();
    if (!platformRecipientId) throw new ApiError('O recebimento da plataforma ainda não foi configurado.', 503);

    const { data: existingPayment, error: paymentError } = await admin.from('payments')
      .select('id, status, amount_cents, fee_cents, net_amount_cents, provider_idempotency_key, pagarme_order_id, pix_qr_code, pix_expires_at')
      .eq('payment_request_id', paymentRequest.id)
      .eq('status', 'pending')
      .maybeSingle();
    let payment = existingPayment;
    if (paymentError) throw new ApiError('Não foi possível preparar o pagamento.', 500);

    if (!payment) {
      const { data: created, error: createError } = await admin.from('payments').insert({
        account_id: account.id,
        payment_request_id: paymentRequest.id,
        amount_cents: amountCents,
        fee_cents: feeCents,
        net_amount_cents: amountCents - feeCents,
        status: 'pending',
        payer_name: name,
        payer_document_hash: sha256(document),
        provider_idempotency_key: randomUUID(),
      }).select('id, status, amount_cents, fee_cents, net_amount_cents, provider_idempotency_key, pagarme_order_id, pix_qr_code, pix_expires_at').single();
      if (createError?.code === '23505') {
        const { data: concurrent } = await admin.from('payments')
          .select('id, status, amount_cents, fee_cents, net_amount_cents, provider_idempotency_key, pagarme_order_id, pix_qr_code, pix_expires_at')
          .eq('payment_request_id', paymentRequest.id).eq('status', 'pending').maybeSingle();
        payment = concurrent;
      } else if (createError || !created) {
        throw new ApiError('Não foi possível preparar o pagamento.', 500);
      } else {
        payment = created;
      }
    }
    if (!payment) throw new ApiError('Não foi possível preparar o pagamento.', 409);
    if (payment.pix_qr_code) return noStoreJson(paymentResponse(payment));

    const order = await createPixOrder({
      code: `op_${payment.id.replace(/-/g, '')}`,
      amountCents: Number(payment.amount_cents),
      label: paymentRequest.label,
      payer: { name, email, document, phone: { ddd: phone.slice(0, 2), number: phone.slice(2) } },
      recipientId: account.pagarme_recipient_id,
      platformRecipientId,
      platformFeeCents: Number(payment.fee_cents),
      idempotencyKey: payment.provider_idempotency_key,
      paymentId: payment.id,
      paymentRequestId: paymentRequest.id,
    });
    const charge = order.charges?.[0];
    const pix = charge?.last_transaction;
    if (!order.id || !charge?.id || !pix?.qr_code) throw new PagarmeError('O provedor não retornou um Pix válido.');

    const { data: updated, error: updateError } = await admin.from('payments').update({
      pagarme_order_id: order.id,
      pagarme_charge_id: charge.id,
      pix_qr_code: pix.qr_code,
      pix_qr_code_url: pix.qr_code_url || null,
      pix_expires_at: pix.expires_at || null,
      updated_at: new Date().toISOString(),
    }).eq('id', payment.id).select('status, amount_cents, pix_qr_code, pix_expires_at').single();
    if (updateError || !updated) throw new ApiError('Não foi possível salvar o Pix gerado.', 500);

    return noStoreJson(paymentResponse(updated), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
