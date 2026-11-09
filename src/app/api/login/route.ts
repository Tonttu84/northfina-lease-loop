// POST /api/login   body: { "email": "aino.virtanen@example.com" }
// Asks for a sign-in link (D93). The answer is the same whether or not an account has that
// e-mail, so nothing tells a visitor which e-mails have accounts; while the demo tools are on
// and the account exists, the answer carries the link itself, the demo's stand-in for the
// e-mail (D94), and the demo page's outbox lists it too. Public: there is nobody to authorize
// yet. The proxy rate-limits it with every other write on /api.
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
      demoLink: link && demoTools ? { token: link.token, expiresOn: link.expiresOn } : null,
    },
    { status: 202 }
  );
});
