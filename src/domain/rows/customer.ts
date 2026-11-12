// The write schema of the `Customer` row (prisma/schema.prisma, D107), parsed on the server
// before every write the app makes (D23): the sign-up's blank consumer, and what an
// application's answers fill (a sign-up's missing fields; the PEP flag on any customer). The
// seed writes the data pack's customers as the pack's own schema read them. One table holds
// the three types, so the columns a type does not have must be null, and the ones it cannot
// be without must be there; a consumer may lack every optional one (a sign-up holds only its
// e-mail).
import { z } from 'zod';
import { employmentSchema } from '@/data/schemas';
import { recordCountrySchema } from '@/domain/customers/record';
import { accountEmailSchema } from './account';
import { centsSchema, idSchema, isoDateSchema, jsonText, ON_VALID_FIELDS } from './fields';

export const customerTypeSchema = z.enum(['consumer', 'sole_trader', 'company']);
export type CustomerType = z.infer<typeof customerTypeSchema>;

/** A name as stored: trimmed, never blank. */
const nameSchema = z.string().trim().min(1).max(500);

/** The languages the app writes in (src/i18n/locales.ts; the domain imports no UI code). */
const preferredLocaleSchema = z.enum(['en', 'fi', 'sv', 'et']);

const columns = {
  id: idSchema,
  type: customerTypeSchema,
  name: nameSchema,
  birth_date: isoDateSchema.nullable(),
  country: recordCountrySchema.nullable(),
  city: z.string().nullable(),
  /** The same rule as the account's e-mail: trimmed, lower case, something@something.tld. */
  email: accountEmailSchema,
  employment: employmentSchema.nullable(),
  monthly_net_income_cents: centsSchema.nullable(),
  business_id: z.string().min(1).nullable(),
  vat_registered: z.boolean().nullable(),
  annual_revenue_cents: centsSchema.nullable(),
  applicant_can_sign: z.boolean().nullable(),
  beneficial_owners_json: jsonText(z.array(z.string())).nullable(),
  is_pep: z.boolean(),
  story: z.string(),
  preferred_locale: preferredLocaleSchema.nullable(),
};

type TypedColumn = Exclude<
  keyof typeof columns,
  'id' | 'type' | 'name' | 'email' | 'is_pep' | 'story' | 'preferred_locale'
>;

/** Per type: the columns it must hold, and the ones it never has. The rest may be null. */
const COLUMNS_OF: Record<CustomerType, { needs: TypedColumn[]; never: TypedColumn[] }> = {
  consumer: {
    needs: [],
    never: [
      'business_id',
      'vat_registered',
      'annual_revenue_cents',
      'applicant_can_sign',
      'beneficial_owners_json',
    ],
  },
  sole_trader: {
    needs: ['birth_date', 'country', 'city', 'business_id', 'vat_registered'],
    never: [
      'employment',
      'monthly_net_income_cents',
      'annual_revenue_cents',
      'applicant_can_sign',
      'beneficial_owners_json',
    ],
  },
  company: {
    needs: [
      'country',
      'city',
      'business_id',
      'vat_registered',
      'annual_revenue_cents',
      'applicant_can_sign',
    ],
    never: ['birth_date', 'employment', 'monthly_net_income_cents'],
  },
};

export const customerRowSchema = z.strictObject(columns).superRefine((row, ctx) => {
  const { needs, never } = COLUMNS_OF[row.type];
  for (const column of needs) {
    if (row[column] === null) {
      ctx.addIssue({ code: 'custom', path: [column], message: `a ${row.type} has this column` });
    }
  }
  for (const column of never) {
    if (row[column] !== null) {
      ctx.addIssue({ code: 'custom', path: [column], message: `a ${row.type} has no such column` });
    }
  }
  // `other` is what a consumer answered (D107); a sole trader's and a company's is a code.
  if (row.type !== 'consumer' && row.country === 'other') {
    ctx.addIssue({ code: 'custom', path: ['country'], message: 'a country code' });
  }
}, ON_VALID_FIELDS);

/**
 * The columns an application's answers write to the record (`recordFillFromAnswers`): for a
 * consumer, any of the name, birth date, country, employment and income the record does not
 * hold yet; for anyone, the PEP flag, which only ever goes to true (a "yes" is remembered, a
 * fill never clears it). At least one column, never a null and nothing else: an answer never
 * rewrites the type or the e-mail.
 */
export const customerRecordFillSchema = z
  .strictObject({
    name: nameSchema,
    birth_date: isoDateSchema,
    country: recordCountrySchema,
    employment: employmentSchema,
    monthly_net_income_cents: centsSchema,
    is_pep: z.literal(true),
  })
  .partial()
  .refine((fill) => Object.keys(fill).length > 0, { message: 'a fill sets at least one column' });
export type CustomerRecordFill = z.infer<typeof customerRecordFillSchema>;
