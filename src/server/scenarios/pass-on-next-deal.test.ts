// D90, card 8 passed on: Aino leases ebike-003 on card 1, pays 7 rents and in month 7
// (2027-06-05) passes the lease on early to the next person. The unpaid rents are cancelled as in
// any early exit, she pays max(0, balance − market value) = 330 675 − 259 230 = 71 445 with no
// refurbishment (a return costs 75 945 with the 4 500 safety inspection), and in the same
// transaction the next person gets a quote priced from the market value 259 230, which they
// apply for and sign through the normal flow.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import { listPriceOn } from '@/domain/price-list';
import { priceQuote } from '@/domain/pricing';
import { answersFromCustomer } from '@/domain/question-flow/answers';
import { payRents, sign, signedContract } from '../../../tests/helpers/journey';
import { seedPack } from '../../../tests/helpers/invoice-fixture';
import { resetDb } from '../../../tests/helpers/reset-db';
import { createTestDb } from '../../../tests/helpers/test-db';
import { withProductionHandlers } from '../../../tests/helpers/with-handlers';
import { createApplication } from '../applications';
import { listAssetEvents } from '../asset-events';
import { getAsset } from '../assets';
import { exitContract, previewExit } from '../exits';
import { listInvoices } from '../invoices';
import type { PrismaClient } from '../prisma-client';
import { createQuote, getQuote, listReservedQuotesFor, loadPricingData } from '../quotes';
import { pricingForAsset } from '../second-life-price';

let db: PrismaClient;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedPack(db);
});
withProductionHandlers();

const MONTH_7 = '2027-06-05';
const AINO_REPORTS = { condition: 'good' as const, usage: { unit: 'km' as const, value: 1_800 } };
const NEXT = 'cust-lena';

async function card1Month7() {
  const trip = { customerId: 'cust-aino', assetId: 'ebike-003', termMonths: 36 };
  const { contract } = await signedContract(db, { ...trip, quoteOn: '2026-11-05' });
  await payRents(db, contract.id, 7, 'cust-aino');
  return contract;
}

describe('card 8 passed on early (D90)', () => {
  it('the preview: return 75 945, pass on 71 445 with the refurbishment at 0', async () => {
    const contract = await card1Month7();
    const preview = await previewExit(
      db,
      { contractId: contract.id, mode: 'return', reported: AINO_REPORTS },
      MONTH_7
    );
    if (!preview.ok) throw new Error(preview.reason.code);
    // The page shows both side by side, whichever mode is chosen.
    expect(preview.preview.return.totalCents).toBe(75_945);
    expect(preview.preview.passOn.totalCents).toBe(71_445);
    expect(preview.preview.passOn.lines.find((l) => l.code === 'refurb_waived')).toMatchObject({
      params: { amountCents: 0 },
    });
  });

  it('rents cancelled, 71 445 billed, and the next person applies for and signs the new quote', async () => {
    const contract = await card1Month7();
    const result = await exitContract(
      db,
      {
        contractId: contract.id,
        mode: 'pass_on',
        reported: AINO_REPORTS,
        nextCustomerId: NEXT,
        actor: 'cust-aino',
      },
      MONTH_7
    );
    if (!result.ok) throw new Error(result.reason.code);
    expect(result.contract.status).toBe('ended_early');
    const invoices = await listInvoices(db, contract.id);
    expect(invoices.find((i) => i.kind === 'early_exit')).toMatchObject({ netCents: 71_445 });
    expect(invoices.filter((i) => i.kind === 'rent' && i.status === 'issued')).toHaveLength(0);
    expect(invoices.filter((i) => i.status === 'cancelled')).toHaveLength(29);

    const quote = await getQuote(db, result.nextQuoteId!);
    expect(quote?.breakdown).toMatchObject({ unitListPriceCents: 259_230, termMonths: 36 });

    const customer = (await loadCustomers()).find((c) => c.id === NEXT)!;
    const applied = await createApplication(db, {
      quoteId: quote!.id,
      customerId: NEXT,
      answers: answersFromCustomer(customer),
      today: MONTH_7,
      actor: NEXT,
    });
    if (!applied.ok) throw new Error(String(applied.reason));
    expect(applied.application.decision).toBe('approved');
    const signed = await sign(db, applied.application.id, NEXT, MONTH_7);
    if (!signed.ok) throw new Error(signed.reason.code);
    expect(signed.details.contract).toMatchObject({ customerId: NEXT, assetId: 'ebike-003' });
    expect((await getAsset(db, 'ebike-003'))?.status).toBe('leased');
  });

  it('review 1: the quote is held for Lena; Aino and a third customer cannot quote, apply or sign it', async () => {
    const contract = await card1Month7();
    const result = await exitContract(
      db,
      {
        contractId: contract.id,
        mode: 'pass_on',
        reported: AINO_REPORTS,
        nextCustomerId: NEXT,
        actor: 'cust-aino',
      },
      MONTH_7
    );
    if (!result.ok) throw new Error(result.reason.code);
    const quoteId = result.nextQuoteId!;
    // Out of the public catalogue: reserved, so nobody can make a quote of their own on it.
    expect((await getAsset(db, 'ebike-003'))?.status).toBe('reserved');
    const other = await createQuote(db, {
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
      today: MONTH_7,
      actor: 'cust-mikko',
    });
    expect(other).toMatchObject({ ok: false, reason: { code: 'asset_not_available' } });
    // Lena finds it on her My leases page; nobody else does.
    expect((await listReservedQuotesFor(db, NEXT, MONTH_7)).map((q) => q.id)).toEqual([quoteId]);
    expect(await listReservedQuotesFor(db, 'cust-aino', MONTH_7)).toEqual([]);

    const customers = await loadCustomers();
    const answersOf = (id: string) => answersFromCustomer(customers.find((c) => c.id === id)!);
    for (const intruder of ['cust-aino', 'cust-mikko']) {
      const applied = await createApplication(db, {
        quoteId,
        customerId: intruder,
        answers: answersOf(intruder),
        today: MONTH_7,
        actor: intruder,
      });
      expect(applied).toEqual({ ok: false, reason: 'quote_reserved_for_another_customer' });
    }
    // The admin applies on Lena's behalf (D47); only for her.
    const applied = await createApplication(db, {
      quoteId,
      customerId: NEXT,
      answers: answersOf(NEXT),
      today: MONTH_7,
      actor: 'admin',
      onBehalfOf: NEXT,
    });
    if (!applied.ok) throw new Error(String(applied.reason));
    // An application row for another customer on Lena's quote (written past the apply check)
    // still cannot sign: the signing checks the quote's customer too.
    const forged = await db.application.create({
      data: {
        customer_id: 'cust-mikko',
        quote_id: quoteId,
        answers_json: '{}',
        decision: 'approved',
        reasons_json: '[]',
        decided_on: MONTH_7,
      },
    });
    const stolen = await sign(db, forged.id, 'cust-mikko', MONTH_7);
    expect(stolen).toMatchObject({
      ok: false,
      reason: { code: 'quote_reserved_for_another_customer' },
    });
    expect((await getAsset(db, 'ebike-003'))?.status).toBe('reserved');
  });
});

