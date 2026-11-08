// Next.js 16 "proxy" (it was called middleware before Next 16). It runs before routing, for two
// things: the bare root URL goes to the default language (`/` → `/en`), and the writes on /api
// are rate-limited per client (docs/features/security.md), a fixed window in this process, which
// is enough for one instance on one SQLite file. A refusal is the API envelope with 429 and a
// Retry-After, so a client reads it like any other refusal. Picking the language from the
// Accept-Language header would also go here.
import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale } from '@/i18n/locales';
import { API_WRITE_LIMIT, createRateLimiter, type RateLimiter } from '@/server/rate-limit';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The client as far as the proxy can tell: the first address of X-Forwarded-For. Next's server
 * fills that header from the socket when a request carries none, so each address has its own
 * window; a client that sends the header picks its own bucket, which makes the limit a nuisance
 * bar against a careless script, not a guarantee (docs/features/security.md). `direct` only when
 * the header is missing altogether.
 */
export function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'direct';
}

export function proxyWith(limiter: RateLimiter, now: () => number = Date.now) {
  return function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    if (pathname === '/') return NextResponse.redirect(new URL(`/${defaultLocale}`, request.url));
    if (pathname.startsWith('/api/') && !SAFE_METHODS.has(request.method)) {
      const answer = limiter.take(clientKey(request), now());
      if (!answer.ok) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'RATE_LIMITED', message: 'Too many requests; try again shortly' },
            meta: { timestamp: new Date(now()).toISOString() },
          },
          { status: 429, headers: { 'Retry-After': String(answer.retryAfterSeconds) } }
        );
      }
    }
    return NextResponse.next();
  };
}

export const proxy = proxyWith(createRateLimiter(API_WRITE_LIMIT));

export const config = {
  matcher: ['/', '/api/:path*'],
};
