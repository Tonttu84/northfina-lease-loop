// The audit page after a run (docs/features/audit-chain.md): the three badges agree (intact up
// to the same entry the anchors reach, every entry signed), every row names the run's actor,
// and the pitch's `npm run demo:tamper` turns the badge to "broken" at the edited row.
import { expect, tamperAuditLog, test } from './fixtures';

test('the badges agree and name the run; the tamper script breaks the chain', async ({ page }) => {
  await page.goto('/en/audit');
  await expect(page.getByText(/^Nothing has changed yet/)).toBeVisible();

  await page.goto('/en/demo');
  await page.getByRole('button', { name: 'Run card 1', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open the page to compare' })).toBeVisible();

  await page.goto('/en/audit');
  const intact = page.getByText(/^Chain intact · \d+ entries · head \S+$/);
  await expect(intact).toBeVisible();
  const count = Number(/(\d+) entries/.exec(await intact.innerText())?.[1]);
  expect(count).toBeGreaterThanOrEqual(3); // the quote, the application and the contract at least
  await expect(page.getByText('Signed · every entry and the head')).toBeVisible();
  await expect(
    page.getByText(`Anchored outside the database · up to entry ${count}`)
  ).toBeVisible();

  const table = page.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(count + 1); // the header and one row per entry
  await expect(table.getByRole('cell', { name: 'cust-aino', exact: true })).toHaveCount(count);
  await expect(table.getByRole('cell', { name: 'contract.signed' })).toBeVisible();

  tamperAuditLog();
  await page.reload();
  await expect(
    page.getByText(/^Chain broken at entry #\d+ \(its content changed after it was written\)$/)
  ).toBeVisible();
  await expect(page.getByText(/^Chain intact/)).toHaveCount(0);
});
