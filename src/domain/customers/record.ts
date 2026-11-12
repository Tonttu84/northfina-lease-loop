// The customer record as the app holds it (D107). The data pack's `customerSchema`
// (src/data/schemas.ts) stays strict: every test applicant has every field of its type. A
// person who signs up with an e-mail starts as a consumer with only that e-mail on record, so
// the app reads its own, wider shape: a consumer whose birth date, country, city, employment
// and income may be absent until the first application answers them (`recordFillFromAnswers`,
// src/domain/question-flow/record-fill.ts). A sole trader and a company are the pack's shapes,
// unchanged: only a sign-up can lack fields, and a sign-up is a consumer.
import { z } from 'zod';
import { companySchema, consumerSchema, soleTraderSchema } from '@/data/schemas';
import { accountEmailSchema } from '@/domain/rows/account';

/**
 * The country a consumer record holds: a two-letter code, or `other` when the first
 * application answered "outside Finland, Sweden and Estonia" (the flow asks no more than
 * that, and the answer must stick, so the record keeps it as answered).
 */
export const recordCountrySchema = z.union([consumerSchema.shape.country, z.literal('other')]);

export const consumerRecordSchema = consumerSchema.extend({
  // The account's rule for an e-mail, not the pack's stricter `z.email()`: whatever the
  // sign-in form takes and stores on the account must read back on its customer.
  email: accountEmailSchema,
  birth_date: consumerSchema.shape.birth_date.optional(),
  country: recordCountrySchema.optional(),
  city: consumerSchema.shape.city.optional(),
  employment: consumerSchema.shape.employment.optional(),
  monthly_net_income_cents: consumerSchema.shape.monthly_net_income_cents.optional(),
});

/** A customer as read from the database: every data-pack customer parses to itself. */
export const customerRecordSchema = z.discriminatedUnion('type', [
  consumerRecordSchema,
  soleTraderSchema,
  companySchema,
]);
export type CustomerRecord = z.infer<typeof customerRecordSchema>;

/**
 * Whether the record names the person. A sign-up's `name` is its e-mail, shown wherever a
 * name is shown, until the first application's full name replaces it: a name equal to the
 * e-mail (case and outer spaces ignored) is that placeholder, not a name on record.
 */
export function recordHoldsName(record: Pick<CustomerRecord, 'name' | 'email'>): boolean {
  return record.name.trim().toLowerCase() !== record.email.trim().toLowerCase();
}

/**
 * Whether the record holds anything about the person beyond the type and the e-mail: a name,
 * or, for a consumer, a birth date, country, employment or income. A sign-up holds none
 * until an application fills one in; a sole trader's and a company's record always does.
 */
export function recordHoldsDetails(record: CustomerRecord): boolean {
  if (record.type !== 'consumer' || recordHoldsName(record)) return true;
  return [
    record.birth_date,
    record.country,
    record.employment,
    record.monthly_net_income_cents,
  ].some((field) => field !== undefined);
}

/**
 * The row of a new sign-up: a consumer that holds the e-mail and nothing else. `is_pep` is
 * false because nobody has said otherwise (the PEP check reads the answer, D82); every other
 * column is null, never a guess. `email` is the account's e-mail, already trimmed and lower
 * case; `today` is the request's day.
 */
export function blankConsumerRow(input: { id: string; email: string; today: string }) {
  return {
    id: input.id,
    type: 'consumer' as const,
    name: input.email,
    birth_date: null,
    country: null,
    city: null,
    email: input.email,
    employment: null,
    monthly_net_income_cents: null,
    business_id: null,
    vat_registered: null,
    annual_revenue_cents: null,
    applicant_can_sign: null,
    beneficial_owners_json: null,
    is_pep: false,
    // The pack's stories say why a test customer exists; this one says where the row came from.
    story: `Signed up in the app with this e-mail on ${input.today}.`,
    preferred_locale: null,
  };
}
