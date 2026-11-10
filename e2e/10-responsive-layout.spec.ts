// Every page at every viewport in every language (docs/features/responsive-layout.md): from a
// 320 px phone to a 2560 px screen, landscape, and with the reader's text at 150 % and 200 % (the
// browser's own text size setting). A page passes when no check in e2e/layout.ts finds anything:
// no sideways scroll, nothing sticking out of the viewport (not even during an animation), no text
// escaping its box, no two boxes drawn over each other, no word broken that fits its line, no tap
// target under 24 px on a phone, no text that ignores the reader's size; with the header's menu
// open too, where it shows. What the content does with a wide screen is measured and attached to
// the report (`layout-metrics`); two design rules on top of it are asserted at the end of the
// file: the header keeps one row at 768, 1024 and 1100 px when someone is signed in (issue 19,
// D99), and wide screens get wider lists and keep narrow forms and the contract (D98).
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
  type Viewport,
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
        // Where the header's links fold into its menu, the page again with the menu open: the
        // open panel is the only way to the links there. What the closed page already reported
        // is not listed twice.
        const menu = page.locator('details[data-nav-menu]');
        if (await menu.isVisible()) {
          await menu.evaluate((details) => details.setAttribute('open', ''));
          const opened = await checkLayout(page, { phone: viewport.width <= 430 });
          const seen = new Set(report.problems.map((p) => `${p.check} ${p.element}`));
          problems.push(
            ...opened.problems
              .filter((p) => !seen.has(`${p.check} ${p.element}`))
              .map((p) => ({ ...p, where: `${where} menu open` }))
          );
          await menu.evaluate((details) => details.removeAttribute('open'));
        }
      }
    }

    await testInfo.attach('layout-metrics', {
      body: JSON.stringify(metrics, null, 2),
      contentType: 'application/json',
    });
    expect(problems, `layout problems on ${name}:\n${format(problems)}`).toEqual([]);
  });
}

// Design rules on top of "nothing breaks": what the metrics above only report, pinned.
const TABLET: Viewport = { name: 'tablet', width: 768, height: 1024 };
const SHIPPED = LOCALES.filter((locale) => !locale.startsWith('qps-'));
const wide = (width: number): Viewport => ({ name: `${width}`, width, height: 1080 });

/** The layout metrics of a page (path without the locale) at one viewport. */
async function metricsAt(page: Page, path: string, viewport: Viewport, locale = 'en') {
  await useViewport(page, viewport);
  await page.goto(`/${locale}${path}`);
  return (await checkLayout(page, { phone: false })).metrics;
}

test('the header keeps one row when someone is signed in', async ({ page, actAs }) => {
  // Issue 19: signed in, the nav gains "My leases" ("All leases" for the admin) and "Account" in
  // place of "Sign in"; that must not wrap the header onto a second row in a shipped language.
  // 768 px is the tablet that wrapped; 1024 px is where the links come out of the menu (D99),
  // 1100 px a width between that and the 1280 px laptop.
  const grown: string[] = [];
  for (const screen of [TABLET, wide(1024), wide(1100)]) {
    for (const locale of SHIPPED) {
      await actAs(null);
      const signedOut = (await metricsAt(page, '/catalogue', screen, locale)).headerHeight;
      for (const actor of ['cust-aino', 'admin']) {
        await actAs(actor);
        const signedIn = (await metricsAt(page, '/catalogue', screen, locale)).headerHeight;
        if (signedIn !== signedOut) {
          grown.push(
            `${screen.width} px ${locale} as ${actor}: ${signedIn} px, signed out ${signedOut} px`
          );
        }
      }
    }
  }
  expect(grown, `the header grows when signed in:\n${grown.join('\n')}`).toEqual([]);
});

test('wide screens get wider lists and keep narrow forms (D98)', async ({ page }) => {
  const columns = {
    1440: (await metricsAt(page, '/catalogue', wide(1440))).gridColumns,
    1920: (await metricsAt(page, '/catalogue', wide(1920))).gridColumns,
    2560: (await metricsAt(page, '/catalogue', wide(2560))).gridColumns,
  };
  const width = {
    'catalogue 1440': (await metricsAt(page, '/catalogue', wide(1440))).contentWidth,
    'catalogue 2560': (await metricsAt(page, '/catalogue', wide(2560))).contentWidth,
    'sign in 2560': (await metricsAt(page, '/login', wide(2560))).contentWidth,
    'my leases 2560': 0,
    'contract 2560': 0,
  };
  const contract = (await runCardByRoute(page, 1)).landing;
  width['my leases 2560'] = (await metricsAt(page, '/leases', wide(2560))).contentWidth;
  width['contract 2560'] = (await metricsAt(page, contract, wide(2560))).contentWidth;

  expect({ columns, width }).toEqual({
    // From 1536 px (Tailwind's `2xl`) the catalogue shows four columns; below it, three.
    columns: { 1440: 3, 1920: 4, 2560: 4 },
    width: {
      // Below 1536 px nothing changes: the catalogue keeps its 1152 px (`max-w-6xl`).
      'catalogue 1440': 1152,
      // From 1536 px a list page caps its content at 1280 px (`max-w-7xl`), whatever its cap
      // below (the catalogue 1152 px, my leases 896 px)...
      'catalogue 2560': 1280,
      'my leases 2560': 1280,
      // ...and a form keeps its narrow column (`max-w-2xl`, 672 px)...
      'sign in 2560': 672,
      // ...and so does the contract, which reads like a document (`max-w-5xl`, 1024 px).
      'contract 2560': 1024,
    },
  });
});

test("the passport card's arrow is hidden or beside its text", async ({ page }) => {
  // PR 27's third review: with the card's row wrapping, the arrow wrapped alone onto a second
  // row under the booklet (320 px at 100 % text, 480 px at 150 %, 640 px at 200 %) although
  // nothing overlapped or overflowed. Shown, its top must be above the bottom of the text.
  const alone: string[] = [];
  for (const locale of LOCALES) {
    await useViewport(page, VIEWPORTS[0]!);
    await page.goto(`/${locale}/assets/ebike-008`);
    for (const viewport of VIEWPORTS) {
      await useViewport(page, viewport);
      const place = await page.evaluate(() => {
        const card = document.querySelector('main a[href$="/passport"]')!;
        const arrow = [...card.querySelectorAll('span[aria-hidden="true"]')].find(
          (span) => span.textContent?.trim() === '→'
        )!;
        const text = card.querySelector('span.font-heading')!.parentElement!;
        if (!arrow.checkVisibility()) return null;
        return {
          arrowTop: Math.round(arrow.getBoundingClientRect().top),
          textBottom: Math.round(text.getBoundingClientRect().bottom),
        };
      });
      if (place && place.arrowTop >= place.textBottom) {
        alone.push(
          `${locale} ${viewport.name}: the arrow's top ${place.arrowTop} px, the text's bottom ${place.textBottom} px`
        );
      }
    }
  }
  expect(alone, `the passport card's arrow on a row of its own:\n${alone.join('\n')}`).toEqual([]);
});
