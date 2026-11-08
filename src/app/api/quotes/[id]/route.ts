// GET /api/quotes/:id
// The stored quote from its frozen numbers (never re-priced) and where it stands today (card 2).
import { fail, handleRoute, ok } from '@/server/api-response';
import { db } from '@/server/db';
import { todayForRequest } from '@/server/demo-clock';
import { quoteIdParamsSchema } from '@/server/quote-schemas';
import { getQuote, loadPricingData, storedQuoteStatusOn } from '@/server/quotes';

export const GET = handleRoute(async (_request, { params }: RouteContext<'/api/quotes/[id]'>) => {
  const { id } = quoteIdParamsSchema.parse(await params);
  const quote = await getQuote(db, id);
  // A constant message: the id is not echoed back (polish review, security finding 9).
  if (!quote) return fail(404, 'QUOTE_NOT_FOUND', 'No quote with that id');

  const today = await todayForRequest();
  const { priceLists } = await loadPricingData();
  return ok({ ...quote, statusToday: storedQuoteStatusOn(quote, today, priceLists) });
});
