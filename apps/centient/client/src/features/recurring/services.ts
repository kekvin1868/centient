// Well-known services offered while naming a bill. `key` is the word a logged expense carries as its merchant
// (lower case): the server moves a bill on when an expense with that merchant pays it. `category` is one of the
// seeded category names; a workspace without it just leaves the category for the owner to pick.
export type Service = { key: string; name: string; category: string; varies?: true };

export const SERVICES: readonly Service[] = [
  { key: 'netflix', name: 'Netflix', category: 'Fun' },
  { key: 'spotify', name: 'Spotify', category: 'Fun' },
  { key: 'youtube', name: 'YouTube Premium', category: 'Fun' },
  { key: 'disney', name: 'Disney+ Hotstar', category: 'Fun' },
  { key: 'vidio', name: 'Vidio', category: 'Fun' },
  { key: 'icloud', name: 'iCloud+', category: 'Home & Bills' },
  { key: 'google one', name: 'Google One', category: 'Home & Bills' },
  { key: 'indihome', name: 'IndiHome', category: 'Home & Bills' },
  { key: 'biznet', name: 'Biznet', category: 'Home & Bills' },
  { key: 'telkomsel', name: 'Telkomsel', category: 'Home & Bills' },
  { key: 'pln', name: 'PLN (electricity)', category: 'Home & Bills', varies: true },
  { key: 'pdam', name: 'PDAM (water)', category: 'Home & Bills', varies: true },
  { key: 'bpjs', name: 'BPJS Kesehatan', category: 'Health' },
  { key: 'kos', name: 'Kos / rent', category: 'Home & Bills' },
];

/** The service whose name was typed or picked, whatever its capitals. */
export const serviceNamed = (name: string) =>
  SERVICES.find(s => s.name.toLowerCase() === name.trim().toLowerCase());
