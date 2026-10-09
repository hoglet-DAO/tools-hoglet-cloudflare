import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const intlMiddleware = createIntlMiddleware(routing);

export default function middleware(request: NextRequest) {
  const url = request.nextUrl.pathname;

  // API routes live under `app/api`, outside `[locale]`, so the i18n middleware must never see them.
  // Falling through to it rewrote `/api/move/compile` into `/en/api/move/compile` and returned 404 —
  // a route that does not exist in any locale.
  if (url.startsWith('/api/')) {
    const response = NextResponse.next();

    // Only the RPC proxy is cached; other endpoints decide their own headers. `/api/move/compile` is a
    // POST that must never be cached.
    if (url.startsWith('/api/rpc')) {
      // Caching Strategy for Modules (ABIs) - Highly Immutable (1 hour)
      if (url.includes('/modules')) {
        response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      }
      // Caching Strategy for Resources (Token Balances/Capabilities) - Highly Mutable (10 seconds)
      else if (url.includes('/resources')) {
        response.headers.set('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
      } else {
        response.headers.set('Cache-Control', 'public, s-maxage=2, stale-while-revalidate=5');
      }
    }

    return response;
  }

  // Fallback to i18n routing for pages
  return intlMiddleware(request);
}

export const config = {
  // Match internationalized pathnames AND api paths
  matcher: ['/', '/(ar|de|en|es|fr|hi|id|ja|ko|ru|zh|pt|ha)/:path*', '/api/:path*']
};
