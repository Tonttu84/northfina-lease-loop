import { describe, expect, it } from 'vitest';
import { secureFlag } from './cookie-flags';

describe('secureFlag', () => {
  it('marks the cookie Secure on a production build', () => {
    expect(secureFlag({ NODE_ENV: 'production' })).toBe('; Secure');
  });

  it.each(['development', 'test', undefined])(
    'adds nothing under NODE_ENV=%s (plain http)',
    (env) => {
      expect(secureFlag({ NODE_ENV: env })).toBe('');
    }
  );
});
