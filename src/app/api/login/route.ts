// POST /api/login   body: { "email": "aino.virtanen@example.com" }
// Asks for a sign-in link (D93). An e-mail no account has signs up: a blank consumer customer
// and its account are made with the link (D107). The answer is the same either way, so nothing
// tells a visitor which e-mails had accounts; while the demo tools are on the answer carries
// the link itself, the demo's stand-in for the e-mail (D94), and the demo page's outbox lists
// it too. Public: there is nobody to authorize yet, so anyone can make an account for any
// e-mail; the proxy rate-limits it with every other write on /api, and an account does nothing
// until its link is opened.
import { requestLoginLink } from '@/server/accounts';
import { loginBodySchema } from '@/server/account-schemas';
import { handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { demoToolsOn } from '@/server/demo-tools';

export const POST = handleRoute(async (request) => {
  const { email } = await readJsonBody(request, loginBodySchema);
  const demoTools = demoToolsOn();
  const { link } = await requestLoginLink(db, { email, today: await todayForRequest(), demoTools });
  return ok(
    {
      sent: true as const,
      demoLink: demoTools ? { token: link.token, expiresOn: link.expiresOn } : null,
    },
    { status: 202 }
  );
});
