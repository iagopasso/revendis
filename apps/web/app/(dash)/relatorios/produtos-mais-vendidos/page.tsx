import { fetchList, toNumber } from '../../lib';
import ReportDetailPanel from '../report-detail-panel';

type TopProduct = {
  product_name: string;
  sku: string;
  sold_qty: number | string;
  sold_total: number | string;
  last_sale_at: string;
};

export default async function RelatorioProdutosMaisVendidosPage() {
  const response = await fetchList<TopProduct>('/reports/top-products');
  const products = response?.data ?? [];

  const rows = products.map((product) => ({
    date: product.last_sale_at,
    primary: product.product_name,
    secondary: `SKU ${product.sku} | ${toNumber(product.sold_qty)} unidades`,
    status: 'Vendido',
    value: toNumber(product.sold_total)
  }));

  return (
    <main className="page-content">
      <ReportDetailPanel
        breadcrumb="Relatorios > Produtos mais vendidos"
        title="Produtos mais vendidos"
        rows={rows}
        exportBaseName="relatorio-produtos-mais-vendidos"
        emptyTitle="Nenhum produto vendido no periodo"
        emptyMessage="Nao ha vendas de produtos nos ultimos 28 dias."
      />
    </main>
  );
}
