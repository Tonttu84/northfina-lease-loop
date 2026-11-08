// POST /api/demo/clock   body: { "asOf": "2026-09-15" } to travel, { "asOf": null } to go back.
// Sets or clears the demo clock cookie; every page and route reads it once per request
// through todayForRequest(). The only endpoint that accepts a date from the browser.
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { demoClockCookieHeader } from '@/server/demo-clock';
import { demoToolsOn } from '@/server/demo-tools';
import { demoClockBodySchema } from '@/server/routes';
import { todayIso } from '@/server/today';

export const POST = handleRoute(async (request) => {
  // D74: a demo tool, off in a production build unless DEMO_TOOLS=1, as the card runner is.
  if (!demoToolsOn()) return fail(404, 'NOT_FOUND', 'The demo tools are off');
  const { asOf } = await readJsonBody(request, demoClockBodySchema);
  const headers = { 'Set-Cookie': demoClockCookieHeader(asOf) };
  return ok({ asOf, today: asOf ?? todayIso() }, { headers });
});
