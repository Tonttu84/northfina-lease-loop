// Every page lives under /en, /fi, /sv or /et: a made-up language is 404, and the bare root is
// sent to the default language by src/proxy.ts.
import { expect, test } from './fixtures';

test('a bad locale is 404', async ({ page }) => {
  const home = await page.goto('/xx');
  expect(home?.status()).toBe(404);
  const catalogue = await page.goto('/xx/catalogue');
  expect(catalogue?.status()).toBe(404);
});

test('the root lands on /en', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('link', { name: 'Catalogue', exact: true }).first()).toBeVisible();
});
