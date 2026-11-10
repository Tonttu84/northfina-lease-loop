// Every page at every viewport in every language (docs/features/responsive-layout.md): from a
// 320 px phone to a 2560 px screen, landscape, and with the reader's text at 150 % and 200 % (the
// browser's own text size setting). A page passes when no check in e2e/layout.ts finds anything:
// no sideways scroll, nothing sticking out of the viewport (not even during an animation), no text
// escaping its box, no tap target under 24 px on a phone, no text that ignores the reader's size.
// What the content does with a wide screen is measured and attached to the report
// (`layout-metrics`), not asserted: that is a design rule, not breakage.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  checkLayout,
  checkTextScales,
  LOCALES,
  useViewport,
  VIEWPORTS,
  type LayoutMetrics,
  type LayoutProblem,
} from './layout';

test.describe.configure({ timeout: 300_000 });

type Setup = (
  page: Page,
  helpers: { actAs: (actor: string | null) => Promise<void> }
) => Promise<string>;

/** Runs a scenario card through its route and answers the run's data (actor and clock are set). */
async function runCardByRoute(page: Page, cardId: number) {
  const response = await page.request.post(`/api/demo/cards/${cardId}/run`, { data: {} });
  expect(response.ok(), `card ${cardId}: ${response.status()}`).toBeTruthy();
  return (await response.json()).data as {
    landing: string;
    steps: { code: string; href?: string }[];
  };
}

/** The page (path without the locale) and how to get there: who acts, which card has run. */
const PAGES: Record<string, Setup> = {
  home: async () => '/',
  catalogue: async () => '/catalogue',
  'item (ebike-001)': async () => '/assets/ebike-001',
  'item, a later life (ebike-008)': async () => '/assets/ebike-008',
  passport: async () => '/assets/ebike-008/passport',
  'second life (admin)': async (_page, { actAs }) => {
    await actAs('admin');
    return '/assets/ebike-008/second-life';
  },
  'apply (card 1 quote)': async (page) => {
    const run = await runCardByRoute(page, 1);
    const apply = run.steps.find((step) => step.href?.startsWith('/apply/'));
    expect(apply, 'card 1 quotes').toBeTruthy();
    return apply!.href!;
  },
  'contract (card 1)': async (page) => (await runCardByRoute(page, 1)).landing,
  'my leases (card 1, Aino)': async (page) => {
    await runCardByRoute(page, 1);
    return '/leases';
  },
  'all leases (admin)': async (page, { actAs }) => {
    await runCardByRoute(page, 1);
    await actAs('admin');
    return '/leases';
  },
  'customer portal (admin on Aino)': async (page, { actAs }) => {
    await runCardByRoute(page, 1);
    await actAs('admin');
    return '/customers/cust-aino';
  },
  'application awaiting the signatory (card 6, admin)': async (page, { actAs }) => {
    const run = await runCardByRoute(page, 6);
    await actAs('admin');
    return run.landing;
  },
  'signing link (card 6)': async (page, { actAs }) => {
    const run = await runCardByRoute(page, 6);
    await actAs('admin');
    await page.goto(`/en${run.landing}`);
    const href = await page
      .getByRole('link', { name: 'Open the signing link' })
      .getAttribute('href');
    return href!.replace(/^\/en/, '');
  },
  'signatories (admin on Kettu Koodi)': async (_page, { actAs }) => {
    await actAs('admin');
    return '/customers/cust-kettukoodi/signatories';
  },
  'demo page with the outbox': async (page) => {
    await page.request.post('/api/login', { data: { email: 'aino.virtanen@example.com' } });
    await page.request.post('/api/login', { data: { email: 'backoffice@leaseloop.example' } });
    return '/demo';
  },
  'audit log (after card 1)': async (page) => {
    await runCardByRoute(page, 1);
    return '/audit';
  },
  'sign in': async () => '/login',
  'sign-in link': async (page) => {
    const response = await page.request.post('/api/login', {
      data: { email: 'aino.virtanen@example.com' },
    });
    return `/login/${(await response.json()).data.demoLink.token}`;
  },
  'account (Aino)': async (_page, { actAs }) => {
    await actAs('cust-aino');
    return '/account';
  },
};

const format = (problems: (LayoutProblem & { where: string })[]) =>
  problems.map((p) => `  [${p.where}] ${p.check}: ${p.element} — ${p.detail}`).join('\n');

for (const [name, setup] of Object.entries(PAGES)) {
  test(`${name} lays out at every viewport`, async ({ page, actAs }, testInfo) => {
    const path = await setup(page, { actAs });
    const problems: (LayoutProblem & { where: string })[] = [];
    const metrics: (LayoutMetrics & { where: string })[] = [];

    for (const locale of LOCALES) {
      await useViewport(page, VIEWPORTS[0]!);
      await page.goto(`/${locale}${path === '/' ? '' : path}`);
      problems.push(
        ...(await checkTextScales(page)).map((p) => ({ ...p, where: `${locale} any width` }))
      );
      for (const viewport of VIEWPORTS) {
        await useViewport(page, viewport);
        const report = await checkLayout(page, { phone: viewport.width <= 430 });
        const where = `${locale} ${viewport.name}`;
        problems.push(...report.problems.map((p) => ({ ...p, where })));
        metrics.push({ ...report.metrics, where });
      }
    }

    await testInfo.attach('layout-metrics', {
      body: JSON.stringify(metrics, null, 2),
      contentType: 'application/json',
    });
    expect(problems, `layout problems on ${name}:\n${format(problems)}`).toEqual([]);
  });
}
