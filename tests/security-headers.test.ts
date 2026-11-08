// Every response carries the security headers (docs/features/security.md), on both builds; the
// signing page adds a stricter referrer policy, since its token is in the URL.
import { describe, expect, it } from 'vitest';
import config, { securityHeadersFor, SIGN_PAGE_HEADERS } from '../next.config';

const csp = (production: boolean) =>
  securityHeadersFor(production).find((header) => header.key === 'Content-Security-Policy')
    ?.value ?? '';

describe('securityHeadersFor', () => {
  it.each([true, false])(
    'production=%s: the policy, nosniff, no framing, a referrer policy, a permissions policy',
    (production) => {
      const keys = securityHeadersFor(production).map((header) => header.key);
      expect(keys).toEqual(
        expect.arrayContaining([
          'Content-Security-Policy',
          'X-Content-Type-Options',
          'X-Frame-Options',
          'Referrer-Policy',
          'Permissions-Policy',
        ])
      );
      for (const directive of [
        "default-src 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "font-src 'self'",
        "connect-src 'self'",
      ]) {
        expect(csp(production)).toContain(directive);
      }
      expect(csp(production)).not.toMatch(/https?:/);
    }
  );

  it('a production build allows no eval and no data or blob images, and sends HSTS', () => {
    expect(csp(true)).not.toContain("'unsafe-eval'");
    expect(csp(true)).toContain("img-src 'self';");
    expect(securityHeadersFor(true)).toContainEqual({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains',
    });
  });

  it('development allows eval and data/blob images for fast refresh and the overlay, no HSTS', () => {
    expect(csp(false)).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp(false)).toContain("img-src 'self' data: blob:");
    expect(securityHeadersFor(false).some((h) => h.key === 'Strict-Transport-Security')).toBe(
      false
    );
  });
});

describe('next.config.ts headers()', () => {
  it('applies the build headers to every route and the referrer rule to the signing page', async () => {
    if (!config.headers) throw new Error('next.config.ts sets no headers');
    const rules = await config.headers();
    expect(rules[0]).toEqual({
      source: '/(.*)',
      headers: securityHeadersFor(process.env.NODE_ENV === 'production'),
    });
    expect(rules[1]).toEqual({ source: '/:locale/sign/:path*', headers: SIGN_PAGE_HEADERS });
    expect(SIGN_PAGE_HEADERS).toEqual([{ key: 'Referrer-Policy', value: 'no-referrer' }]);
  });
});
