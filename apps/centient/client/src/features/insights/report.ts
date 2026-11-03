// The Insights report as an A4 PDF (Q39, Q43). Each `[data-report]` section on screen is drawn as a picture in the
// light "paper" look (dark mode is switched off for the moment it takes, behind a cover), then the pictures are packed
// onto pages: a section that doesn't fit moves whole to the next page. Page 1 starts with the title; each page ends
// with "Centient · made 3 Nov 2026 · page 1 of 2". html-to-image loads only when a report is made.
import dotUrl from '@fontsource/dotgothic16/files/dotgothic16-latin-400-normal.woff2?url';
import digitsUrl from '@fontsource-variable/m-plus-1/files/m-plus-1-latin-wght-normal.woff2?url';
import { A4, jpegPdf } from '../../lib/pdf';

const SCALE = 1240 / A4.w; // A4 at 150 dpi: 1240 × 1754 px
const PAGE = { w: 1240, h: Math.round(A4.h * SCALE) };
const MARGIN = 80;
const TITLE = 96; // the title's band on page 1
const FOOTER = 60;
const GAP = 36;

/** Where each section goes: in order; one that doesn't fit what's left starts the next page; one taller than a page shrinks to fit. */
export function paginate(heights: number[], first: number, full: number, gap: number) {
  const out: { page: number; y: number; h: number }[] = [];
  let page = 0, cap = first, y = 0;
  for (const h of heights) {
    let top = y ? y + gap : 0;
    if (y && top + h > cap) { page++; cap = full; top = 0; }
    const fit = Math.min(h, cap - top);
    out.push({ page, y: top, h: fit });
    y = top + fit;
  }
  return out;
}

const dataUrl = async (url: string) => {
  const blob = await (await fetch(url)).blob();
  return new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = fail; r.readAsDataURL(blob); });
};

/** The two faces the screen uses, inlined: "Centient Digits" is added from code, so html-to-image would not find it. */
async function fontCss() {
  const [dot, digits] = await Promise.all([dataUrl(dotUrl), dataUrl(digitsUrl)]);
  return `@font-face{font-family:"DotGothic16";src:url(${dot}) format("woff2");font-weight:400}`
    + `@font-face{font-family:"Centient Digits";src:url(${digits}) format("woff2");font-weight:100 900;unicode-range:U+0030-0039,U+002B-002E,U+0025,U+2212}`;
}

const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

export async function makeReport(root: HTMLElement, o: { title: string; made: string; name: string }): Promise<File> {
  const [{ toCanvas }, fontEmbedCSS] = await Promise.all([import('html-to-image'), fontCss()]);
  const html = document.documentElement;
  const dark = html.classList.contains('dark');
  // Colours fade between the themes; with transitions off the light ones apply at once.
  const still = Object.assign(document.createElement('style'), { textContent: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  document.head.appendChild(still);
  html.classList.remove('dark');
  let shots: HTMLCanvasElement[];
  let paper: string, ink: string;
  try {
    await frame(); // let the light styles apply
    ({ backgroundColor: paper, color: ink } = getComputedStyle(document.body));
    const width = PAGE.w - 2 * MARGIN;
    shots = [];
    for (const node of root.querySelectorAll<HTMLElement>('[data-report]')) {
      shots.push(await toCanvas(node, {
        pixelRatio: width / node.offsetWidth, backgroundColor: paper, fontEmbedCSS,
        filter: n => !(n instanceof HTMLElement && n.dataset.noprint !== undefined),
      }));
    }
  } finally {
    if (dark) html.classList.add('dark');
    still.remove();
  }

  const full = PAGE.h - 2 * MARGIN - FOOTER;
  const places = paginate(shots.map(s => s.height), full - TITLE, full, GAP);
  const count = (places.at(-1)?.page ?? 0) + 1;
  await document.fonts.load('40px DotGothic16');
  const pages = [];
  for (let p = 0; p < count; p++) {
    const c = Object.assign(document.createElement('canvas'), { width: PAGE.w, height: PAGE.h });
    const g = c.getContext('2d')!;
    g.fillStyle = paper;
    g.fillRect(0, 0, PAGE.w, PAGE.h);
    g.fillStyle = ink;
    g.textBaseline = 'alphabetic';
    if (p === 0) { g.font = '44px "DotGothic16"'; g.fillText(o.title, MARGIN, MARGIN + 48); }
    const top = MARGIN + (p === 0 ? TITLE : 0);
    places.forEach((at, i) => {
      if (at.page !== p) return;
      const s = shots[i];
      const w = (s.width * at.h) / s.height; // shrunk sections keep their shape
      g.drawImage(s, MARGIN + (PAGE.w - 2 * MARGIN - w) / 2, top + at.y, w, at.h);
    });
    g.font = '22px "DotGothic16"';
    g.globalAlpha = 0.7;
    g.fillText(`Centient · made ${o.made} · page ${p + 1} of ${count}`, MARGIN, PAGE.h - MARGIN + 10);
    g.globalAlpha = 1;
    const blob = await new Promise<Blob>((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error('Could not draw the report'))), 'image/jpeg', 0.88));
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: PAGE.w, height: PAGE.h });
  }
  return new File([jpegPdf(pages)], o.name, { type: 'application/pdf' });
}
