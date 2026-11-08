// Card 1 as the judges see it: the Run button on the demo page, the steps it lists, the link to
// the contract, and the contract page with the numbers the README Status table pins (net 10 730,
// gross 13 466 twice, then 13 520 from January 2027 at 26 % VAT). A second click is refused and
// links the first run's contract (D70).
import { expect, test } from './fixtures';

test('runs card 1 from the demo page and lands on the contract with its numbers', async ({
  page,
}) => {
  await page.goto('/en/demo');
  await page.getByRole('button', { name: 'Run card 1', exact: true }).click();

  await expect(page.getByText('What it did')).toBeVisible();
  const steps = page.getByRole('list').filter({ hasText: /^Quoted ebike-003/ });
  await expect(steps.getByRole('listitem').first()).toHaveText(
    /^Quoted ebike-003 for 36 months with €0\.00 down on .+: €107\.30 a month without VAT, price list 1\.$/
  );
  await expect(steps).toContainText(/Applied on .+: Yes, you can lease it\./);
  await expect(steps).toContainText(/Signed contract LL-\S+ on .+: €107\.30 a month/);

  await page.getByRole('link', { name: 'Open the page to compare' }).click();
  await expect(page).toHaveURL(/\/en\/contracts\/[^/?#]+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Your contract' })).toBeVisible();
  await expect(page.getByText('€107.30').first()).toBeVisible();
  // November and December 2026 at 25.5 %, then every month from January 2027 at 26 %.
  await expect(page.getByText('€134.66')).toHaveCount(2);
  await expect(page.getByText('€135.20')).toHaveCount(34);
  await expect(page.getByText(/VAT is charged at the rate on each invoice date/)).toBeVisible();
  // The run set the actor to Aino, so the header offers her leases.
  await expect(page.getByRole('link', { name: 'My leases' })).toBeVisible();
});

test('a second click on card 1 is refused and links the first run', async ({ page }) => {
  await page.goto('/en/demo');
  const run = page.getByRole('button', { name: 'Run card 1', exact: true });
  await run.click();
  const open = page.getByRole('link', { name: 'Open the page to compare' });
  await expect(open).toBeVisible();
  const contractHref = await open.getAttribute('href');
  expect(contractHref).toMatch(/^\/en\/contracts\/[^/?#]+$/);

  await run.click();
  const refused = page.getByRole('status').filter({ hasText: 'Card 1 has already run' });
  await expect(refused).toBeVisible();
  await expect(refused).toContainText('the clock and the actor are set again');
  await expect(page.getByRole('link', { name: 'Open what the first run made' })).toHaveAttribute(
    'href',
    contractHref!
  );
});
