import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import { customerSchema, type Customer } from '@/data/schemas';
import {
  blankConsumerRow,
  customerRecordSchema,
  recordHoldsDetails,
  recordHoldsName,
  type CustomerRecord,
} from './record';

let pack: Customer[];
beforeAll(async () => {
  pack = await loadCustomers();
});

const blank = (): CustomerRecord =>
  customerRecordSchema.parse({
    id: 'cust-0123456789abcdef',
    type: 'consumer',
    name: 'new.person@example.com',
    email: 'new.person@example.com',
    is_pep: false,
    story: 'Signed up in the app with this e-mail on 2026-11-05.',
  });

describe('customerRecordSchema (D107)', () => {
  it('reads every data-pack customer exactly as the pack schema does', () => {
    for (const customer of pack) {
      expect(customerRecordSchema.parse(customer), customer.id).toEqual(customer);
    }
  });

  it('reads a signed-up consumer that holds only the e-mail, which the pack schema refuses', () => {
    const record = blank();
    expect(record.type).toBe('consumer');
    expect(record).not.toHaveProperty('birth_date');
    expect(record).not.toHaveProperty('country');
    expect(customerSchema.safeParse(record).success).toBe(false);
  });

  it('a consumer on record may have answered a country outside FI, SE and EE as "other"', () => {
    expect(customerRecordSchema.parse({ ...blank(), country: 'other' })).toHaveProperty(
      'country',
      'other'
    );
    expect(customerRecordSchema.safeParse({ ...blank(), country: 'Finland' }).success).toBe(false);
  });

  it('review finding 1: a consumer’s e-mail follows the account’s rule, not the pack’s stricter one', () => {
    // What `POST /api/login` accepts and stores on the account must read back on its customer.
    for (const email of ['päivi@example.fi', 'matti@äkäs.fi', 'a@b.c', 'a..b@example.com']) {
      expect(customerRecordSchema.parse({ ...blank(), name: email, email }), email).toMatchObject({
        email,
      });
    }
    expect(customerRecordSchema.safeParse({ ...blank(), email: 'not an e-mail' }).success).toBe(
      false
    );
    expect(customerRecordSchema.safeParse({ ...blank(), email: 'a@b' }).success).toBe(false);
  });

  it('the trap: only a consumer may lack fields; a sole trader and a company stay strict', () => {
    const soleTrader = pack.find((c) => c.type === 'sole_trader')!;
    const company = pack.find((c) => c.type === 'company')!;
    const { birth_date: _birth, ...noBirth } = soleTrader as Customer & { birth_date: string };
    const { country: _country, ...noCountry } = company;
    expect(customerRecordSchema.safeParse(noBirth).success).toBe(false);
    expect(customerRecordSchema.safeParse(noCountry).success).toBe(false);
    expect(customerRecordSchema.safeParse({ ...company, country: 'other' }).success).toBe(false);
  });

  it('refuses a key the record does not have and a bad value in a field that is there', () => {
    expect(customerRecordSchema.safeParse({ ...blank(), password: 'x' }).success).toBe(false);
    expect(customerRecordSchema.safeParse({ ...blank(), birth_date: '5.11.2026' }).success).toBe(
      false
    );
    expect(
      customerRecordSchema.safeParse({ ...blank(), monthly_net_income_cents: -1 }).success
    ).toBe(false);
    expect(customerRecordSchema.safeParse({ ...blank(), employment: 'astronaut' }).success).toBe(
      false
    );
  });
});

describe('recordHoldsName', () => {
  it('a data-pack customer has a name on record', () => {
    for (const customer of pack) expect(recordHoldsName(customer), customer.id).toBe(true);
  });

  it('a sign-up shows its e-mail as the name and holds none, whatever the case or spaces', () => {
    expect(recordHoldsName(blank())).toBe(false);
    expect(recordHoldsName({ ...blank(), name: ' New.Person@Example.com ' })).toBe(false);
    expect(recordHoldsName({ ...blank(), name: 'Nea Person' })).toBe(true);
  });
});

describe('recordHoldsDetails', () => {
  it('a data-pack customer has details; a sign-up has none until one field is on record', () => {
    for (const customer of pack) expect(recordHoldsDetails(customer), customer.id).toBe(true);
    expect(recordHoldsDetails(blank())).toBe(false);
    expect(recordHoldsDetails({ ...blank(), is_pep: true })).toBe(false);
    for (const field of [
      { name: 'Nea Person' },
      { birth_date: '1990-04-12' },
      { country: 'other' },
      { employment: 'employed' as const },
      { monthly_net_income_cents: 0 },
    ]) {
      expect(recordHoldsDetails({ ...blank(), ...field }), JSON.stringify(field)).toBe(true);
    }
  });
});

describe('blankConsumerRow', () => {
  const row = blankConsumerRow({
    id: 'cust-0123456789abcdef',
    email: 'new.person@example.com',
    today: '2026-11-05',
  });

  it('holds the e-mail, shows it as the name, and says honestly where the row came from', () => {
    expect(row).toMatchObject({
      id: 'cust-0123456789abcdef',
      type: 'consumer',
      name: 'new.person@example.com',
      email: 'new.person@example.com',
      is_pep: false,
      story: 'Signed up in the app with this e-mail on 2026-11-05.',
    });
  });

  it('every other column is null: the record holds nothing it was not told', () => {
    const {
      id: _id,
      type: _type,
      name: _name,
      email: _email,
      is_pep: _pep,
      story: _story,
      ...rest
    } = row;
    expect(Object.values(rest).every((value) => value === null)).toBe(true);
    expect(Object.keys(rest).sort()).toEqual([
      'annual_revenue_cents',
      'applicant_can_sign',
      'beneficial_owners_json',
      'birth_date',
      'business_id',
      'city',
      'country',
      'employment',
      'monthly_net_income_cents',
      'preferred_locale',
      'vat_registered',
    ]);
  });
});
