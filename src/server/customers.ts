// Reading and writing customers. Rows are read into the app's record shape
// (`customerRecordSchema`, D107): a data-pack customer reads back as data/customers.json has
// it (but for `is_pep`, once an application answered "yes"); the three types share one table,
// and the fields a type does not have, or a sign-up has not answered yet, are null in the row
// and absent in the shape. The owner of the Customer table (team rule 3): the seed, the
// sign-up's blank consumer and what an application's answers fill (a sign-up's missing
// fields, and the PEP flag on any customer) are written here.
import { randomBytes } from 'node:crypto';
import type { Customer as CustomerRow, PrismaClient } from '@/generated/prisma/client';
import { loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import {
  blankConsumerRow,
  customerRecordSchema,
  type CustomerRecord,
} from '@/domain/customers/record';
import {
  customerRecordFillSchema,
  customerRowSchema,
  type CustomerRecordFill,
} from '@/domain/rows/customer';
import type { TransactionClient } from './audit';
import { parseRow } from './row-rules';

/** Database row → the app's record shape. Validates, so a bad value edited in by hand is caught. */
export function toCustomer(row: CustomerRow): CustomerRecord {
  const shape: Record<string, unknown> = {
    id: row.id,
    type: row.type,
    name: row.name,
    birth_date: row.birth_date,
    country: row.country,
    city: row.city,
    email: row.email,
    employment: row.employment,
    monthly_net_income_cents: row.monthly_net_income_cents,
    business_id: row.business_id,
    vat_registered: row.vat_registered,
    annual_revenue_cents: row.annual_revenue_cents,
    applicant_can_sign: row.applicant_can_sign,
    beneficial_owners:
      row.beneficial_owners_json === null ? null : JSON.parse(row.beneficial_owners_json),
    is_pep: row.is_pep,
    story: row.story,
  };
  // The schemas are strict and have no nullable fields: a null column is an absent field.
  const present = Object.fromEntries(Object.entries(shape).filter(([, value]) => value !== null));
  return customerRecordSchema.parse(present);
}

/** Data-pack shape → columns for a new database row. */
export function toCustomerRowData(customer: Customer) {
  const common = {
    id: customer.id,
    type: customer.type,
    name: customer.name,
    country: customer.country,
    city: customer.city,
    email: customer.email,
    is_pep: customer.is_pep,
    story: customer.story,
  };
  switch (customer.type) {
    case 'consumer':
      return {
        ...common,
        birth_date: customer.birth_date,
        employment: customer.employment,
        monthly_net_income_cents: customer.monthly_net_income_cents,
      };
    case 'sole_trader':
      return {
        ...common,
        birth_date: customer.birth_date,
        business_id: customer.business_id,
        vat_registered: customer.vat_registered,
      };
    case 'company':
      return {
        ...common,
        business_id: customer.business_id,
        vat_registered: customer.vat_registered,
        annual_revenue_cents: customer.annual_revenue_cents,
        applicant_can_sign: customer.applicant_can_sign,
        beneficial_owners_json:
          customer.beneficial_owners === undefined
            ? null
            : JSON.stringify(customer.beneficial_owners),
      };
  }
}

/** Every customer, sorted by name (the order the actor picker shows them in). */
export async function listCustomers(
  db: PrismaClient | TransactionClient
): Promise<CustomerRecord[]> {
  const rows = await db.customer.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  return rows.map(toCustomer);
}

/**
 * The data pack's customers, by name: the demo's personas, the only customers ever listed to
 * someone else (the "Continue as" picker, the pass-on form). A sign-up is a real visitor and
 * is never in a list another visitor sees (D107); `alsoId` adds one customer, for the
 * signed-in sign-up's own picker. The ids come from data/customers.json, so no row has to
 * say which kind it is.
 */
export async function listPersonas(
  db: PrismaClient | TransactionClient,
  alsoId?: string
): Promise<CustomerRecord[]> {
  const ids = (await loadCustomers()).map((customer) => customer.id);
  const rows = await db.customer.findMany({
    where: { id: { in: alsoId === undefined ? ids : [...ids, alsoId] } },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toCustomer);
}

/** Whether a customer has that id: one indexed lookup, no row read (every request asks). */
export async function customerExists(
  db: PrismaClient | TransactionClient,
  id: string
): Promise<boolean> {
  return (await db.customer.count({ where: { id } })) === 1;
}

/** One customer, or null when there is no customer with that id. */
export async function getCustomer(
  db: PrismaClient | TransactionClient,
  id: string
): Promise<CustomerRecord | null> {
  const row = await db.customer.findUnique({ where: { id } });
  return row ? toCustomer(row) : null;
}

/** Inserts customers that are not in the database yet. Never overwrites changes you made. */
export async function seedCustomers(
  db: PrismaClient,
  customers: readonly Customer[]
): Promise<{ created: number; skipped: number }> {
  const existing = await db.customer.findMany({ select: { id: true } });
  const existingIds = new Set(existing.map((row) => row.id));
  const missing = customers.filter((customer) => !existingIds.has(customer.id));
  if (missing.length > 0) {
    await db.customer.createMany({ data: missing.map(toCustomerRowData) });
  }
  return { created: missing.length, skipped: customers.length - missing.length };
}

/** A new customer's id: `cust-` and 16 hex digits from `node:crypto`. */
export function newCustomerId(): string {
  return `cust-${randomBytes(8).toString('hex')}`;
}

/**
 * A sign-up's customer (D107): a consumer that holds the e-mail and nothing else, under `id`
 * (`newCustomerId()`; the caller makes it first because its audit entry names it). Written
 * with the caller's `tx`, inside the `withAudit` that also makes the account and its first
 * link.
 */
export async function createBlankConsumer(
  tx: TransactionClient,
  input: { id: string; email: string; today: string }
): Promise<void> {
  await tx.customer.create({
    data: parseRow('customer', customerRowSchema, blankConsumerRow(input)),
  });
}

/**
 * Writes an application's answers into the columns the record `seen` by the caller did not
 * hold (`recordFillFromAnswers`, D107), with the caller's `tx`. The write is conditional on
 * those columns still being as seen (null, the e-mail standing in for the name, a PEP flag
 * still false): false when another application filled one of them first, and then nothing is
 * written, so the caller can compare its answers with the record as it now is. An empty fill
 * writes nothing and is true.
 */
export async function fillCustomerRecord(
  tx: TransactionClient,
  seen: Pick<CustomerRecord, 'id' | 'name'>,
  fill: CustomerRecordFill
): Promise<boolean> {
  if (Object.keys(fill).length === 0) return true;
  const data = parseRow('customer', customerRecordFillSchema, fill);
  const asSeen: Record<string, string | false | null> = { name: seen.name, is_pep: false };
  const unfilled = Object.fromEntries(
    Object.keys(data).map((column) => [column, asSeen[column] ?? null])
  );
  const { count } = await tx.customer.updateMany({ where: { id: seen.id, ...unfilled }, data });
  return count === 1;
}
