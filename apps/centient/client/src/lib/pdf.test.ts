import { describe, expect, it } from 'vitest';
import { jpegPdf } from './pdf';

const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

describe('jpegPdf', () => {
  it('writes one page per picture with a correct cross-reference table', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = jpegPdf([{ jpeg, width: 2, height: 3 }, { jpeg, width: 4, height: 5 }]);
    const s = text(pdf);
    expect(s.startsWith('%PDF-1.4\n')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(s).toContain('/Type /Pages /Count 2 /Kids [3 0 R 6 0 R]');
    expect(s).toContain('/Width 4 /Height 5');
    // startxref points at the table, and every entry points at its object.
    const start = Number(s.match(/startxref\n(\d+)/)![1]);
    expect(s.slice(start, start + 4)).toBe('xref');
    const entries = s.slice(start).match(/^\d{10} 00000 n $/gm)!;
    expect(entries).toHaveLength(8);
    entries.forEach((e, i) => expect(s.slice(Number(e.slice(0, 10))).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });
});
