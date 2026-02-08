import { chromium } from '@playwright/test';

const pages = ['/', '/vendas', '/categorias', '/clientes', '/financeiro', '/compras'];

function pickBig(items) {
  return items.filter((i) => i.w > 40 || i.h > 40).slice(0, 20);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

for (const route of pages) {
  await page.goto(`http://localhost:3000${route}`, { waitUntil: 'networkidle' });
  const data = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('svg, .app-icon')];
    return nodes.map((el) => {
      const r = el.getBoundingClientRect();
      const cls = (el.getAttribute('class') || '').trim();
      const tag = el.tagName.toLowerCase();
      return {
        tag,
        cls,
        w: Math.round(r.width),
        h: Math.round(r.height),
        outer: (el.outerHTML || '').slice(0, 220)
      };
    });
  });

  const big = pickBig(data);
  console.log(`ROUTE ${route} total=${data.length} big=${big.length}`);
  for (const item of big) {
    console.log(`  ${item.tag} ${item.w}x${item.h} class=${item.cls}`);
  }
}

await browser.close();
