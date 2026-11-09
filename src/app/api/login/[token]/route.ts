// GET  /api/login/:token   the link's state on the request's day (valid, used, expired)
// POST /api/login/:token   opens it: signs the visitor in as the account's actor, sets the
//                          signed session cookie (D92) and confirms the e-mail (D93)
// The token is the visitor's authority, as the signing link's is (D46): whoever holds it signs
// in. The actor cookie plays no part before; it is what the POST hands out.
import { consumeLoginLink, loginLinkState } from '@/server/accounts';
import { signInFailure } from '@/server/account-responses';
import { loginTokenParamsSchema } from '@/server/account-schemas';
import { actorCookieHeader } from '@/server/actor';
import { handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';

export const GET = handleRoute(async (_request, { params }: RouteContext<'/api/login/[token]'>) => {
  const { token } = loginTokenParamsSchema.parse(await params);
  const state = await loginLinkState(db, token, await todayForRequest());
  if (!state) return signInFailure('not_found');
  return ok(state);
});

export const POST = handleRoute(
  async (_request, { params }: RouteContext<'/api/login/[token]'>) => {
    const { token } = loginTokenParamsSchema.parse(await params);
    const result = await consumeLoginLink(db, { token, today: await todayForRequest() });
    if (!result.ok) return signInFailure(result.reason);
    return ok(
      { actor: result.actor, emailConfirmed: true as const, confirmedNow: result.confirmedNow },
      { headers: { 'Set-Cookie': actorCookieHeader(result.actor) } }
    );
  }
);
