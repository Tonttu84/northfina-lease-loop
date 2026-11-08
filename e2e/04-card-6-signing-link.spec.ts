// Card 6 through the signing link (D46): the run leaves Norvi's case waiting for the signatory;
// Norvi's coordinator account sees the page but no outbox; the admin sees the demo outbox and
// opens the link; the link signs once (the application becomes approved), a second POST on it
// is 409 SIGNING_LINK_USED, and a token nobody was sent gets the not-found notice.
import { expect, test } from './fixtures';

const OUTBOX = 'Demo outbox: the signing link';

test('the coordinator sees no link, the admin does, and the link signs exactly once', async ({
  page,
  actAs,
}) => {
  await page.goto('/en/demo');
  await page.getByRole('button', { name: 'Run card 6', exact: true }).click();
  await page.getByRole('link', { name: 'Open the page to compare' }).click();
  await expect(page).toHaveURL(/\/en\/applications\/[^/?#]+$/);

  // The run set the actor to Norvi (the coordinator, who may not sign).
  await expect(page.getByRole('heading', { name: 'Waiting for the signatory' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What happens next' })).toBeVisible();
  await expect(page.getByRole('heading', { name: OUTBOX })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open the signing link' })).toHaveCount(0);

  await actAs('admin');
  await page.reload();
  await expect(page.getByRole('heading', { name: OUTBOX })).toBeVisible();
  await expect(
    page.getByText(
      /^A signing link was sent to \S+ on 5 November 2026\. It works until 19 November 2026\.$/
    )
  ).toBeVisible();
  await page.getByRole('link', { name: 'Open the signing link' }).click();

  await expect(page).toHaveURL(/\/en\/sign\/[A-Za-z0-9_-]{32,64}$/);
  const token = new URL(page.url()).pathname.split('/').at(-1)!;
  await expect(page.getByRole('heading', { level: 1, name: 'Sign for the company' })).toBeVisible();
  // Inside the page: the actor picker in the header lists the company too.
  const what = page.getByRole('main');
  await expect(what.getByText('Norvi Logistics Oy')).toBeVisible();
  await expect(what.getByText('ebike-004')).toBeVisible();
  await expect(what.getByText('€151.44')).toBeVisible(); // 15 144 a month, band B

  await page.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(page.getByText(/^Signed on 5 November 2026\. Thank you/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign', exact: true })).toHaveCount(0);

  const again = await page.request.post(`/api/sign/${token}`, { data: { action: 'sign' } });
  expect(again.status()).toBe(409);
  expect(await again.json()).toMatchObject({
    success: false,
    error: { code: 'SIGNING_LINK_USED' },
  });

  await page.getByRole('link', { name: 'See the application' }).click();
  await expect(page.getByRole('heading', { name: 'Yes, you can lease it' })).toBeVisible();
});

test('a token nobody was sent says so', async ({ page }) => {
  const token = 'x'.repeat(40);
  await page.goto(`/en/sign/${token}`);
  await expect(page.getByText('There is no signing link with this address.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign', exact: true })).toHaveCount(0);

  const api = await page.request.post(`/api/sign/${token}`, { data: { action: 'sign' } });
  expect(api.status()).toBe(404);
});
