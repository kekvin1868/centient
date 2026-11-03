// A PDF of JPEG pages, written by hand: one picture per A4 page, filling it. A few dozen lines instead of a library,
// since the report is pictures of the screen anyway (Q39).
// ponytail: pictures only; text, links or other page sizes would want a real PDF library.

export type JpegPage = { jpeg: Uint8Array; width: number; height: number }; // the picture's size in pixels
export const A4 = { w: 595.28, h: 841.89 }; // points

export function jpegPdf(pages: JpegPage[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === 'string' ? enc.encode(b) : b;
    parts.push(u);
    size += u.length;
  };
  const obj = (n: number, dict: string, stream?: Uint8Array) => {
    offsets[n] = size;
    push(`${n} 0 obj\n${dict}\n`);
    if (stream) {
      push('stream\n');
      push(stream);
      push('\nendstream\n');
    }
    push('endobj\n');
  };
  push('%PDF-1.4\n%âãÏÓ\n'); // the second line marks the file as binary
  // 1 catalog, 2 page tree, then per page i: 3+3i the page, 4+3i what it draws, 5+3i its picture.
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(
    2,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] >>`,
  );
  pages.forEach((p, i) => {
    const draw = enc.encode(`q ${A4.w} 0 0 ${A4.h} 0 0 cm /Im0 Do Q`);
    obj(
      3 + 3 * i,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /XObject << /Im0 ${5 + 3 * i} 0 R >> >> /Contents ${4 + 3 * i} 0 R >>`,
    );
    obj(4 + 3 * i, `<< /Length ${draw.length} >>`, draw);
    obj(
      5 + 3 * i,
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>`,
      p.jpeg,
    );
  });
  const count = 3 + 3 * pages.length;
  const xref = size;
  push(
    `xref\n0 ${count}\n0000000000 65535 f \n${offsets
      .slice(1)
      .map(o => `${String(o).padStart(10, '0')} 00000 n \n`)
      .join('')}` + `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  const out = new Uint8Array(size);
  let at = 0;
  for (const u of parts) {
    out.set(u, at);
    at += u.length;
  }
  return out;
}
