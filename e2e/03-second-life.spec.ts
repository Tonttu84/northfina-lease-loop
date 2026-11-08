// The second-life page is back office (D85): anonymous is asked to pick who they are, a
// customer is told why they may not see it (and the API refuses the assessment with 403), and
// the admin sees the options table, the waiting list with wait-02 ranked first (card 9) and the
// Assess button, which stores the assessment and relists the item.
import { expect, test } from './fixtures';

const PAGE = '/en/assets/ebike-007/second-life';

test('anonymous and a customer get a notice and no data; the API answers 403', async ({
  page,
  actAs,
}) => {
  await page.goto(PAGE);
  await expect(page.getByRole('heading', { level: 1, name: 'Second life' })).toBeVisible();
  await expect(page.getByText(/Pick who you are in .Continue as. first/)).toBeVisible();
  await expect(page.locator('#sl-options')).toHaveCount(0);
  await expect(page.getByText('wait-02')).toHaveCount(0);

  await actAs('cust-aino');
  await page.reload();
  await expect(page.getByText(/Only an admin can see the second-life assessment/)).toBeVisible();
  await expect(page.locator('#sl-options')).toHaveCount(0);
  await expect(page.getByText('wait-02')).toHaveCount(0);

  const refused = await page.request.post('/api/assets/ebike-007/assessments');
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
});

test('the admin sees the options, wait-02 ranked first, and assesses the item', async ({
  page,
  actAs,
  travelTo,
}) => {
  await travelTo('2026-11-06'); // card 9's day: the waiting list's deadlines have not passed
  await actAs('admin');
  await page.goto(PAGE);

  await expect(page.getByText(/^Preview on 6 November 2026/)).toBeVisible();
  await expect(page.locator('#sl-options')).toHaveText('Ways to relist it');
  const options = page.getByRole('region', { name: 'Ways to relist it' });
  await expect(options.getByRole('row')).toHaveCount(4); // the header, then fair, good, like new

  const waiting = page.getByRole('region', { name: 'The waiting list' });
  const first = waiting.getByRole('row').nth(1);
  await expect(first.getByRole('cell').first()).toHaveText(/^1\s+Winner$/);
  await expect(first.getByRole('rowheader')).toHaveText('wait-02');
  await expect(waiting.getByRole('row').nth(2).getByRole('rowheader')).toHaveText('wait-13');
  await expect(page.getByText(/^Relist it fair for wait-02/i)).toBeVisible();

  await page.getByRole('button', { name: 'Assess and relist' }).click();
  await expect(page.getByText(/^Assessed on 6 November 2026/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assess and relist' })).toHaveCount(0);
  await expect(options.getByText('chosen', { exact: true })).toBeVisible();
});
