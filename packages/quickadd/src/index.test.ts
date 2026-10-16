import { describe, expect, it } from 'vitest';
import { parseQuickAdd, type QAContext } from './index';

const cat = (id: string, name: string, kind: 'EXPENSE' | 'INCOME' = 'EXPENSE') => ({ id, name, kind });
const ctx: QAContext = {
  today: '2026-10-17', // a Saturday
  accounts: [
    { id: 'bca', name: 'BCA', kind: 'BANK', provider: 'BCA' },
    { id: 'cc', name: 'BCA Card', kind: 'CREDIT_CARD', provider: 'BCA' },
    { id: 'gopay', name: 'GoPay', kind: 'EWALLET', provider: 'GOPAY' },
    { id: 'cash', name: 'Cash', kind: 'CASH', provider: null },
    { id: 'friends', name: 'Friends', kind: 'IOU', provider: null },
  ],
  categories: [
    cat('food', 'Food & Drink'), cat('coffee', 'Coffee'), cat('transport', 'Transport'),
    cat('bills', 'Bills & Utilities'), cat('shopping', 'Shopping'), cat('giving', 'Giving'),
    cat('salary', 'Salary', 'INCOME'), cat('angpao', 'Angpao & THR', 'INCOME'), cat('other-in', 'Other income', 'INCOME'),
  ],
  lastAccountId: 'bca',
};

describe('parseQuickAdd', () => {
  it('splits a line into several entries with accounts and categories', () => {
    const d = parseQuickAdd('kopi susu 25rb pakai gopay dan parkir 5rb cash dan bayar listrik 300rb dari BCA', ctx);
    expect(d.map(x => [x.amount, x.accountId, x.categoryId, x.merchant])).toEqual([
      [25000, 'gopay', 'coffee', 'Kopi Susu'],
      [5000, 'cash', 'transport', 'Parkir'],
      [300000, 'bca', 'bills', 'Listrik'],
    ]);
  });

  it('reads "mkn PH 100 bg 3" as a Rp100,000 Pizza Hut meal split three ways, flagged', () => {
    const [d] = parseQuickAdd('mkn PH 100 bg 3', ctx);
    expect(d).toMatchObject({ type: 'EXPENSE', amount: 100000, needsConfirm: true, merchant: 'Pizza Hut', categoryId: 'food', split: 3, accountId: 'bca' });
  });

  it('uses the price range to pick a magnitude', () => {
    expect(parseQuickAdd('parkir 2', ctx)[0].amount).toBe(2000);
    expect(parseQuickAdd('beli iphone 18', ctx)[0].amount).toBe(18000000);
  });

  it('leaves the amount open when several magnitudes fit', () => {
    const [d] = parseQuickAdd('perpuluhan 50', ctx);
    expect(d.amount).toBeNull();
    expect(d.candidates).toEqual([50, 50000, 50000000]);
  });

  it('learns from merchant history', () => {
    const [d] = parseQuickAdd('ph 3', { ...ctx, merchantHistory: { 'pizza hut': { min: 150000, max: 300000, categoryId: 'food' } } });
    expect(d.amount).toBeNull(); // 3,000 and 3,000,000 are both outside 50k..900k
    const [e] = parseQuickAdd('ph 200', { ...ctx, merchantHistory: { 'pizza hut': { min: 150000, max: 300000, categoryId: 'food' } } });
    expect(e.amount).toBe(200000);
  });

  it('reads Hokkien words', () => {
    expect(parseQuickAdd('parkir goceng', ctx)[0]).toMatchObject({ amount: 5000, needsConfirm: false });
    expect(parseQuickAdd('ojek ceban', ctx)[0].amount).toBe(10000);
    expect(parseQuickAdd('makan cepek ceng', ctx)[0].amount).toBe(100000);
    expect(parseQuickAdd('makan cepek', ctx)[0]).toMatchObject({ amount: 100000, needsConfirm: true });
    expect(parseQuickAdd('jajan noceng', ctx)[0].amount).toBe(2000);
  });

  it('detects income and its category', () => {
    expect(parseQuickAdd('gaji 9,5jt', ctx)[0]).toMatchObject({ type: 'INCOME', amount: 9500000, categoryId: 'salary' });
    expect(parseQuickAdd('dapat angpao 200rb cash', ctx)[0]).toMatchObject({ type: 'INCOME', categoryId: 'angpao', accountId: 'cash' });
  });

  it('reads transfers, top-ups and admin fees', () => {
    expect(parseQuickAdd('transfer 500rb dari BCA ke GoPay', ctx)[0]).toMatchObject({ type: 'TRANSFER', amount: 500000, accountId: 'bca', toAccountId: 'gopay' });
    expect(parseQuickAdd('top up gopay 100rb admin 1000', ctx)[0]).toMatchObject({ type: 'TRANSFER', amount: 100000, accountId: 'bca', toAccountId: 'gopay', fee: 1000 });
    expect(parseQuickAdd('tarik tunai 500rb', ctx)[0]).toMatchObject({ type: 'TRANSFER', accountId: 'bca', toAccountId: 'cash' });
    expect(parseQuickAdd('pinjemin ke friends 1jt', ctx)[0]).toMatchObject({ type: 'TRANSFER', toAccountId: 'friends' });
  });

  it('does not treat "isi bensin" as a top-up', () =>
    expect(parseQuickAdd('isi bensin 50rb', ctx)[0]).toMatchObject({ type: 'EXPENSE', categoryId: 'transport' }));

  it('uses the credit card only when asked', () => {
    expect(parseQuickAdd('netflix 186rb cc bca', ctx)[0].accountId).toBe('cc');
    expect(parseQuickAdd('netflix 186rb bca', ctx)[0].accountId).toBe('bca');
  });

  it('reads date words', () => {
    expect(parseQuickAdd('kmrn bensin 100rb', ctx)[0].date).toBe('2026-10-16');
    expect(parseQuickAdd('kemarin lusa bensin 100rb', ctx)[0].date).toBe('2026-10-15');
    expect(parseQuickAdd('senin makan 30rb', ctx)[0].date).toBe('2026-10-12');
    expect(parseQuickAdd('tgl 20 makan 30rb', ctx)[0].date).toBe('2026-09-20');
  });

  it('applies workspace aliases', () => {
    const [d] = parseQuickAdd('warkop 15rb', { ...ctx, aliases: [{ alias: 'warkop', kind: 'MERCHANT', value: 'Warkop Bang Ali' }] });
    expect(d).toMatchObject({ merchant: 'Warkop Bang Ali', rawMerchant: 'warkop' });
  });

  it('turns a part without an amount into a note', () => {
    const d = parseQuickAdd('makan 30rb dan es teh', ctx);
    expect(d).toHaveLength(1);
    expect(d[0].note).toBe('es teh');
  });

  it('never guesses M', () => {
    const [d] = parseQuickAdd('laptop 2m', ctx);
    expect(d).toMatchObject({ amount: null, candidates: [2000000, 2000000000], needsConfirm: true });
  });
});
