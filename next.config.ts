import type { NextConfig } from 'next';

// The security headers of every response (docs/features/security.md). The app loads no
// third-party script, style, font or image (next/font serves the fonts from here), so one static
// policy holds: scripts and styles from this origin only (Next's own inline bootstrap needs
// 'unsafe-inline'; development also needs 'unsafe-eval' for fast refresh and data/blob images for
// its overlay), no framing by anyone, forms and base URLs only here. HSTS only on a production
// build, since local development is plain http. `securityHeadersFor` takes the build as its
// argument so the test can hold both branches to this.
export type Header = { key: string; value: string };

export function securityHeadersFor(production: boolean): Header[] {
  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${production ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self'${production ? '' : ' data: blob:'}`,
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    ...(production
      ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
      : []),
  ];
}

/** The signing link's token is in the path: nothing of that URL leaves the page. */
export const SIGN_PAGE_HEADERS: Header[] = [{ key: 'Referrer-Policy', value: 'no-referrer' }];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeadersFor(process.env.NODE_ENV === 'production') },
      // Matches /en/sign/… and the others; it also matches /api/sign/…, which is as well.
      { source: '/:locale/sign/:path*', headers: SIGN_PAGE_HEADERS },
    ];
  },
};

export default nextConfig;
