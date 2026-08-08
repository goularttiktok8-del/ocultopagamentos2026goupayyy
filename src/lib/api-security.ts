import { createHash, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const WINDOW_MS = 60_000;
const requests = new Map<string, { count: number; resetAt: number }>();

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  // Do not pass provider, database, or validation implementation details to the browser.
  return NextResponse.json({ error: 'Não foi possível concluir esta operação agora.' }, { status: 500 });
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

export function limitRequest(request: NextRequest, bucket: string, limit: number) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwardedFor || request.headers.get('x-real-ip') || 'unknown';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = requests.get(key);

  if (!entry || entry.resetAt <= now) {
    requests.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  entry.count += 1;
  if (entry.count > limit) {
    throw new ApiError('Muitas tentativas. Aguarde um minuto e tente novamente.', 429);
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
