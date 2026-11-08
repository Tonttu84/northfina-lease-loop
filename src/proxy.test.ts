import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '@/server/rate-limit';
import { clientKey, proxy, proxyWith } from './proxy';

const T0 = 1_700_000_000_000;
const post = (path: string, ip?: string) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: ip ? { 'x-forwarded-for': ip } : {},
  });

describe('proxy', () => {
  it('sends the bare root to the default language', () => {
    const response = proxy(new NextRequest('http://localhost/'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/en');
  });

  it('lets a read through untouched', () => {
    const response = proxy(new NextRequest('http://localhost/api/assets'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('refuses the write over the limit with 429, Retry-After and the API envelope', async () => {
    const limited = proxyWith(createRateLimiter({ limit: 2, windowMs: 60_000 }), () => T0);
    expect(limited(post('/api/quotes')).status).not.toBe(429);
    expect(limited(post('/api/quotes')).status).not.toBe(429);
    const refused = limited(post('/api/quotes'));
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('60');
    expect(await refused.json()).toMatchObject({
      success: false,
      error: { code: 'RATE_LIMITED' },
      meta: { timestamp: new Date(T0).toISOString() },
    });
  });

  it('counts each forwarded address on its own and opens a new window after a minute', () => {
    let now = T0;
    const limited = proxyWith(createRateLimiter({ limit: 1, windowMs: 60_000 }), () => now);
    expect(limited(post('/api/quotes', '10.0.0.1, 10.0.0.9')).status).not.toBe(429);
    expect(limited(post('/api/quotes', '10.0.0.2')).status).not.toBe(429);
    expect(limited(post('/api/quotes', '10.0.0.1')).status).toBe(429);
    now += 60_000;
    expect(limited(post('/api/quotes', '10.0.0.1')).status).not.toBe(429);
  });

  it('names the client by the first forwarded address, else one bucket for all', () => {
    expect(clientKey(post('/api/x', ' 10.0.0.1 , 10.0.0.2'))).toBe('10.0.0.1');
    expect(clientKey(post('/api/x'))).toBe('direct');
  });
});
