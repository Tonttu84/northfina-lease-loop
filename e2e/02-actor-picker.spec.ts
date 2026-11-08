// "Continue as" (D17): picking a customer puts "My leases" into the header and opens their
// portal, the admin sees "All leases", and clearing the picker forgets the actor again. Each
// choice goes through the real route and cookie, and the server components re-render.
import { expect, test } from './fixtures';

test('a customer gets My leases, the admin All leases, and Stop forgets the actor', async ({
  page,
}) => {
  await page.goto('/en/leases');
  await expect(page.getByText(/Choose who you are in .Continue as./)).toBeVisible();
  await expect(page.getByRole('link', { name: /leases/ })).toHaveCount(0);

  const picker = page.getByLabel('Continue as');
  await picker.selectOption({ label: 'Aino Virtanen' });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('link', { name: 'My leases' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'My leases' })).toBeVisible();
  await expect(page.getByText('Everything of yours in one place')).toBeVisible();
  await expect(page.getByText(/^No contracts yet\./)).toBeVisible();

  await picker.selectOption({ label: 'Admin' });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('link', { name: 'All leases' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'My leases' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'All leases' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Customers' })).toBeVisible();

  await picker.selectOption({ label: 'Nobody (just looking)' });
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('link', { name: /leases/ })).toHaveCount(0);
  await expect(page.getByText(/Choose who you are in .Continue as./)).toBeVisible();
});
