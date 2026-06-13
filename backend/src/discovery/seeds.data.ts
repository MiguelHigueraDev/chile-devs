/**
 * Curated seeds for contributor-based discovery (see ContributorSource).
 *
 * These are starting points only — the lists are meant to be extended over time.
 * Unknown / renamed org logins and repos fail gracefully (they simply yield no
 * candidates), so it is safe to add speculative entries.
 */

export type OrgSeed = {
  // GitHub organization login (the `:org` in github.com/:org).
  login: string;
  // Human-readable name, used for logging only.
  name: string;
};

// Chilean companies, universities, government and community GitHub orgs whose
// members are very likely to be Chilean developers.
export const CHILEAN_ORG_SEEDS: OrgSeed[] = [
  { login: 'dcc-uchile', name: 'DCC - Universidad de Chile' },
  { login: 'Cornershop', name: 'Cornershop' },
  { login: 'jumpseller', name: 'Jumpseller' },
  { login: 'khipu', name: 'Khipu' },
  { login: 'fintual', name: 'Fintual' },
  { login: 'NotCo', name: 'NotCo' },
  { login: 'buildersclub-cl', name: 'Builders Club' },
  { login: 'platanus', name: 'Platanus' },
  { login: 'magnet-cl', name: 'Magnet' },
  { login: 'continuum-cl', name: 'Continuum' },
  { login: 'GobDigital', name: 'Gobierno Digital de Chile' },
  { login: 'gobiernodigitalcl', name: 'Gobierno Digital de Chile' },
  { login: 'pythonchile', name: 'Python Chile' },
  { login: 'js-chile', name: 'JavaScript Chile' },
];

// Notable open-source repositories with a strong Chilean contributor base,
// expressed as "owner/repo".
export const CHILEAN_REPO_SEEDS: string[] = [
  'dcc-uchile/CC3501',
  'OpenBeauchef/IIC2233-Syllabus',
  'jumpseller/zip-codes',
  'fintual/serpiente-emplumada',
];

// Free-text `company` markers (already normalized: accent-stripped, lowercased)
// that strongly indicate the developer works at a Chilean company or studies at a
// Chilean university. The GitHub `company` field is free text, so substring matching
// on these markers is more robust than matching exact org logins.
export const CHILEAN_COMPANY_MARKERS: string[] = [
  'cornershop',
  'jumpseller',
  'khipu',
  'fintual',
  'notco',
  'betterfly',
  'getonbrd',
  'platanus',
  'magnet',
  'continuum',
  'toku',
  'reversso',
  'xepelin',
  'cumplo',
  'buk',
  'universidad de chile',
  'uchile',
  'u. de chile',
  'pontificia universidad catolica',
  'universidad catolica',
  'puc chile',
  'uc chile',
  'usach',
  'universidad de santiago',
  'utfsm',
  'usm',
  'universidad tecnica federico santa maria',
  'universidad de concepcion',
  'universidad austral',
  'universidad de valparaiso',
  'inacap',
  'duoc',
];
