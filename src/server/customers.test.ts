// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { createTestDb } from '../../tests/helpers/test-db';
import { resetDb } from '../../tests/helpers/reset-db';
import {
  createBlankConsumer,
  customerExists,
  fillCustomerRecord,
  getCustomer,
  listCustomers,
  listPersonas,
  newCustomerId,
  seedCustomers,
  toCustomer,
  toCustomerRowData,
} from './customers';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let dataPack: Customer[];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  dataPack = await loadCustomers();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
});

describe('seedCustomers', () => {
  it('inserts every customer from the data pack once', async () => {
    expect(await seedCustomers(db, dataPack)).toEqual({ created: 10, skipped: 0 });
    expect(await seedCustomers(db, dataPack)).toEqual({ created: 0, skipped: 10 });
    expect(await db.customer.count()).toBe(10);
  });

  it('does not overwrite a change you made', async () => {
    await seedCustomers(db, dataPack);
    await db.customer.update({ where: { id: 'cust-aino' }, data: { city: 'Turku' } });
    await seedCustomers(db, dataPack);
    expect((await db.customer.findUniqueOrThrow({ where: { id: 'cust-aino' } })).city).toBe(
      'Turku'
    );
  });

  it('adds only the missing ones when some are there', async () => {
    await seedCustomers(db, dataPack.slice(0, 3));
    expect(await seedCustomers(db, dataPack)).toEqual({ created: 7, skipped: 3 });
  });

  it('writes no audit rows (seeding is the one exception to withAudit)', async () => {
    const before = await db.auditLog.count();
    await seedCustomers(db, dataPack);
    expect(await db.auditLog.count()).toBe(before);
  });
});

describe('listCustomers', () => {
  it('returns every type in the data-pack shape, round-tripping exactly', async () => {
    await seedCustomers(db, dataPack);
    expect(await listCustomers(db)).toEqual(
      [...dataPack].sort((a, b) => a.name.localeCompare(b.name))
    );
  });

  it('returns an empty list from an empty table', async () => {
    expect(await listCustomers(db)).toEqual([]);
  });
});

describe('getCustomer', () => {
  it('returns one customer, keeping the beneficial owners', async () => {
    await seedCustomers(db, dataPack);
    const haapala = dataPack.find((customer) => customer.id === 'cust-haapala');
    expect(haapala).toBeDefined();
    expect(await getCustomer(db, 'cust-haapala')).toEqual(haapala);
  });

  it('returns null for an unknown id', async () => {
    expect(await getCustomer(db, 'cust-nobody')).toBeNull();
  });
});

describe('toCustomer', () => {
  it('throws on a row that breaks the schema, so a bad hand edit is caught', async () => {
    const aino = dataPack.find((customer) => customer.id === 'cust-aino');
    const pekka = dataPack.find((customer) => customer.type === 'sole_trader');
    if (!aino || !pekka) throw new Error('cust-aino or a sole trader missing from the data pack');
    const row = await db.customer.create({ data: toCustomerRowData(aino) });
    expect(() => toCustomer({ ...row, employment: 'astronaut' })).toThrow();
    expect(() => toCustomer({ ...row, type: 'robot' })).toThrow();
    expect(() => toCustomer({ ...row, business_id: '0737546-2' })).toThrow();
    // Only a consumer may lack fields (D107): a sole trader without a birth date is a bad row.
    const trader = await db.customer.create({ data: toCustomerRowData(pekka) });
    expect(() => toCustomer({ ...trader, birth_date: null })).toThrow();
  });

  it('reads a consumer row with null columns as a record without those fields (D107)', async () => {
    const aino = dataPack.find((customer) => customer.id === 'cust-aino');
    if (!aino) throw new Error('cust-aino missing from the data pack');
    const row = await db.customer.create({ data: toCustomerRowData(aino) });
    const read = toCustomer({ ...row, employment: null, country: null, city: null });
    expect(read).not.toHaveProperty('employment');
    expect(read).not.toHaveProperty('country');
    expect(read).toMatchObject({ id: 'cust-aino', birth_date: '1997-04-12' });
  });
});

describe('createBlankConsumer (D107)', () => {
  const blank = { id: 'cust-0123456789abcdef', email: 'new@example.com', today: '2026-11-05' };

  it('writes a consumer that holds the e-mail and nothing else, and reads back so', async () => {
    await createBlankConsumer(db, blank);
    expect(await getCustomer(db, blank.id)).toEqual({
      id: blank.id,
      type: 'consumer',
      name: 'new@example.com',
      email: 'new@example.com',
      is_pep: false,
      story: 'Signed up in the app with this e-mail on 2026-11-05.',
    });
  });

  it('refuses a row that breaks the write schema before it reaches the database', async () => {
    await expect(createBlankConsumer(db, { ...blank, email: 'new' })).rejects.toThrow(
      /customer row breaks its write schema/
    );
    expect(await db.customer.count()).toBe(0);
  });

  it('makes ids of the pack’s shape that do not repeat', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newCustomerId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^cust-[0-9a-f]{16}$/);
  });
});

