// Reading payment screens and receipts: the texts below are written the way those screens read (no real photo
// was available), so they pin the rules, not the phone's reader.
import { describe, expect, it } from 'vitest';
import { readDay } from '../src/domain/readDay';
import { readReceipt } from '../src/domain/receipt';

const TODAY = '2026-10-05';

describe('finding a day in a line', () => {
  it('reads a date inside other words', () => {
    expect(readDay('Waktu 4 Okt 2026, 09.41')).toBe('2026-10-04');
    expect(readDay('03-10-2026 19:24')).toBe('2026-10-03');
    expect(readDay('Tanggal: 03/10/26')).toBe('2026-10-03');
    expect(readDay('2026-10-04T09:41:00+07:00')).toBe('2026-10-04');
  });

  it('does not take an amount, a time or a reference for a date', () => {
    expect(readDay('TOTAL 47.500')).toBeNull();
    expect(readDay('Rp 12.500.000')).toBeNull();
    expect(readDay('19:24')).toBeNull();
    expect(readDay('No. referensi 2610 0409 4127')).toBeNull();
    expect(readDay('Nasi campur 22.000')).toBeNull();
  });
});

describe('reading a receipt', () => {
  it('reads an e-wallet QRIS proof', () => {
    const text = [
      'Pembayaran QRIS berhasil',
      'Kamu membayar',
      'Rp 25.000',
      'ke',
      'Kopi Senja',
      'Metode QRIS',
      'Waktu 4 Okt 2026, 09.41',
      'No. referensi 2610 0409 4127',
      'Email ini dikirim otomatis. Simpan sebagai bukti pembayaran.',
    ].join('\n');
    expect(readReceipt(text, TODAY)).toEqual({
      kind: 'TRANSACTION',
      amount: 25_000,
      direction: 'OUT',
      date: '2026-10-04',
      merchant: 'Kopi Senja',
      reference: '261004094127',
    });
  });

  it('reads a shop receipt: the total, not the cash or the change', () => {
    const text = [
      'WARUNG BU TINI',
      'Jl. Melati 12, Bandung',
      '03-10-2026 19:24',
      'Nasi campur 22.000',
      'Ayam goreng 18.000',
      'Es teh manis 7.500',
      'SUBTOTAL 47.500',
      'TOTAL 47.500',
      'TUNAI 50.000',
      'KEMBALI 2.500',
      'Terima kasih',
    ].join('\n');
    expect(readReceipt(text, TODAY)).toMatchObject({
      kind: 'TRANSACTION',
      amount: 47_500,
      date: '2026-10-03',
      merchant: 'WARUNG BU TINI',
      reference: null,
    });
  });

  it('reads a bank transfer proof with the amount on the label line', () => {
    const text = [
      'm-Transfer BERHASIL',
      '04/10/2026 12:01:33',
      'Ke 1234567890',
      'BUDI SANTOSO',
      'Nominal Rp 1.250.000,00',
      'Biaya Admin Rp 2.500',
      'Ref 20261004ABC123',
    ].join('\n');
    expect(readReceipt(text, TODAY)).toMatchObject({
      amount: 1_250_000,
      date: '2026-10-04',
      reference: '20261004ABC123',
    });
  });

  it('falls back to the biggest marked figure when no label is found', () => {
    expect(
      readReceipt('GoPay\nRp18.000\nOjek ke kantor\nSaldo akhir Rp 82.000 berhasil', TODAY),
    ).toMatchObject({ kind: 'TRANSACTION', amount: 18_000 });
  });

  it('takes a balance screen for a balance check', () => {
    expect(
      readReceipt('Mandiri e-money\n6032 9812 3456 7890\nSaldo\nRp 152.500', TODAY),
    ).toMatchObject({
      kind: 'BALANCE',
      amount: 152_500,
      direction: 'OUT',
    });
    expect(readReceipt('Sisa Saldo Rp 40.000', TODAY).kind).toBe('BALANCE');
  });

  it('knows money coming in', () => {
    expect(readReceipt('Uang masuk\nKamu menerima Rp 500.000\ndari Andi', TODAY)).toMatchObject({
      direction: 'IN',
      amount: 500_000,
    });
  });

  it('gives up politely: no amount, a date too old or ahead', () => {
    expect(readReceipt('hello world', TODAY)).toEqual({
      kind: 'TRANSACTION',
      amount: null,
      direction: 'OUT',
      date: null,
      merchant: 'hello world',
      reference: null,
    });
    expect(readReceipt('Total 5.000\n01/01/2020', TODAY).date).toBeNull();
    expect(readReceipt('Total 5.000\n01/12/2026', TODAY).date).toBeNull();
    expect(readReceipt('', TODAY).amount).toBeNull();
  });
});

describe('day order and unreal days', () => {
  it('reads slashes day-first unless told otherwise, and written months either way', () => {
    expect(readDay('10/11/2026')).toBe('2026-11-10');
    expect(readDay('10/11/2026', 'MDY')).toBe('2026-10-11');
    expect(readDay('3-1-26 14:00')).toBe('2026-01-03');
    expect(readDay('17 Agustus 2026')).toBe('2026-08-17');
    expect(readDay('Nov 10, 2026')).toBe('2026-11-10');
  });

  it('refuses what is not a real day', () => {
    expect(readDay('31/02/2026')).toBeNull();
    expect(readDay('2026-13-01')).toBeNull();
    expect(readDay('yesterday')).toBeNull();
    expect(readDay('')).toBeNull();
  });
});
