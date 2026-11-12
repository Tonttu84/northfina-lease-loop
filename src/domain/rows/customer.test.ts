import { describe, expect, it } from 'vitest';
import { customerRow } from '../../../tests/helpers/row-examples';
import { blankConsumerRow } from '../customers/record';
import { customerSchema } from '@/data/schemas';
import { customerRecordFillSchema, customerRowSchema, customerTypeSchema } from './customer';

const blank = () =>
  blankConsumerRow({ id: 'cust-0123456789abcdef', email: 'new@example.com', today: '2026-11-05' });

describe('customerRowSchema (D107)', () => {
  it('knows exactly the data pack’s three types', () => {
    expect(customerTypeSchema.options).toEqual(
      customerSchema.options.map((option) => option.shape.type.value)
    );
  });

  it('accepts the example row and a blank sign-up', () => {
    expect(customerRowSchema.parse(customerRow())).toEqual(customerRow());
    expect(customerRowSchema.parse(blank())).toEqual(blank());
  });

  it('a consumer has no company columns', () => {
    for (const column of [
      { business_id: '0737546-2' },
      { vat_registered: true },
      { annual_revenue_cents: 100 },
      { applicant_can_sign: true },
      { beneficial_owners_json: '["A"]' },
    ]) {
      expect(
        customerRowSchema.safeParse({ ...blank(), ...column }).success,
        JSON.stringify(column)
      ).toBe(false);
    }
  });

  it('a sole trader and a company need their own columns and none of a consumer’s', () => {
    const soleTrader = {
      ...blank(),
      type: 'sole_trader',
      name: 'Sanna Mäkelä',
      country: 'FI',
      city: 'Oulu',
      birth_date: '1985-02-11',
      business_id: '2345678-9',
      vat_registered: true,
    };
    expect(customerRowSchema.safeParse(soleTrader).success).toBe(true);
    expect(customerRowSchema.safeParse({ ...soleTrader, birth_date: null }).success).toBe(false);
    expect(customerRowSchema.safeParse({ ...soleTrader, employment: 'employed' }).success).toBe(
      false
    );
    const company = {
      ...blank(),
      type: 'company',
      name: 'Norvi Logistics Oy',
      country: 'FI',
      city: 'Vantaa',
      business_id: '0737546-2',
      vat_registered: true,
      annual_revenue_cents: 420_000_000,
      applicant_can_sign: false,
      beneficial_owners_json: '["Anna Norvi"]',
    };
    expect(customerRowSchema.safeParse(company).success).toBe(true);
    expect(customerRowSchema.safeParse({ ...company, applicant_can_sign: null }).success).toBe(
      false
    );
    expect(customerRowSchema.safeParse({ ...company, birth_date: '1985-02-11' }).success).toBe(
      false
    );
    expect(customerRowSchema.safeParse({ ...company, country: null }).success).toBe(false);
    expect(
      customerRowSchema.safeParse({ ...company, beneficial_owners_json: 'Anna' }).success
    ).toBe(false);
  });

  it('refuses a blank name, a bad e-mail, an unknown type, country or language and an extra column', () => {
    expect(customerRowSchema.safeParse({ ...blank(), name: '  ' }).success).toBe(false);
    expect(customerRowSchema.safeParse({ ...blank(), email: 'new' }).success).toBe(false);
    expect(customerRowSchema.safeParse({ ...blank(), type: 'robot' }).success).toBe(false);
    expect(customerRowSchema.safeParse({ ...blank(), country: 'Finland' }).success).toBe(false);
    expect(customerRowSchema.safeParse({ ...blank(), preferred_locale: 'xx' }).success).toBe(false);
    expect(customerRowSchema.safeParse({ ...blank(), password: 'x' }).success).toBe(false);
    expect(customerRowSchema.safeParse({ ...blank(), country: 'other' }).success).toBe(true);
    expect(customerRowSchema.safeParse({ ...blank(), preferred_locale: 'fi' }).success).toBe(true);
  });

  it('money is whole cents, never negative', () => {
    expect(
      customerRowSchema.safeParse({ ...blank(), monthly_net_income_cents: 320_000 }).success
    ).toBe(true);
    expect(customerRowSchema.safeParse({ ...blank(), monthly_net_income_cents: -1 }).success).toBe(
      false
    );
    expect(customerRowSchema.safeParse({ ...blank(), monthly_net_income_cents: 0.5 }).success).toBe(
      false
    );
  });
});

describe('customerRecordFillSchema', () => {
  it('takes the columns a first application fills, any of them', () => {
    const fill = {
      name: 'Nea Person',
      birth_date: '1990-04-12',
      country: 'other',
      employment: 'employed',
      monthly_net_income_cents: 320_000,
    };
    expect(customerRecordFillSchema.parse(fill)).toEqual(fill);
    expect(customerRecordFillSchema.parse({ birth_date: '1990-04-12' })).toEqual({
      birth_date: '1990-04-12',
    });
  });

  it('refuses an empty fill, a null, a column it does not fill and a bad value', () => {
    expect(customerRecordFillSchema.safeParse({}).success).toBe(false);
    expect(customerRecordFillSchema.safeParse({ birth_date: null }).success).toBe(false);
    expect(customerRecordFillSchema.safeParse({ type: 'company' }).success).toBe(false);
    expect(customerRecordFillSchema.safeParse({ is_pep: true }).success).toBe(false);
    expect(customerRecordFillSchema.safeParse({ email: 'other@example.com' }).success).toBe(false);
    expect(customerRecordFillSchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(customerRecordFillSchema.safeParse({ monthly_net_income_cents: -5 }).success).toBe(
      false
    );
  });
});
