// Signing in by e-mail link (D93) through the demo outbox (D94): Aino asks for a link on the
// sign-in page, the demo page lists it for whoever opens the page, opening it signs her in and
// confirms her e-mail on the account page; the link is single use; signing out forgets her.
import { expect, test } from './fixtures';

test('a sign-in link goes to the demo outbox, signs Aino in once and confirms her e-mail', async ({
  page,
}) => {
  await page.goto('/en/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await page.getByRole('textbox', { name: 'E-mail' }).fill('aino.virtanen@example.com');
  await page.getByRole('button', { name: 'Send me a sign-in link' }).click();
  await expect(page.getByText(/a sign-in link is on its way/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the sign-in link' })).toBeVisible();

  // The outbox on the demo page, open to anyone.
  await page.goto('/en/demo');
  const outbox = page.getByRole('region', { name: 'Outbox: sign-in links' });
  await expect(outbox.getByText('Aino Virtanen')).toBeVisible();
  await expect(outbox.getByText(/works until/)).toBeVisible();
  const linkHref = await outbox.getByRole('link', { name: 'Open the link' }).getAttribute('href');
  expect(linkHref).toMatch(/^\/en\/login\/[A-Za-z0-9_-]{32}$/);
  await outbox.getByRole('link', { name: 'Open the link' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Your sign-in link' })).toBeVisible();
  await expect(page.getByText('a•••@example.com')).toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Your account' })).toBeVisible();
  await expect(page.getByText(/Welcome, Aino Virtanen/)).toBeVisible();
  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
  // The header's links (the page has its own My leases button too).
  const header = page.locator('header');
  await expect(header.getByRole('link', { name: 'My leases' })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Account' })).toBeVisible();

  // Single use: the outbox no longer lists it and the link page refuses it.
  await page.goto('/en/demo');
  await expect(outbox.getByText('No pending links')).toBeVisible();
  await page.goto(linkHref!);
  await expect(page.getByText(/already been used/)).toBeVisible();

  // Sign out forgets her.
  await page.goto('/en/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /greener way/ })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('link', { name: /leases/ })).toHaveCount(0);
});
