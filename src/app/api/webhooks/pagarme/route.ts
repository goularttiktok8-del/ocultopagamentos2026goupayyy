import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';
import { ApiError, apiError, limitRequest, noStoreJson, sha256 } from '@/lib/api-security';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type ProviderEvent = { id?: unknown; type?: unknown; data?: unknown; created_at?: unknown };
type ObjectMap = Record<string, unknown>;

function asObject(value: unknown): ObjectMap {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectMap : {};
}

function asText(value: unknown, max = 300) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isValidSignature(rawBody: string, provided: string, secret: string) {
  const normalized = provided.includes('=') ? provided.split('=').slice(1).join('=').trim() : provided.trim();
  return [
    createHmac('sha1', secret).update(rawBody).digest('hex'),
    createHmac('sha256', secret).update(rawBody).digest('hex'),
  ].some((signature) => safeEqual(signature, normalized));
}

function validBasicAuth(request: NextRequest, user: string, password: string) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return false;
  const provided = Buffer.from(header.slice(6));
  const expected = Buffer.from(Buffer.from(`${user}:${password}`).toString('base64'));
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function recipientState(status: string, kycStatus: string) {
  if (status === 'active') return { accountStatus: 'active', kyc: 'approved' } as const;
  if (status === 'refused') return { accountStatus: 'refused', kyc: 'denied' } as const;
  if (status === 'blocked') return { accountStatus: 'blocked', kyc: 'pending' } as const;
  if (status === 'suspended' || status === 'inactive') return { accountStatus: 'restricted', kyc: 'pending' } as const;
  if (status === 'affiliation' && kycStatus === 'partially_denied') return { accountStatus: 'pending_kyc', kyc: 'additional_documents_required' } as const;
  return { accountStatus: 'pending_kyc', kyc: 'pending' } as const;
}

function providerEventId(type: string, event: ProviderEvent, rawBody: string) {
  const id = asText(event.id, 160);
  return id ? `${type}:${id}` : `${type}:${sha256(rawBody)}`;
}

function providerDate(value: unknown) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function handleRecipientUpdated(data: ObjectMap, eventId: string) {
  const recipientId = asText(data.id, 190);
  const providerStatus = asText(data.status, 80);
  const kyc = asObject(data.kyc_details);
  const providerKycStatus = asText(kyc.status, 80);
  if (!recipientId || !providerStatus) throw new ApiError('Payload inválido.', 400);

  const admin = createSupabaseAdminClient();
  const { data: account, error: accountError } = await admin.from('accounts')
    .select('id').eq('pagarme_recipient_id', recipientId).maybeSingle();
  // Do not disclose whether an unrelated Pagar.me recipient belongs to this application.
  if (accountError || !account) return;

  const mapped = recipientState(providerStatus, providerKycStatus);
  const reason = asText(kyc.status_reason, 300) || null;
  const { error: updateError } = await admin.from('accounts').update({
    status: mapped.accountStatus,
    kyc_status: mapped.kyc,
    kyc_status_reason: reason,
    updated_at: new Date().toISOString(),
  }).eq('id', account.id);
  if (updateError) throw new ApiError('Não foi possível processar o evento.', 500);

  const { error: eventError } = await admin.from('kyc_events').insert({
    account_id: account.id,
    status: mapped.kyc,
    provider_event_id: eventId,
    reason,
  });
  if (eventError && eventError.code !== '23505') throw new ApiError('Não foi possível registrar o evento.', 500);
}

async function handlePaymentPaid(type: string, data: ObjectMap, eventId: string, createdAt: string | null) {
  const charges = Array.isArray(data.charges) ? data.charges : [];
  const firstCharge = asObject(charges[0]);
  const nestedCharge = asObject(data.charge);
  const orderId = type.startsWith('order.') ? asText(data.id, 190) : asText(data.order_id, 190);
  const chargeId = asText(firstCharge.id || nestedCharge.id || data.id, 190);
  if (!orderId && !chargeId) throw new ApiError('Payload inválido.', 400);

  const admin = createSupabaseAdminClient();
  let query = admin.from('payments').select('id, amount_cents');
  query = orderId ? query.eq('pagarme_order_id', orderId) : query.eq('pagarme_charge_id', chargeId);
  const { data: payment, error } = await query.maybeSingle();
  if (error || !payment) return;
  const amount = typeof data.amount === 'number' ? data.amount : typeof data.paid_amount === 'number' ? data.paid_amount : null;
  if (amount !== null && Number(payment.amount_cents) !== amount) throw new ApiError('Valor do evento não confere.', 422);

  const paidAt = providerDate(firstCharge.paid_at) || providerDate(data.paid_at) || createdAt;
  const { error: settleError } = await admin.rpc('settle_pagarme_payment', {
    p_order_id: orderId || null,
    p_charge_id: chargeId || null,
    p_provider_event_id: eventId,
    p_paid_at: paidAt,
  });
  if (settleError) throw new ApiError('Não foi possível registrar o pagamento.', 500);
}

