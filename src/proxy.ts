import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const publicPaths = new Set(['/login', '/cadastro', '/auth/confirm']);

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isPublic = publicPaths.has(pathname);

  if (!user && !isPublic) {
    const target = request.nextUrl.clone();
    target.pathname = '/login';
    target.searchParams.set('next', pathname);
    return NextResponse.redirect(target);
  }
  if (user && isPublic && pathname !== '/auth/confirm') {
    const target = request.nextUrl.clone(); target.pathname = '/dashboard'; target.search = '';
    return NextResponse.redirect(target);
  }
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'] };
