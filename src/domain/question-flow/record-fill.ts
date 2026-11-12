// What a first application adds to a customer record that does not hold it yet (D107). A
// sign-up's record holds only the e-mail, so `recordMismatches` (D38) has nothing to compare
// the first answers with; without this, a rejected applicant could apply again with another
// birth date or income and never be held. The first answers are written to the record in the
// application's own transaction, whatever the rules decided, so they stick: the next
// application is compared with them and a difference goes to a person.
import { employmentSchema, isoDateSchema } from '@/data/schemas';
import {
  recordCountrySchema,
  recordHoldsName,
  type CustomerRecord,
} from '@/domain/customers/record';
import type { CustomerRecordFill } from '@/domain/rows/customer';
import type { Answer, Answers } from './engine';

const text = (answer: Answer | undefined): string | undefined =>
  typeof answer === 'string' && answer.trim() !== '' ? answer.trim() : undefined;

/** The answer through `schema`, or undefined when it is not a value the record can hold. */
function held<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  answer: Answer | undefined
): T | undefined {
  const value = text(answer);
  if (value === undefined) return undefined;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The columns to fill: for a consumer record, each of the full name, the birth date, the
 * country (FI, SE, EE or `other`, as answered), the employment and the monthly net income
 * that the record lacks and the answers give. A field on record is never touched, an
 * unanswered or malformed answer fills nothing, and a sole trader's or a company's record
 * has no absent fields. A name that is the record's e-mail is not a name. The answers are
 * the flow's pruned ones, so a sign-up who answers "company" (asked for the company's name,
 * not the person's) fills nothing, and one who answers "sole trader" fills the person's
 * fields that flow asks.
 */
export function recordFillFromAnswers(
  record: CustomerRecord,
  answers: Answers
): CustomerRecordFill {
  if (record.type !== 'consumer') return {};
  const fill: CustomerRecordFill = {};
  const name = text(answers.q_full_name);
  if (
    !recordHoldsName(record) &&
    name !== undefined &&
    recordHoldsName({ name, email: record.email })
  ) {
    fill.name = name;
  }
  if (record.birth_date === undefined) {
    const birthDate = held(isoDateSchema, answers.q_birth_date);
    if (birthDate !== undefined) fill.birth_date = birthDate;
  }
  if (record.country === undefined) {
    const country = held(recordCountrySchema, answers.q_country);
    if (country !== undefined) fill.country = country;
  }
  if (record.employment === undefined) {
    const employment = held(employmentSchema, answers.q_employment);
    if (employment !== undefined) fill.employment = employment;
  }
  if (record.monthly_net_income_cents === undefined) {
    const income = text(answers.q_monthly_income);
    if (income !== undefined && /^\d{1,13}$/.test(income)) {
      fill.monthly_net_income_cents = Number(income);
    }
  }
  return fill;
}

/** The record with a fill applied, as the database reads it afterwards. Consumers only. */
export function applyRecordFill(record: CustomerRecord, fill: CustomerRecordFill): CustomerRecord {
  return record.type === 'consumer' ? { ...record, ...fill } : record;
}
