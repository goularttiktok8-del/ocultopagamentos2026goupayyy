import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const publicPaths = new Set(['/', '/login', '/cadastro', '/recuperar-senha', '/auth/confirm']);

function isPublicPath(pathname: string) {
  return publicPaths.has(pathname) || pathname.startsWith('/p/');
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims verifies the JWT before the page is considered authenticated.
  const { data: claims } = await supabase.auth.getClaims();
  const pathname = request.nextUrl.pathname;
  const isPublic = isPublicPath(pathname);

  if (!claims?.claims && !isPublic) {
    const target = request.nextUrl.clone();
    target.pathname = '/login';
    target.searchParams.set('next', pathname);
    return NextResponse.redirect(target);
  }
  if (claims?.claims && isPublic && !pathname.startsWith('/p/') && pathname !== '/auth/confirm') {
    const target = request.nextUrl.clone(); target.pathname = '/dashboard'; target.search = '';
    return NextResponse.redirect(target);
  }
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'] };