async function handlePaymentFailed(type: string, data: ObjectMap) {
  const charges = Array.isArray(data.charges) ? data.charges : [];
  const firstCharge = asObject(charges[0]);
  const orderId = type.startsWith('order.') ? asText(data.id, 190) : asText(data.order_id, 190);
  const chargeId = asText(firstCharge.id || data.id, 190);
  if (!orderId && !chargeId) throw new ApiError('Payload inválido.', 400);

  const { error } = await createSupabaseAdminClient().rpc('fail_pagarme_payment', {
    p_order_id: orderId || null,
    p_charge_id: chargeId || null,
    p_reason: type,
  });
  if (error) throw new ApiError('Não foi possível registrar a falha.', 500);
}

async function handlePaymentRefunded(data: ObjectMap, eventId: string) {
  const chargeId = asText(data.id, 190);
  if (!chargeId) throw new ApiError('Payload inválido.', 400);
  const { error } = await createSupabaseAdminClient().rpc('refund_pagarme_payment', {
    p_charge_id: chargeId,
    p_provider_event_id: eventId,
    p_reason: 'Pagamento estornado pelo provedor.',
  });
  if (error) throw new ApiError('Não foi possível registrar o estorno.', 500);
}

async function handleTransferEvent(type: string, data: ObjectMap, eventId: string) {
  const transferId = asText(data.id, 190);
  const providerStatus = asText(data.status, 80).toLowerCase();
  if (!transferId) throw new ApiError('Payload inválido.', 400);

  const admin = createSupabaseAdminClient();
  const { data: withdrawal, error } = await admin.from('withdrawals')
    .select('id').eq('pagarme_transfer_id', transferId).maybeSingle();
  if (error || !withdrawal) return;

  if (['transferred', 'paid', 'completed'].includes(providerStatus) || type.endsWith('.transferred')) {
    const { error: completeError } = await admin.rpc('complete_pagarme_withdrawal', {
      p_withdrawal_id: withdrawal.id, p_transfer_id: transferId,
    });
    if (completeError) throw new ApiError('Não foi possível concluir o saque.', 500);
  } else if (['failed', 'canceled', 'cancelled', 'refused'].includes(providerStatus) || type.endsWith('.failed') || type.endsWith('.canceled')) {
    const { error: failError } = await admin.rpc('fail_pagarme_withdrawal', {
      p_withdrawal_id: withdrawal.id,
      p_provider_event_id: eventId,
      p_reason: 'Transferência não concluída pelo provedor.',
    });
    if (failError) throw new ApiError('Não foi possível reverter o saque.', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    await limitRequest(request, 'pagarme-webhook', 300);
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (!Number.isFinite(contentLength) || contentLength > 1_000_000) throw new ApiError('Payload inválido.', 413);
    const rawBody = await request.text();

    const secret = process.env.PAGARME_WEBHOOK_SECRET?.trim();
    const basicUser = process.env.PAGARME_WEBHOOK_USER?.trim();
    const basicPass = process.env.PAGARME_WEBHOOK_PASS?.trim();
    const signature = request.headers.get('x-hub-signature') || request.headers.get('x-pagarme-signature');
    const authenticatedBySignature = Boolean(secret && signature && isValidSignature(rawBody, signature, secret));
    const authenticatedByBasic = Boolean(basicUser && basicPass && validBasicAuth(request, basicUser, basicPass));
    if (!authenticatedBySignature && !authenticatedByBasic) throw new ApiError('Não autorizado.', 401);

    let event: ProviderEvent;
    try { event = JSON.parse(rawBody) as ProviderEvent; }
    catch { throw new ApiError('Payload inválido.', 400); }
    const type = asText(event.type, 80);
    if (!type) throw new ApiError('Payload inválido.', 400);
    const data = asObject(event.data);
    const eventId = providerEventId(type, event, rawBody);
    const createdAt = providerDate(event.created_at);

    if (type === 'recipient.updated') await handleRecipientUpdated(data, eventId);
    else if (type === 'order.paid' || type === 'charge.paid') await handlePaymentPaid(type, data, eventId, createdAt);
    else if (type === 'order.payment_failed' || type === 'order.canceled' || type === 'charge.payment_failed') await handlePaymentFailed(type, data);
    else if (type === 'charge.refunded') await handlePaymentRefunded(data, eventId);
    else if (type.startsWith('transfer.')) await handleTransferEvent(type, data, eventId);

    return noStoreJson({ received: true });
  } catch (error) {
    return apiError(error);
  }
}
