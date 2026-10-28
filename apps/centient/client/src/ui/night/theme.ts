// The retro theme's fonts and stylesheet, loaded once for the whole app. Words use DotGothic16; digits and the
// marks around them use "Centient Digits", M PLUS 1 limited by unicode-range, so every amount picks it up
// without each component naming a font.
import '@fontsource/dotgothic16/latin.css';
import digitsUrl from '@fontsource-variable/m-plus-1/files/m-plus-1-latin-wght-normal.woff2?url';
import './night.css';

const digits = new FontFace('Centient Digits', `url(${digitsUrl}) format('woff2')`, {
  weight: '100 900', unicodeRange: 'U+0030-0039, U+002B-002E, U+0025, U+2212', display: 'swap',
});
document.fonts.add(digits);
digits.load().catch(() => { /* ponytail: digits fall back to the pixel face */ });
