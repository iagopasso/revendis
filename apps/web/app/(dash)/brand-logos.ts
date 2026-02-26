// Helper to resolve brand logos from official brand-hosted assets.
// Prefers a user-provided logo, then falls back to curated brand logo URLs.

const BRAND_LOGOS: Record<string, string> = {
  avon: 'https://www.avon.com.br/logo-avon.jpeg',
  marykay:
    'https://marykay.vtexassets.com/assets/vtex.file-manager-graphql/images/ffe2fd17-53a1-45ea-8a51-56e280f5514a___b6dafa2ee6132275f6dc205b657dfef6.svg',
  tupperware:
    'https://www.tupperware.com.br/cdn/shop/files/Tupperware_logo_600x600_f417913f-313a-4370-ac17-ab6d54f91ed5.jpg?v=1737474750',
  tupper:
    'https://www.tupperware.com.br/cdn/shop/files/Tupperware_logo_600x600_f417913f-313a-4370-ac17-ab6d54f91ed5.jpg?v=1737474750',
  tuppware:
    'https://www.tupperware.com.br/cdn/shop/files/Tupperware_logo_600x600_f417913f-313a-4370-ac17-ab6d54f91ed5.jpg?v=1737474750',
  tupparware:
    'https://www.tupperware.com.br/cdn/shop/files/Tupperware_logo_600x600_f417913f-313a-4370-ac17-ab6d54f91ed5.jpg?v=1737474750',
  tupware:
    'https://www.tupperware.com.br/cdn/shop/files/Tupperware_logo_600x600_f417913f-313a-4370-ac17-ab6d54f91ed5.jpg?v=1737474750',
  eudora:
    'https://res.cloudinary.com/beleza-na-web/image/upload/f_svg,fl_progressive,q_auto:eco/v1/blz/assets-store/0.0.563/images/store/46/logo.svg',
  boticario:
    'https://res.cloudinary.com/beleza-na-web/image/upload/f_svg,fl_progressive,q_auto:eco/v1/blz/assets-store/0.0.563/images/store/47/logo.svg',
  oboticario:
    'https://res.cloudinary.com/beleza-na-web/image/upload/f_svg,fl_progressive,q_auto:eco/v1/blz/assets-store/0.0.563/images/store/47/logo.svg',
  oui:
    'https://res.cloudinary.com/beleza-na-web/image/upload/f_svg,fl_progressive,q_auto:eco/v1/blz/assets-store/0.0.563/images/store/60/logo.svg',
  natura: 'https://images.rede.natura.net/html/crm/campanha/20180528/N__LOGO_NATURA_20180528_01.png',
  demillus: 'https://demillus.vestemuitomelhor.com.br/wp-content/uploads/2026/02/logo-DeMillus-Preto-1024x250.png',
  farmasi: 'https://content.farmasi.com.br/logo.png?v=3',
  hinode: 'https://hinodeonlineio.vtexassets.com/arquivos/logo-hinodegroup.png',
  jequiti:
    'https://jequiti.vtexassets.com/assets/vtex/assets-builder/jequiti.mz-store-theme/2.0.25/svg/header-logo___f01f42de46aa86d94a37a9771567193e.svg',
  loccitane:
    'https://br.loccitaneaubresil.com/on/demandware.static/-/Sites-lbr-storefront-catalog/default/dwf0a06de1/logo-menu.png',
  loccitaneaubresil:
    'https://br.loccitaneaubresil.com/on/demandware.static/-/Sites-lbr-storefront-catalog/default/dwf0a06de1/logo-menu.png',
  mahogany:
    'https://mahogany.vtexassets.com/assets/vtex/assets-builder/mahogany.mahogany-theme/2.0.68/images/logo-mobile___7a380ea0bb9fe2a9f6af5c655b699df5.png',
  momentsparis: 'https://momentsparis.com.br/wp-content/uploads/2024/06/FAVIOCN-300x300.png',
  odorata: 'https://odorata.com.br/wp-content/uploads/2023/12/logo-odorata-preto.png',
  quemdisseberenice:
    'https://res.cloudinary.com/beleza-na-web/image/upload/f_svg,fl_progressive,q_auto:eco/v1/blz/assets-store/0.0.563/images/store/45/logo.svg',
  qdb:
    'https://res.cloudinary.com/beleza-na-web/image/upload/f_svg,fl_progressive,q_auto:eco/v1/blz/assets-store/0.0.563/images/store/45/logo.svg',
  racco:
    'https://acdn-us.mitiendanube.com/stores/002/001/491/themes/common/logo-955397231-1738347549-0579833d27726fb6d6bd5ad701dbdf061738347549.png?0',
  skelt:
    'https://skelt.vtexassets.com/assets/vtex/assets-builder/skelt.theme-skelt/2.0.13/logo/logo-black___3b0a463e584692cba903c13aa9e9cabb.svg',
  extase: 'https://images.tcdn.com.br/img/img_prod/1239485/1765204191_logo_sitee_1.png',
  extasee: 'https://images.tcdn.com.br/img/img_prod/1239485/1765204191_logo_sitee_1.png',
  extasis: 'https://images.tcdn.com.br/img/img_prod/1239485/1765204191_logo_sitee_1.png',
  extasecosmeticos: 'https://images.tcdn.com.br/img/img_prod/1239485/1765204191_logo_sitee_1.png',
  diamante: 'https://cdn.awsli.com.br/1757/1757440/logo/diamante-profissional-logo-hzz9qznct6.jpg',
  diamanteq: 'https://cdn.awsli.com.br/1757/1757440/logo/diamante-profissional-logo-hzz9qznct6.jpg'
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
