// Helper to resolve brand logo URLs from known public sources.
// Prefers a provided remote logo, then falls back to curated URLs for common brands.

const BRAND_LOGOS: Record<string, string> = {
  avon: 'https://upload.wikimedia.org/wikipedia/commons/5/5d/Avon_logo.svg',
  natura: 'https://www.nicepng.com/png/full/353-3535094_natura-logo-de-natura-cosmeticos.png',
  oboticario: 'https://upload.wikimedia.org/wikipedia/commons/1/1d/O_Botic%C3%A1rio_Logo.png',
  'o-boticario': 'https://upload.wikimedia.org/wikipedia/commons/1/1d/O_Botic%C3%A1rio_Logo.png',
  'o boticario': 'https://upload.wikimedia.org/wikipedia/commons/1/1d/O_Botic%C3%A1rio_Logo.png'
};

const normalizeName = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();

export const resolveBrandLogo = (name?: string | null, providedLogo?: string | null) => {
  const fromData = providedLogo?.trim();
  if (fromData) return fromData;

  const normalized = normalizeName(name);
  if (!normalized) return null;
  return BRAND_LOGOS[normalized] || null;
};