describe('fillCustomerRecord (D107)', () => {
  const blank = { id: 'cust-0123456789abcdef', email: 'new@example.com', today: '2026-11-05' };
  const seen = { id: blank.id, name: blank.email };

  it('fills the columns the record did not hold, and only those', async () => {
    await createBlankConsumer(db, blank);
    expect(
      await fillCustomerRecord(db, seen, { name: 'Nea Person', birth_date: '1990-04-12' })
    ).toBe(true);
    expect(await getCustomer(db, blank.id)).toEqual({
      id: blank.id,
      type: 'consumer',
      name: 'Nea Person',
      birth_date: '1990-04-12',
      email: 'new@example.com',
      is_pep: false,
      story: 'Signed up in the app with this e-mail on 2026-11-05.',
    });
  });

  it('the trap: writes nothing once another change filled one of the columns first', async () => {
    await createBlankConsumer(db, blank);
    await fillCustomerRecord(db, seen, { birth_date: '1990-04-12' });
    expect(await fillCustomerRecord(db, seen, { birth_date: '2001-01-01', country: 'FI' })).toBe(
      false
    );
    expect(await fillCustomerRecord(db, seen, { name: 'Nea Person' })).toBe(true);
    expect(await fillCustomerRecord(db, seen, { name: 'Somebody Else' })).toBe(false);
    const read = await getCustomer(db, blank.id);
    expect(read).toMatchObject({ name: 'Nea Person', birth_date: '1990-04-12' });
    expect(read).not.toHaveProperty('country');
  });

  it('review finding 2: the PEP flag latches to true once, and only from false', async () => {
    await createBlankConsumer(db, blank);
    expect(await fillCustomerRecord(db, seen, { is_pep: true })).toBe(true);
    expect((await getCustomer(db, blank.id))?.is_pep).toBe(true);
    // Another change set it first: this one writes nothing.
    expect(await fillCustomerRecord(db, seen, { is_pep: true, birth_date: '1990-04-12' })).toBe(
      false
    );
    expect(await getCustomer(db, blank.id)).not.toHaveProperty('birth_date');
  });

  it('an empty fill writes nothing and is fine; a bad one never reaches the database', async () => {
    await createBlankConsumer(db, blank);
    expect(await fillCustomerRecord(db, seen, {})).toBe(true);
    await expect(fillCustomerRecord(db, seen, { birth_date: '12.4.1990' })).rejects.toThrow(
      /customer row breaks its write schema/
    );
    expect(await getCustomer(db, blank.id)).not.toHaveProperty('birth_date');
  });
});

describe('customerExists and listPersonas (review findings 3 and 6)', () => {
  const signUp = { id: 'cust-0123456789abcdef', email: 'new@example.com', today: '2026-11-05' };

  it('finds a customer by id without reading the table: a persona, a sign-up, nobody', async () => {
    await seedCustomers(db, dataPack);
    await createBlankConsumer(db, signUp);
    expect(await customerExists(db, 'cust-aino')).toBe(true);
    expect(await customerExists(db, signUp.id)).toBe(true);
    expect(await customerExists(db, 'cust-nobody')).toBe(false);
  });

  it('the trap: lists the data pack’s customers by name and never a sign-up, named or not', async () => {
    await seedCustomers(db, dataPack);
    await createBlankConsumer(db, signUp);
    await createBlankConsumer(db, {
      ...signUp,
      id: 'cust-fedcba9876543210',
      email: 'b@example.com',
    });
    await fillCustomerRecord(db, { id: signUp.id, name: signUp.email }, { name: 'Nea Person' });
    const personas = await listPersonas(db);
    expect(personas).toEqual([...dataPack].sort((a, b) => a.name.localeCompare(b.name)));
    expect(JSON.stringify(personas)).not.toMatch(/new@example\.com|Nea Person|b@example\.com/);
  });

  it('adds the one customer asked for, so a signed-in sign-up sees itself and nobody else', async () => {
    await seedCustomers(db, dataPack);
    await createBlankConsumer(db, signUp);
    await createBlankConsumer(db, {
      ...signUp,
      id: 'cust-fedcba9876543210',
      email: 'b@example.com',
    });
    const ids = (await listPersonas(db, signUp.id)).map((customer) => customer.id);
    expect(ids).toHaveLength(dataPack.length + 1);
    expect(ids).toContain(signUp.id);
    expect(ids).not.toContain('cust-fedcba9876543210');
    // A persona asked for is not listed twice; admin and anonymous are nobody to add.
    expect(await listPersonas(db, 'cust-aino')).toHaveLength(dataPack.length);
    expect(await listPersonas(db, 'admin')).toHaveLength(dataPack.length);
  });
});
