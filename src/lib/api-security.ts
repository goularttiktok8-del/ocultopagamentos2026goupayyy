import { createHash, createHmac, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    const response = noStoreJson({ error: error.message }, { status: error.status });
    if (error.retryAfterSeconds) response.headers.set('Retry-After', String(error.retryAfterSeconds));
    return response;
  }

  // Do not pass provider, database, or validation implementation details to the browser.
  return noStoreJson({ error: 'Não foi possível concluir esta operação agora.' }, { status: 500 });
}

export async function requireAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new ApiError('Sessão inválida ou expirada.', 401);
  return user;
}

export function requireSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) throw new ApiError('Origem da solicitação não confirmada.', 403);

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new ApiError('Origem da solicitação não confirmada.', 403);
  }

  if (originUrl.protocol !== request.nextUrl.protocol || originUrl.host !== request.nextUrl.host) {
    throw new ApiError('Origem da solicitação não permitida.', 403);
  }
}

type RateLimitOptions = {
  windowSeconds?: number;
  subject?: string;
};

function clientAddress(request: NextRequest) {
  // Vercel provides this header from its edge. The fallbacks keep local development usable.
  const vercelAddress = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return vercelAddress || forwardedFor || request.headers.get('x-real-ip') || 'unknown';
}

function protectedRateLimitKey(bucket: string, identity: string) {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new ApiError('O serviço de segurança está indisponível.', 503);

  return `v1:${createHmac('sha256', secret).update(`${bucket}:${identity}`).digest('base64url')}`;
}

/**
 * A durable, atomic counter stored in Supabase. Unlike an in-memory Map, it is
 * shared by all Vercel function instances and never stores the raw IP/user id.
 */
export async function limitRequest(
  request: NextRequest,
  bucket: string,
  limit: number,
  { windowSeconds = 60, subject }: RateLimitOptions = {},
) {
  if (!/^[a-z0-9-]{3,64}$/.test(bucket) || !Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86_400) {
    throw new ApiError('O serviço de segurança está indisponível.', 503);
  }

  const identity = subject ? `user:${subject}` : `ip:${clientAddress(request)}`;
  const { data, error } = await createSupabaseAdminClient().rpc('check_api_rate_limit', {
    p_rate_key: protectedRateLimitKey(bucket, identity),
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  const result = Array.isArray(data) ? data[0] : null;
  if (error || !result || typeof result.allowed !== 'boolean') {
    // Fail closed: sensitive endpoints must not become unprotected when the limiter fails.
    throw new ApiError('O serviço de segurança está indisponível. Tente novamente em instantes.', 503);
  }
  if (!result.allowed) {
    const retryAfter = typeof result.retry_after_seconds === 'number'
      ? Math.max(1, Math.ceil(result.retry_after_seconds))
      : windowSeconds;
    throw new ApiError('Muitas tentativas. Aguarde antes de tentar novamente.', 429, retryAfter);
  }
}

export function assertSmallJsonRequest(request: NextRequest, maxBytes = 12_000) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (!Number.isFinite(contentLength) || contentLength > maxBytes) {
    throw new ApiError('Solicitação inválida.', 413);
  }
}

export function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function noStoreJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Vary', 'Cookie');
  return response;
}

export function parseAmountToCents(value: unknown, { allowEmpty = false }: { allowEmpty?: boolean } = {}) {
  if (typeof value !== 'string') throw new ApiError('Informe um valor válido.', 400);
  const raw = value.trim();
  if (!raw && allowEmpty) return null;
  // Values are entered in Brazilian notation. Reject an ambiguous dot-decimal
  // value instead of silently turning "1.20" into R$ 120,00.
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw)) {
    throw new ApiError('Informe um valor válido.', 400);
  }
  const normalized = raw.replace(/\./g, '').replace(',', '.');

  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents < 100 || cents > 100_000_000) {
    throw new ApiError('O valor deve estar entre R$ 1,00 e R$ 1.000.000,00.', 400);
  }
  return cents;
}
