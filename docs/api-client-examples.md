# Exemplos de uso do API Client

## Web (Next.js)
```ts
import { api } from '@/src/lib/api';

export async function loadProducts() {
  const response = await api.listProducts();
  return response.data;
}
```

## Mobile (React Native)
```ts
import { api } from '../lib/api';

export async function loadCatalog() {
  const response = await api.listStorefrontCatalog();
  return response.data;
}
```

## Criar venda (PDV)
```ts
import { api } from '@/src/lib/api';

await api.checkoutSale({
  items: [{ sku: 'SKU-001', quantity: 1, price: 49.9 }],
  payments: [{ method: 'pix', amount: 49.9 }]
});
```
