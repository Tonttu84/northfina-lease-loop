// A sign-up's applications (D107) against a real, migrated SQLite database, on card 1's day:
// the record holds only the e-mail, so the first application's answers are written to it in
// that application's transaction, and the record check (D38) compares the next one with them.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { answersFromCustomer } from '@/domain/question-flow/answers';
import type { Answer } from '@/domain/question-flow/engine';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import { requestLoginLink } from './accounts';
import { createApplication } from './applications';
import { seedAssets } from './assets';
import { getCustomer, seedCustomers } from './customers';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let customers: Customer[];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  customers = await loadCustomers();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedAssets(db, await loadAssets());
  await seedCustomers(db, customers);
});

const TODAY = '2026-11-05';
const NEW = 'nea.person@example.com';
const STORY = 'Signed up in the app with this e-mail on 2026-11-05.';
const answersOf = (id: string) => answersFromCustomer(customers.find((c) => c.id === id)!);

/** A quote row as the pricing slice would write it (card 1's numbers unless told otherwise). */
async function insertQuote(asset = 'ebike-003', financed = 389_000, net = 10_730) {
  const row = await db.quote.create({
    data: {
      asset_id: asset,
      quantity: 1,
      quote_date: TODAY,
      valid_until: '2026-12-05',
      price_list_version: 1,
      list_price_cents: financed,
      down_payment_cents: 0,
      financed_cents: financed,
      band: 'B',
      factor_millionths: 27_584,
      term_months: 36,
      monthly_net_cents: net,
      buyout_cents: 0,
      vat_rate_bp_at_quote: 2_550,
    },
  });
  return row.id;
}

/** Signs `email` up and gives the new customer's id. */
async function signUp(email = NEW): Promise<string> {
  const { link } = await requestLoginLink(db, { email, today: TODAY, demoTools: false });
  const account = await db.account.findUniqueOrThrow({ where: { id: link.accountId } });
  return account.customer_id!;
}

/** Aino's answers (card 1, approved) in the sign-up's own name and e-mail. */
const neaAnswers = (over: Record<string, Answer> = {}): Record<string, Answer> => ({
  ...answersOf('cust-aino'),
  q_full_name: 'Nea Person',
  q_email: NEW,
  q_birth_date: '1990-04-12',
  ...over,
});

const apply = (quoteId: string, customerId: string, answers: Record<string, Answer>) =>
  createApplication(db, { quoteId, customerId, answers, today: TODAY, actor: customerId });

const createdDetails = async (applicationId: string) =>
  JSON.parse(
    (
      await db.auditLog.findFirstOrThrow({
        where: { action: 'application.created', entity_id: applicationId },
      })
    ).details_json ?? '{}'
  );

