import { NextRequest } from 'next/server';
import { ApiError, apiError, limitRequest, noStoreJson, sha256 } from '@/lib/api-security';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    limitRequest(request, 'public-payment-view', 60);
    const { token } = await context.params;
    if (!validToken(token)) throw new ApiError('Cobrança não encontrada.', 404);

    const admin = createSupabaseAdminClient();
    const { data: paymentRequest, error } = await admin.from('payment_requests')
      .select('id, account_id, label, amount_cents, status, expires_at')
      .eq('public_token_hash', sha256(token))
      .maybeSingle();
    if (error || !paymentRequest || paymentRequest.status !== 'active') throw new ApiError('Cobrança indisponível.', 404);
    if (paymentRequest.expires_at && new Date(paymentRequest.expires_at).getTime() <= Date.now()) {
      throw new ApiError('Esta cobrança expirou.', 410);
    }

    const [{ data: account }, { data: payment }] = await Promise.all([
      admin.from('accounts').select('status, kyc_status').eq('id', paymentRequest.account_id).maybeSingle(),
      admin.from('payments')
        .select('status, amount_cents, pix_qr_code, pix_expires_at')
        .eq('payment_request_id', paymentRequest.id)
        .in('status', ['pending', 'paid'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!account || account.status !== 'active' || account.kyc_status !== 'approved') {
      throw new ApiError('Cobrança indisponível.', 404);
    }

    return noStoreJson({
      payment_request: {
        label: paymentRequest.label,
        amount_cents: paymentRequest.amount_cents,
        expires_at: paymentRequest.expires_at,
      },
      payment: payment ? {
        status: payment.status,
        amount_cents: payment.amount_cents,
        pix_qr_code: payment.pix_qr_code,
        pix_expires_at: payment.pix_expires_at,
      } : null,
    });
  } catch (error) {
    return apiError(error);
  }
}
