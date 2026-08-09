import { NextRequest } from 'next/server';
import { ApiError, apiError, assertSmallJsonRequest, limitRequest, noStoreJson, requireAuthenticatedUser, requireSameOrigin } from '@/lib/api-security';
import { createKycLink, PagarmeError } from '@/lib/pagarme';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    assertSmallJsonRequest(request, 1_000);
    const user = await requireAuthenticatedUser();
    await limitRequest(request, 'kyc-link-ip', 20, { windowSeconds: 3600 });
    await limitRequest(request, 'kyc-link-user', 5, { windowSeconds: 3600, subject: user.id });
    const admin = createSupabaseAdminClient();
    const { data: account, error } = await admin.from('accounts')
      .select('id, pagarme_recipient_id, status, kyc_status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error || !account) throw new ApiError('Não foi possível localizar sua conta.', 404);
    if (!account.pagarme_recipient_id || account.status !== 'pending_kyc' || account.kyc_status !== 'additional_documents_required') {
      throw new ApiError('A etapa de prova de vida ainda não está disponível.', 409);
    }

    const link = await createKycLink(account.pagarme_recipient_id);
    if (!link.url || !/^https:\/\//.test(link.url)) throw new ApiError('Não foi possível preparar a verificação.', 502);
    await admin.from('audit_events').insert({
      account_id: account.id,
      actor_user_id: user.id,
      event_type: 'kyc.link_created',
      entity_type: 'account',
      entity_id: account.id,
    });
    return noStoreJson({ url: link.url, expires_at: link.expiration_date || null });
  } catch (error) {
    if (error instanceof PagarmeError) return noStoreJson({ error: error.message }, { status: error.status || 503 });
    return apiError(error);
  }
}
