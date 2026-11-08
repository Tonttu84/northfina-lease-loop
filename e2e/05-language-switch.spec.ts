// The header's language switch keeps the page and its query (review finding 14): card 1's
// contract opened from My leases (`?from=leases`) switches to Finnish at the same address, and
// the numbers come out in the Finnish format, 107,30 € with a no-break space.
import { expect, money, test } from './fixtures';

test('switching to suomi keeps the contract page and its query, in Finnish', async ({ page }) => {
  await page.goto('/en/demo');
  await page.getByRole('button', { name: 'Run card 1', exact: true }).click();
  const open = page.getByRole('link', { name: 'Open the page to compare' });
  await expect(open).toBeVisible();
  const contractPath = (await open.getAttribute('href'))!;
  expect(contractPath).toMatch(/^\/en\/contracts\/[^/?#]+$/);

  await page.goto(`${contractPath}?from=leases`);
  await expect(page.getByRole('heading', { level: 1, name: 'Your contract' })).toBeVisible();

  await page.getByRole('link', { name: 'Suomi' }).click();
  await expect(page).toHaveURL(`${contractPath.replace('/en/', '/fi/')}?from=leases`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fi');
  await expect(page.getByRole('heading', { level: 1, name: 'Sopimuksesi' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Laskut' })).toBeVisible();
  await expect(page.getByText(money('107,30 €')).first()).toBeVisible();
  await expect(page.getByText(money('134,66 €'))).toHaveCount(2);
  await expect(page.getByText(money('135,20 €')).first()).toBeVisible();
  await expect(page.getByText('€107.30')).toHaveCount(0);

  // And back, the query still there.
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(`${contractPath}?from=leases`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('€107.30').first()).toBeVisible();
});
