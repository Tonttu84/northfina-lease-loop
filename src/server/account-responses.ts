// The envelopes of the sign-in link's refusals (D93): one `fail()` per reason of
// src/server/accounts.ts, never a raw message.
import type { SignInResult } from './accounts';
import { fail } from './api-response';

type Refusal = Extract<SignInResult, { ok: false }>['reason'];

const SIGN_IN: Record<Refusal, [number, string, string]> = {
  not_found: [404, 'LOGIN_LINK_NOT_FOUND', 'No sign-in link with that token'],
  used: [409, 'LOGIN_LINK_USED', 'The sign-in link has already been used'],
  expired: [410, 'LOGIN_LINK_EXPIRED', 'The sign-in link has expired'],
};

/** A refused sign-in through the link. */
export function signInFailure(reason: Refusal): Response {
  const [status, code, message] = SIGN_IN[reason];
  return fail(status, code, message);
}
