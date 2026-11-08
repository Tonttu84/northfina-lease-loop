// The second-life price of a relisted item (D12; D86: the market value after the plan), read by
// the quote, the preview, the price page and the signing: the item's current second-life amount
// replaces its list price in every price list, so `priceQuote` puts it through the normal band
// and factor and the quote keeps the live list's version (it says which list was live; the
// amount is the relisting's). The amount is the passport's newest `repriced` entry, which an
// assessment (D86) and a pass-on (D90) both write; an item assessed by a build before the entry
// carried the amount falls back to its assessment row. An item never relisted keeps its list
// price. An assessment stored before D86 keeps its D12 amount until the item is re-assessed or
// the database reset. Kept apart from second-life.ts so quotes.ts can import it without a cycle
// (second-life.ts reads the pricing data through quotes.ts).
import type { PricingData } from '@/domain/pricing';
import { withSecondLifePrice } from '@/domain/second-life/assess';
import { latestRepricing } from './asset-events';
import type { TransactionClient } from './audit';
import type { PrismaClient } from './prisma-client';

/** The item's current second-life financed amount of one unit, or null. */
export async function secondLifePriceCents(
  db: PrismaClient | TransactionClient,
  assetId: string
): Promise<number | null> {
  const repriced = await latestRepricing(db, assetId);
  if (repriced) return repriced.secondLifeFinancedCents;
  const latest = await db.returnAssessment.findFirst({
    where: { asset_id: assetId },
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    select: { second_life_financed_cents: true },
  });
  return latest?.second_life_financed_cents ?? null;
}

/** `pricing` with the asset at its second-life price when it has one. */
export async function pricingForAsset(
  db: PrismaClient | TransactionClient,
  assetId: string,
  pricing: PricingData
): Promise<PricingData> {
  const cents = await secondLifePriceCents(db, assetId);
  return cents === null ? pricing : withSecondLifePrice(pricing, assetId, cents);
}
