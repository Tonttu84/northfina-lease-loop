// Signing in by e-mail link (D93) through the demo outbox (D94): Aino asks for a link on the
// sign-in page, the demo page lists it for whoever opens the page, opening it signs her in and
// confirms her e-mail on the account page; the link is single use; signing out forgets her.
// An e-mail no account has signs up the same way (D107): a new customer who holds only the
// e-mail, signed in and confirmed by the link, named by the first application.
import { expect, test } from './fixtures';

test('a sign-in link goes to the demo outbox, signs Aino in once and confirms her e-mail', async ({
  page,
}) => {
  await page.goto('/en/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in or sign up' })).toBeVisible();
  await page.getByRole('textbox', { name: 'E-mail' }).fill('aino.virtanen@example.com');
  await page.getByRole('button', { name: 'Send me a sign-in link' }).click();
  await expect(page.getByText('A sign-in link is on its way')).toBeVisible();
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

test('a new e-mail signs up, signs in by its link, is confirmed, and its first application names it', async ({
  page,
  travelTo,
}) => {
  const email = 'nea.person@example.com';
  await travelTo('2026-11-05');
  await page.goto('/en/login');
  await page.getByRole('textbox', { name: 'E-mail' }).fill(email);
  await page.getByRole('button', { name: 'Send me a sign-in link' }).click();
  // The same notice as for a known e-mail, and no dead end: the link is there.
  await expect(page.getByText('A sign-in link is on its way')).toBeVisible();
  await expect(page.getByText(/No link to show/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open the sign-in link' })).toBeVisible();

  // The outbox lists the new account under its e-mail, the only name it has.
  await page.goto('/en/demo');
  const outbox = page.getByRole('region', { name: 'Outbox: sign-in links' });
  await expect(outbox.getByText(email).first()).toBeVisible();
  await outbox.getByRole('link', { name: 'Open the link' }).click();
  await expect(page.getByText('n•••@example.com')).toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // Signed in and confirmed; the record holds no name yet.
  await expect(page.getByRole('heading', { level: 1, name: 'Your account' })).toBeVisible();
  await expect(page.getByText(`Welcome, ${email}`)).toBeVisible();
  await expect(page.getByText('Not on record yet: your first application adds it.')).toBeVisible();
  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
  const header = page.locator('header');
  await expect(header.getByRole('link', { name: 'My leases' })).toBeVisible();

  // The first application: card 1's e-bike, answered from scratch (nothing to pre-fill with).
  await page.goto('/en/assets/ebike-003');
  await page.getByRole('button', { name: /Apply at this price/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Apply for a lease' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Fill in with/ })).toHaveCount(0);
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await page.getByRole('radio', { name: 'A private person' }).check();
  await next.click();
  await page.getByLabel('Your full name').fill('Nea Person');
  await next.click();
  await page.getByLabel('Date of birth').fill('1990-04-12');
  await next.click();
  await page.getByLabel('Email address').fill(email);
  await next.click();
  await page.getByRole('radio', { name: 'Finland' }).check();
  await next.click();
  await page.getByRole('radio', { name: 'Employed', exact: true }).check();
  await next.click();
  await page.getByLabel('Monthly net income (EUR)').fill('3200');
  await next.click();
  await page.getByRole('radio', { name: 'Commuting' }).check();
  await next.click();
  await page.getByRole('button', { name: 'Send the application' }).click();
  await expect(page.getByText('Yes, you can lease it')).toBeVisible({ timeout: 15_000 });

  // The answers are on record now: the account page names the person.
  await page.goto('/en/account');
  await expect(page.getByRole('main').getByText('Nea Person')).toBeVisible();
  await expect(page.getByText('Not on record yet: your first application adds it.')).toHaveCount(0);

  // The next application offers the record's details and compares the answers with them.
  await page.goto('/en/assets/ebike-004');
  await page.getByRole('button', { name: /Apply at this price/ }).click();
  await expect(
    page.getByRole('button', { name: "Fill in with Nea Person's details" })
  ).toBeVisible();

  // The "Continue as" picker lists her to herself only: signed out, nobody else sees a sign-up.
  const picker = page.getByLabel('Continue as');
  await expect(picker.locator('option', { hasText: 'Nea Person' })).toHaveCount(1);
  await page.goto('/en/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(header.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(picker.locator('option', { hasText: 'Aino Virtanen' })).toHaveCount(1);
  await expect(picker.locator('option', { hasText: 'Nea Person' })).toHaveCount(0);
  await expect(picker.locator('option', { hasText: email })).toHaveCount(0);
});
