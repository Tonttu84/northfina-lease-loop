// POST   /api/actor   body: { "actor": "cust-aino" } or { "actor": "admin" }
//        Sets the `lease-loop-actor` cookie (D17: no login, the picker says who is acting);
//        since D92 the cookie carries a signed, expiring session. A demo tool since D93:
//        404 while DEMO_TOOLS is off, when the sign-in link is the way in.
// DELETE /api/actor   Clears it, so the visitor is `anonymous` again: the sign-out, always on.
import {
  ANONYMOUS_ACTOR,
  actorCookieHeader,
  clearActorCookieHeader,
  resolveKnownActor,
} from '@/server/actor';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { demoToolsOn } from '@/server/demo-tools';
import { actorBodySchema } from '@/server/routes';

export const POST = handleRoute(async (request) => {
  if (!demoToolsOn()) return fail(404, 'NOT_FOUND', 'The demo tools are off');
  const { actor } = await readJsonBody(request, actorBodySchema);
  // `anonymous` is what nobody reads as, never a choice: the picker clears the cookie instead.
  if (actor === ANONYMOUS_ACTOR || (await resolveKnownActor(db, actor)) !== actor) {
    return fail(404, 'UNKNOWN_ACTOR', 'No customer with that id');
  }
  return ok({ actor }, { headers: { 'Set-Cookie': actorCookieHeader(actor) } });
});

export const DELETE = handleRoute(async () =>
  ok({ actor: ANONYMOUS_ACTOR }, { headers: { 'Set-Cookie': clearActorCookieHeader() } })
);
