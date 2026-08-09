import { NextRequest, NextResponse } from 'next/server';
import { apiError, limitRequest, requireAuthenticatedUser, requireSameOrigin } from '@/lib/api-security';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const user = await requireAuthenticatedUser();
    await limitRequest(request, 'signout-user', 20, { subject: user.id });
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    const response = NextResponse.redirect(new URL('/login', request.url), { status: 303 });
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  } catch (error) {
    return apiError(error);
  }
}
