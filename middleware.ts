import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const intlMiddleware = createIntlMiddleware(routing);

// Estados Unidos, territorios asociados y países sancionados por OFAC
export const RESTRICTED_REGIONS = [
  'US', // United States
  'PR', // Puerto Rico
  'VI', // U.S. Virgin Islands
  'GU', // Guam
  'AS', // American Samoa
  'MP', // Northern Mariana Islands
  'CU', // Cuba
  'IR', // Iran
  'KP', // North Korea
  'SY', // Syria
  'RU', // Russia
];

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Evitar bucles en la vista de geobloqueo
  if (pathname === '/geoblocked' || pathname.endsWith('/geoblocked')) {
    return NextResponse.next();
  }

  // 2. No interceptar archivos de documentación ni bots/indexadores (robots.txt, llms.txt, etc.)
  if (pathname.endsWith('.txt')) {
    return NextResponse.next();
  }

  // 3. Extraer país de Cloudflare o Vercel (con bypass para testing local)
  const isDev =
    process.env.NODE_ENV !== 'production' ||
    request.nextUrl.hostname === 'localhost' ||
    request.nextUrl.hostname === '127.0.0.1';

  const testCountry = isDev
    ? (request.nextUrl.searchParams.get('test_country') || request.headers.get('x-test-country') || '')
    : '';

  const country = (
    testCountry ||
    request.headers.get('cf-ipcountry') ||
    request.headers.get('x-vercel-ip-country') ||
    ''
  ).trim().toUpperCase();

  // 4. Evaluar jurisdicción restringida
  if (RESTRICTED_REGIONS.includes(country)) {
    // Si la petición es hacia /api, retornar JSON 403 estructurado
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          error: 'Access to this service is restricted in your jurisdiction.',
          code: 'GEOBLOCKED',
          country,
        },
        { status: 403 }
      );
    }

    // Para navegación web, reescribir transparentemente a /geoblocked
    return NextResponse.rewrite(new URL('/geoblocked', request.url));
  }

  // 5. API routes live under `app/api`, outside `[locale]`, so the i18n middleware must never see them.
  if (pathname.startsWith('/api/')) {
    const response = NextResponse.next();

    // Only the RPC proxy is cached; other endpoints decide their own headers. `/api/move/compile` is a
    // POST that must never be cached.
    if (pathname.startsWith('/api/rpc')) {
      // Caching Strategy for Modules (ABIs) - Highly Immutable (1 hour)
      if (pathname.includes('/modules')) {
        response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      }
      // Caching Strategy for Resources (Token Balances/Capabilities) - Highly Mutable (10 seconds)
      else if (pathname.includes('/resources')) {
        response.headers.set('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
      } else {
        response.headers.set('Cache-Control', 'public, s-maxage=2, stale-while-revalidate=5');
      }
    }

    return response;
  }

  // 6. Fallback to i18n routing for pages with security headers
  const response = intlMiddleware(request);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  // Excluye assets estáticos, imágenes, fuentes y favicon
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