describe('the held item is priced from its passport, not the list (polish review 2026-11-08)', () => {
  it('card 8 passed on: the pricing the price page and the preview use holds 259 230, as the quote did', async () => {
    const contract = await card1Month7();
    const result = await exitContract(
      db,
      {
        contractId: contract.id,
        mode: 'pass_on',
        reported: AINO_REPORTS,
        nextCustomerId: NEXT,
        actor: 'cust-aino',
      },
      MONTH_7
    );
    if (!result.ok) throw new Error(result.reason.code);
    const quote = (await getQuote(db, result.nextQuoteId!))!;
    // A pass-on writes no assessment row; the passport's `repriced` entry is the amount.
    const pricing = await pricingForAsset(db, 'ebike-003', await loadPricingData());
    expect(listPriceOn(pricing.priceLists, 'ebike-003', MONTH_7)).toMatchObject({
      ok: true,
      priceCents: 259_230,
    });
    const preview = priceQuote(pricing, {
      assetId: 'ebike-003',
      termMonths: 36,
      downPaymentCents: 0,
      isoDate: MONTH_7,
    });
    expect(preview).toMatchObject({
      ok: true,
      quote: { monthlyNetCents: quote.breakdown.monthlyNetCents },
    });
  });

  it('D77 on a pass-on: a used item reported better than at signing is relisted as leased, and signed under the next list at the amount of the quote', async () => {
    // ebike-005 is like_new with 1 200 km in the pack. Aino leases it on 5 Nov (price list v1,
    // 159 000) and hands it on the same day to Lena, reporting it "new" at 1 300 km; Lena signs
    // on 6 Nov, under v2 (167 000).
    const V1_DAY = '2026-11-05';
    const V2_DAY = '2026-11-06';
    const { contract } = await signedContract(db, {
      customerId: 'cust-aino',
      assetId: 'ebike-005',
      termMonths: 36,
      quoteOn: V1_DAY,
    });
    const result = await exitContract(
      db,
      {
        contractId: contract.id,
        mode: 'pass_on',
        reported: { condition: 'new', usage: { unit: 'km', value: 1_300 } },
        nextCustomerId: NEXT,
        actor: 'cust-aino',
      },
      V1_DAY
    );
    if (!result.ok) throw new Error(result.reason.code);
    // Relisted in the condition it was leased in (the customer's word never improves it), with
    // the usage reported, and held for Lena.
    expect(await getAsset(db, 'ebike-005')).toMatchObject({
      status: 'reserved',
      condition: 'like_new',
      usage: { unit: 'km', value: 1_300 },
    });
    const quote = (await getQuote(db, result.nextQuoteId!))!;
    expect(quote.breakdown.unitListPriceCents).toBeLessThan(159_000);
    const repriced = (await listAssetEvents(db, 'ebike-005')).filter((e) => e.kind === 'repriced');
    expect(repriced.at(-1)?.details).toMatchObject({
      marketValueCents: quote.breakdown.unitListPriceCents,
      secondLifeFinancedCents: quote.breakdown.financedCents,
    });
    // The price lock at signing compares with the held item's amount, not with list v2, so the
    // rent it names is the quote's own.
    const customer = (await loadCustomers()).find((c) => c.id === NEXT)!;
    const applied = await createApplication(db, {
      quoteId: quote.id,
      customerId: NEXT,
      answers: answersFromCustomer(customer),
      today: V2_DAY,
      actor: NEXT,
    });
    if (!applied.ok) throw new Error(String(applied.reason));
    const signed = await sign(db, applied.application.id, NEXT, V2_DAY);
    if (!signed.ok) throw new Error(signed.reason.code);
    expect(signed.details.contract.monthlyNetCents).toBe(quote.breakdown.monthlyNetCents);
    expect(signed.details.priceLock).toMatchObject({
      params: {
        priceListVersion: 1,
        currentPriceListVersion: 2,
        currentMonthlyNetCents: quote.breakdown.monthlyNetCents,
      },
    });
  });
});
