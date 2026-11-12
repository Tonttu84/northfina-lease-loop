import { beforeAll, describe, expect, it } from 'vitest';
import { loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { customerRecordSchema, type CustomerRecord } from '@/domain/customers/record';
import { answersFromCustomer } from './answers';
import { applyRecordFill, recordFillFromAnswers } from './record-fill';
import { recordMismatches } from './record-check';

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

const consumerAnswers = {
  q_customer_type: 'consumer',
  q_full_name: '  Nea Person ',
  q_birth_date: '1990-04-12',
  q_email: 'new.person@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: '0320000',
  q_usage_purpose: 'commuting',
  q_pep: 'no',
};

describe('recordFillFromAnswers (D107)', () => {
  it('a blank sign-up’s first consumer answers fill the name, birth date, country, employment and income', () => {
    expect(recordFillFromAnswers(blank(), consumerAnswers)).toEqual({
      name: 'Nea Person',
      birth_date: '1990-04-12',
      country: 'FI',
      employment: 'employed',
      monthly_net_income_cents: 320_000,
    });
  });

  it('a data-pack customer has nothing to fill, whatever they answer', () => {
    for (const customer of pack) {
      expect(recordFillFromAnswers(customer, answersFromCustomer(customer)), customer.id).toEqual(
        {}
      );
      expect(recordFillFromAnswers(customer, consumerAnswers), customer.id).toEqual({});
    }
  });

  it('the trap: a field the record already holds is never overwritten by a later answer', () => {
    const held = applyRecordFill(blank(), recordFillFromAnswers(blank(), consumerAnswers));
    const later = { ...consumerAnswers, q_birth_date: '2001-01-01', q_monthly_income: '900000' };
    expect(recordFillFromAnswers(held, later)).toEqual({});
  });

  it('fills only what was answered: a later application fills what the first left out', () => {
    const first = recordFillFromAnswers(blank(), {
      q_birth_date: '1990-04-12',
      q_country: 'other',
    });
    expect(first).toEqual({ birth_date: '1990-04-12', country: 'other' });
    const held = applyRecordFill(blank(), first);
    expect(recordFillFromAnswers(held, consumerAnswers)).toEqual({
      name: 'Nea Person',
      employment: 'employed',
      monthly_net_income_cents: 320_000,
    });
  });

  it('a sign-up who answers "sole trader" fills the person’s fields the flow asked', () => {
    const answers = {
      q_customer_type: 'sole_trader',
      q_full_name: 'Nea Person',
      q_birth_date: '1990-04-12',
      q_country: 'SE',
      q_business_id: '2345678-9',
      q_vat_registered: 'yes',
    };
    expect(recordFillFromAnswers(blank(), answers)).toEqual({
      name: 'Nea Person',
      birth_date: '1990-04-12',
      country: 'SE',
    });
  });

  it('a sign-up who answers "company" fills nothing: the company’s name is not the person’s', () => {
    const answers = {
      q_customer_type: 'company',
      q_company_name: 'Person Oy',
      q_business_id: '0737546-2',
      q_can_sign: 'yes',
      q_annual_revenue: '42000000',
    };
    expect(recordFillFromAnswers(blank(), answers)).toEqual({});
  });

  it('skips an answer that is not a value the record can hold', () => {
    const answers = {
      q_full_name: '   ',
      q_birth_date: '12.4.1990',
      q_country: 'Finland',
      q_employment: 'astronaut',
      q_monthly_income: '3200 €',
    };
    expect(recordFillFromAnswers(blank(), answers)).toEqual({});
  });

  it('an e-mail typed as the name is not a name: the record still holds none', () => {
    expect(recordFillFromAnswers(blank(), { q_full_name: 'New.Person@example.com' })).toEqual({});
  });
});

describe('applyRecordFill', () => {
  it('the filled record is compared like any other: the first answers stick (D38)', () => {
    const held = applyRecordFill(blank(), recordFillFromAnswers(blank(), consumerAnswers));
    expect(recordMismatches(held, consumerAnswers)).toEqual([]);
    expect(
      recordMismatches(held, {
        ...consumerAnswers,
        q_full_name: 'Somebody Else',
        q_birth_date: '2001-01-01',
        q_country: 'SE',
        q_monthly_income: '900000',
      })
    ).toEqual(['q_full_name', 'q_birth_date', 'q_country', 'q_monthly_income']);
  });

  it('an empty fill leaves the record as it was', () => {
    expect(applyRecordFill(blank(), {})).toEqual(blank());
  });

  it('never changes a sole trader or a company', () => {
    const company = pack.find((c) => c.type === 'company')!;
    expect(applyRecordFill(company, { birth_date: '1990-04-12' })).toEqual(company);
  });
});