describe('a sign-up’s first application (D107)', () => {
  it('is decided on its answers alone and writes them to the record, in one audited change', async () => {
    const nea = await signUp();
    const audits = await db.auditLog.count();
    const result = await apply(await insertQuote(), nea, neaAnswers());
    expect(result.ok && result.application).toMatchObject({
      decision: 'approved',
      reasons: [{ code: 'all_checks_passed', params: {} }],
    });
    expect(await getCustomer(db, nea)).toEqual({
      id: nea,
      type: 'consumer',
      name: 'Nea Person',
      birth_date: '1990-04-12',
      country: 'FI',
      email: NEW,
      employment: 'employed',
      monthly_net_income_cents: 320_000,
      is_pep: false,
      story: STORY,
    });
    expect(await db.auditLog.count()).toBe(audits + 1);
    if (!result.ok) return;
    expect((await createdDetails(result.application.id)).recordFilled).toEqual([
      'name',
      'birth_date',
      'country',
      'employment',
      'monthly_net_income_cents',
    ]);
  });

  it('the trap (D38): rejected as too young, the same person cannot apply again as an adult unseen', async () => {
    const nea = await signUp();
    const first = await apply(await insertQuote(), nea, neaAnswers({ q_birth_date: '2009-03-10' }));
    expect(first.ok && first.application).toMatchObject({
      decision: 'rejected',
      reasons: [{ code: 'too_young', params: { eighteenOn: '2027-03-10' } }],
    });
    // The rejected application's answers are on record all the same.
    expect(await getCustomer(db, nea)).toMatchObject({ birth_date: '2009-03-10' });

    const second = await apply(await insertQuote('ebike-004'), nea, neaAnswers());
    expect(second.ok && second.application).toMatchObject({
      decision: 'manual_review',
      reasons: [{ code: 'answer_differs_from_record', params: { question: 'q_birth_date' } }],
    });
    expect(await getCustomer(db, nea)).toMatchObject({ birth_date: '2009-03-10' });
    if (!second.ok) return;
    expect(await createdDetails(second.application.id)).not.toHaveProperty('recordFilled');
  });

  it('the trap (D38): a bigger income, another name or another country the second time is held too', async () => {
    const nea = await signUp();
    await apply(await insertQuote(), nea, neaAnswers());
    const second = await apply(
      await insertQuote('ebike-004'),
      nea,
      neaAnswers({ q_full_name: 'Somebody Else', q_country: 'SE', q_monthly_income: '900000' })
    );
    expect(second.ok && second.application).toMatchObject({
      decision: 'manual_review',
      reasons: [
        { code: 'answer_differs_from_record', params: { question: 'q_full_name' } },
        { code: 'answer_differs_from_record', params: { question: 'q_country' } },
        { code: 'answer_differs_from_record', params: { question: 'q_monthly_income' } },
      ],
    });
    expect(await getCustomer(db, nea)).toMatchObject({
      name: 'Nea Person',
      country: 'FI',
      monthly_net_income_cents: 320_000,
    });
  });

  it('answering the same the second time is approved again, and fills nothing more', async () => {
    const nea = await signUp();
    await apply(await insertQuote(), nea, neaAnswers());
    const second = await apply(await insertQuote('ebike-004'), nea, neaAnswers());
    expect(second.ok && second.application.decision).toBe('approved');
  });

  it('a country outside FI, SE and EE is kept as answered, so "FI" the next time is held', async () => {
    const nea = await signUp();
    const first = await apply(await insertQuote(), nea, neaAnswers({ q_country: 'other' }));
    expect(first.ok && first.application).toMatchObject({
      decision: 'rejected',
      reasons: [{ code: 'residency_not_allowed' }],
    });
    expect(await getCustomer(db, nea)).toMatchObject({ country: 'other' });
    const second = await apply(await insertQuote('ebike-004'), nea, neaAnswers());
    expect(second.ok && second.application).toMatchObject({
      decision: 'manual_review',
      reasons: [{ code: 'answer_differs_from_record', params: { question: 'q_country' } }],
    });
  });

  it('a sign-up who answers "company" is a consumer on record: a person checks, nothing is filled', async () => {
    const nea = await signUp();
    const result = await apply(await insertQuote(), nea, {
      ...answersOf('cust-kettukoodi'),
      q_email: NEW,
    });
    expect(result.ok && result.application.decision).toBe('manual_review');
    expect(result.ok && result.application.reasons).toContainEqual({
      code: 'answer_differs_from_record',
      params: { question: 'q_customer_type' },
    });
    expect(await getCustomer(db, nea)).toEqual({
      id: nea,
      type: 'consumer',
      name: NEW,
      email: NEW,
      is_pep: false,
      story: STORY,
    });
  });

  it('a refused application writes nothing to the record: an invalid answer, a quote in use', async () => {
    const nea = await signUp();
    const quote = await insertQuote();
    expect(await apply(quote, nea, neaAnswers({ q_birth_date: '12.4.1990' }))).toMatchObject({
      ok: false,
      reason: 'invalid_answer',
    });
    expect(await apply(quote, 'cust-aino', answersOf('cust-aino'))).toMatchObject({ ok: true });
    expect(await apply(quote, nea, neaAnswers())).toMatchObject({
      ok: false,
      reason: 'quote_in_use',
    });
    expect(await getCustomer(db, nea)).toMatchObject({ name: NEW });
    expect(await getCustomer(db, nea)).not.toHaveProperty('birth_date');
  });

  it('two first applications at once with different birth dates: one sticks, the other is held', async () => {
    const nea = await signUp();
    const [quoteA, quoteB] = [await insertQuote(), await insertQuote('ebike-004')];
    const results = await Promise.all([
      apply(quoteA, nea, neaAnswers({ q_birth_date: '1990-04-12' })),
      apply(quoteB, nea, neaAnswers({ q_birth_date: '1985-01-01' })),
    ]);
    const applications = results.map((result) => (result.ok ? result.application : null));
    expect(applications.map((application) => application?.decision).sort()).toEqual([
      'approved',
      'manual_review',
    ]);
    const approved = applications.find((application) => application?.decision === 'approved');
    const held = applications.find((application) => application?.decision === 'manual_review');
    expect(held?.reasons).toEqual([
      { code: 'answer_differs_from_record', params: { question: 'q_birth_date' } },
    ]);
    expect(await getCustomer(db, nea)).toMatchObject({
      birth_date: approved?.answers.q_birth_date,
    });
  });

  it('the admin applying for a sign-up (D47) fills the record the same way', async () => {
    const nea = await signUp();
    const result = await createApplication(db, {
      quoteId: await insertQuote(),
      customerId: nea,
      answers: neaAnswers(),
      today: TODAY,
      actor: 'admin',
      onBehalfOf: nea,
    });
    expect(result.ok && result.application.decision).toBe('approved');
    expect(await getCustomer(db, nea)).toMatchObject({ name: 'Nea Person', country: 'FI' });
  });
});

describe('a data-pack customer’s application', () => {
  it('fills nothing: the record already holds every field, and the audit row says nothing of it', async () => {
    const before = await getCustomer(db, 'cust-aino');
    const result = await apply(await insertQuote(), 'cust-aino', answersOf('cust-aino'));
    expect(result.ok && result.application.decision).toBe('approved');
    expect(await getCustomer(db, 'cust-aino')).toEqual(before);
    if (!result.ok) return;
    expect(await createdDetails(result.application.id)).not.toHaveProperty('recordFilled');
  });
});
