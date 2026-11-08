// The catalogue's filters live in the URL: a category chip, then the secondary chips under it
// (condition, sort) and "Clear filters"; a nonsense value in the URL is ignored and the page
// shows everything.
import { expect, test } from './fixtures';

test('the chips filter through the URL and a nonsense category shows everything', async ({
  page,
}) => {
  await page.goto('/en/catalogue');
  await expect(page.getByRole('heading', { level: 1, name: 'Catalogue' })).toBeVisible();
  const categories = page.getByRole('navigation', { name: 'Show a category' });
  const refine = page.getByRole('navigation', { name: 'Narrow down' });
  const all = categories.getByRole('link', { name: /^All/ });
  const ebikes = categories.getByRole('link', { name: /^E-bikes/ });
  const used = refine.getByRole('link', { name: 'Used', exact: true });
  const clear = refine.getByRole('link', { name: 'Clear filters' });
  const cards = page.getByRole('main').getByRole('article');

  await expect(all).toHaveAttribute('aria-current', 'page');
  await expect(clear).toHaveCount(0);
  const allCards = await cards.count();
  expect(allCards).toBeGreaterThan(0);

  await ebikes.click();
  await expect(page).toHaveURL(/\/en\/catalogue\?category=e_bike$/);
  await expect(ebikes).toHaveAttribute('aria-current', 'page');
  const ebikeCards = await cards.count();
  expect(ebikeCards).toBeGreaterThan(0);
  expect(ebikeCards).toBeLessThan(allCards);

  await used.click();
  await expect(page).toHaveURL(/\/en\/catalogue\?category=e_bike&condition=used$/);
  await expect(used).toHaveAttribute('aria-current', 'true');
  await expect(clear).toBeVisible();
  expect(await cards.count()).toBeLessThan(ebikeCards);

  await refine.getByRole('link', { name: 'Highest price' }).click();
  await expect(page).toHaveURL(/\?category=e_bike&condition=used&sort=price_desc$/);

  await clear.click();
  await expect(page).toHaveURL(/\/en\/catalogue\?category=e_bike$/);
  await expect(clear).toHaveCount(0);

  await page.goto('/en/catalogue?category=nonsense&condition=bogus&sort=sideways');
  await expect(all).toHaveAttribute('aria-current', 'page');
  await expect(clear).toHaveCount(0);
  await expect(page.getByText('Nothing matches these filters right now.')).toHaveCount(0);
  expect(await cards.count()).toBe(allCards);
});
