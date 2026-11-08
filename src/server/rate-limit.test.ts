import { describe, expect, it } from 'vitest';
import { API_WRITE_LIMIT, createRateLimiter } from './rate-limit';

const T0 = 1_000_000;

describe('createRateLimiter', () => {
  it('lets `limit` requests through in a window and refuses the next with the seconds to wait', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.take('a', T0)).toEqual({ ok: true, remaining: 2 });
    expect(limiter.take('a', T0 + 1_000)).toEqual({ ok: true, remaining: 1 });
    expect(limiter.take('a', T0 + 2_000)).toEqual({ ok: true, remaining: 0 });
    expect(limiter.take('a', T0 + 2_500)).toEqual({ ok: false, retryAfterSeconds: 58 });
  });

  it('counts each client on its own', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.take('a', T0).ok).toBe(true);
    expect(limiter.take('b', T0).ok).toBe(true);
    expect(limiter.take('a', T0 + 1).ok).toBe(false);
  });

  it('opens a new window once the old one has ended', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.take('a', T0).ok).toBe(true);
    expect(limiter.take('a', T0 + 59_999).ok).toBe(false);
    expect(limiter.take('a', T0 + 60_000)).toEqual({ ok: true, remaining: 0 });
  });

  it('waits at least one second, never zero', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });
    limiter.take('a', T0);
    expect(limiter.take('a', T0 + 999)).toEqual({ ok: false, retryAfterSeconds: 1 });
  });

  it('forgets the ended windows when many clients have been seen', () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 1_000, maxClients: 3 });
    limiter.take('a', T0);
    limiter.take('b', T0);
    limiter.take('c', T0);
    expect(limiter.size()).toBe(3);
    limiter.take('d', T0 + 1_000); // a, b and c ended; d opens
    expect(limiter.size()).toBe(1);
  });

  it('never holds more clients than maxClients, even when no window has ended', () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, maxClients: 3 });
    limiter.take('a', T0);
    limiter.take('b', T0 + 1);
    limiter.take('c', T0 + 2);
    limiter.take('d', T0 + 3); // the oldest open window, a, goes
    expect(limiter.size()).toBe(3);
    expect(limiter.take('b', T0 + 4)).toEqual({ ok: true, remaining: 3 }); // b kept its count
    expect(limiter.take('a', T0 + 5)).toEqual({ ok: true, remaining: 4 }); // a starts over
    expect(limiter.size()).toBe(3);
  });

  it('the API rule allows a whole demo per minute', () => {
    expect(API_WRITE_LIMIT).toEqual({ limit: 120, windowMs: 60_000 });
  });
});
