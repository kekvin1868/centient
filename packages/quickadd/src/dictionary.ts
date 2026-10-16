// Seeded dictionaries for quick add. Workspace aliases (the `aliases` table) override these.

/** Chat abbreviations expanded before parsing. Common usage, not from a published source. */
export const ABBREVIATIONS: Record<string, string> = {
  mkn: 'makan', mnm: 'minum', byr: 'bayar', blnj: 'belanja', jjn: 'jajan', tf: 'transfer',
  bnsn: 'bensin', prkr: 'parkir', pkr: 'parkir', lstrk: 'listrik', pls: 'pulsa', ojol: 'ojek',
  kmrn: 'kemarin', td: 'tadi', dpt: 'dapat', ptgn: 'patungan', bg: 'bagi', tgl: 'tanggal',
  pake: 'pakai', topup: 'top-up', cc: 'kartu-kredit',
};

/** Merchant shorthands; values keep their real spelling. */
export const MERCHANT_ALIASES: Record<string, string> = {
  ph: 'Pizza Hut', mcd: "McDonald's", mekdi: "McDonald's", kfc: 'KFC', sbux: 'Starbucks',
  starbak: 'Starbucks', kopken: 'Kopi Kenangan', jiwa: 'Janji Jiwa', indomrt: 'Indomaret',
  alfa: 'Alfamart', tj: 'TransJakarta',
};

/** Words that name an account's provider. Matched against accounts.provider. */
export const PROVIDER_ALIASES: Record<string, string> = {
  gopay: 'GOPAY', gpay: 'GOPAY', ovo: 'OVO', dana: 'DANA', shopeepay: 'SHOPEEPAY', spay: 'SHOPEEPAY',
  linkaja: 'LINKAJA', bca: 'BCA', mybca: 'BCA', mandiri: 'MANDIRI', livin: 'MANDIRI', bri: 'BRI',
  brimo: 'BRI', bni: 'BNI', wondr: 'BNI', seabank: 'SEABANK', jago: 'JAGO', blu: 'BLU',
  spaylater: 'SPAYLATER', gopaylater: 'GOPAYLATER', kredivo: 'KREDIVO', akulaku: 'AKULAKU',
};

export const CASH_WORDS = new Set(['cash', 'tunai']);

/** Hokkien money words that are not digit + unit. Ambiguous ones carry candidates for the context engine. */
export const HOKKIEN_EXACT: Record<string, number> = { cenggo: 1500, pego: 150_000 };
export const HOKKIEN_AMBIGUOUS: Record<string, number[]> = {
  gopek: [500, 500_000], cepek: [100, 100_000], gocap: [50, 50_000],
};
export const HOKKIEN_DIGITS: Record<string, number> = {
  ce: 1, se: 1, it: 1, no: 2, ji: 2, sa: 3, si: 4, go: 5, lak: 6, cit: 7, pek: 8, kau: 9,
};
export const HOKKIEN_UNITS: Record<string, number> = { ceng: 1_000, ban: 10_000, tiao: 1_000_000 };

export const FILLER = new Set(['yg', 'yang', 'dgn', 'dengan', 'utk', 'untuk', 'di', 'sm', 'sama', 'buat', 'bwt', 'aku', 'saya', 'gw', 'gue', 'orang', 'org', 'tadi', 'hari', 'ini']);
export const VERBS = new Set(['makan', 'minum', 'bayar', 'beli', 'belanja', 'jajan', 'patungan']);
export const INCOME_WORDS = new Set(['gaji', 'terima', 'dapat', 'masuk', 'cashback', 'angpao', 'thr', 'bonus', 'refund']);
// Lending and borrowing are transfers to or from a person's IOU account.
export const TRANSFER_WORDS = new Set(['transfer', 'top-up', 'pindah', 'tarik', 'pinjam', 'pinjem', 'pinjamkan', 'pinjemin', 'minjemin']);

/** Keyword -> seeded category name, with the price range the context engine uses for a bare number. */
export type Hint = { category: string; range?: [number, number] };
export const KEYWORDS: Record<string, Hint> = {};
const add = (words: string, category: string, range?: [number, number]) => {
  for (const w of words.split(',')) KEYWORDS[w.trim()] = { category, range };
};
add('makan,nasi,bakso,mie,mi,ayam,sate,soto,warteg,padang,pizza,burger,sushi,ramen,martabak,gofood,grabfood,sarapan,lunch,dinner,breakfast,snack,jajan,minum,kfc,mcdonald\'s', 'Food & Drink', [5_000, 2_000_000]);
add('kopi,coffee,latte,starbucks,tuku,fore,janji', 'Coffee', [5_000, 300_000]);
add('belanja,indomaret,alfamart,sayur,supermarket,groceries', 'Groceries', [5_000, 5_000_000]);
add('bensin,pertamina,ojek,gojek,goride,gocar,grab,grabcar,taxi,taksi,bluebird,krl,mrt,transjakarta,tol,kereta', 'Transport', [5_000, 2_000_000]);
add('parkir', 'Transport', [1_000, 100_000]);
add('listrik,pln,pdam,internet,indihome,wifi,kuota,bpjs', 'Bills & Utilities', [10_000, 5_000_000]);
add('pulsa', 'Bills & Utilities', [5_000, 1_000_000]);
add('kos,kost,sewa,kontrakan,rent', 'Housing', [300_000, 50_000_000]);
add('obat,apotek,dokter,klinik', 'Health', [5_000, 10_000_000]);
add('nonton,bioskop,xxi,cgv,netflix,spotify,game,arcade,maimai,timezone', 'Entertainment', [5_000, 2_000_000]);
add('baju,sepatu,shopee,tokopedia,uniqlo', 'Shopping', [20_000, 5_000_000]);
add('hp,iphone,laptop', 'Shopping', [500_000, 50_000_000]);
add('perpuluhan,persembahan,kolekte,zakat,sedekah,infaq,donasi', 'Giving', [1_000, 100_000_000]);
add('kondangan,nikahan,amplop', 'Kondangan', [50_000, 10_000_000]);
add('buku,kursus,les,sekolah,kuliah', 'Education', [10_000, 50_000_000]);
add('admin', 'Fees', [500, 100_000]);
add('gaji,bonus', 'Salary', [100_000, 1_000_000_000]);
add('angpao,thr', 'Angpao & THR', [10_000, 100_000_000]);
add('cashback,bunga', 'Interest & cashback', [100, 10_000_000]);

/** Used when nothing else gives a range: most typed amounts are thousands. */
export const DEFAULT_RANGE: [number, number] = [1_000, 1_000_000];

export const DAY_NAMES: Record<string, number> = {
  minggu: 0, min: 0, senin: 1, sen: 1, selasa: 2, sel: 2, rabu: 3, rab: 3,
  kamis: 4, kam: 4, jumat: 5, jum: 5, sabtu: 6, sab: 6,
};
