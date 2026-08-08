import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';
import { ApiError, apiError, limitRequest, noStoreJson, sha256 } from '@/lib/api-security';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type RecipientEvent = {
  id?: unknown;
  type?: unknown;
  data?: {
    id?: unknown;
    status?: unknown;
    kyc_details?: { status?: unknown; status_reason?: unknown };
  };
};

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isValidSignature(rawBody: string, provided: string, secret: string) {
  const normalized = provided.includes('=') ? provided.split('=').slice(1).join('=').trim() : provided.trim();
  const signatures = [
    createHmac('sha1', secret).update(rawBody).digest('hex'),
    createHmac('sha256', secret).update(rawBody).digest('hex'),
  ];
  return signatures.some((signature) => safeEqual(signature, normalized));
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

export async function POST(request: NextRequest) {
  try {
    limitRequest(request, 'pagarme-webhook', 120);
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

    let event: RecipientEvent;
    try { event = JSON.parse(rawBody) as RecipientEvent; }
    catch { throw new ApiError('Payload inválido.', 400); }
    if (event.type !== 'recipient.updated') return noStoreJson({ received: true });

    const recipientId = typeof event.data?.id === 'string' ? event.data.id : '';
    const providerStatus = typeof event.data?.status === 'string' ? event.data.status : '';
    const providerKycStatus = typeof event.data?.kyc_details?.status === 'string' ? event.data.kyc_details.status : '';
    if (!recipientId || !providerStatus) throw new ApiError('Payload inválido.', 400);

    const mapped = recipientState(providerStatus, providerKycStatus);
    const eventId = typeof event.id === 'string' && event.id.length <= 190
      ? `recipient.updated:${event.id}`
      : `recipient.updated:${sha256(rawBody)}`;
    const reason = typeof event.data?.kyc_details?.status_reason === 'string'
      ? event.data.kyc_details.status_reason.slice(0, 300)
      : null;

    const admin = createSupabaseAdminClient();
    const { data: account, error: accountError } = await admin.from('accounts')
      .select('id')
      .eq('pagarme_recipient_id', recipientId)
      .maybeSingle();
    // A valid event for a recipient belonging to another application must not leak information.
    if (accountError || !account) return noStoreJson({ received: true });

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

    await admin.from('audit_events').insert({
      account_id: account.id,
      event_type: 'kyc.provider_status_updated',
      entity_type: 'account',
      entity_id: account.id,
    });
    return noStoreJson({ received: true });
  } catch (error) {
    return apiError(error);
  }
}
