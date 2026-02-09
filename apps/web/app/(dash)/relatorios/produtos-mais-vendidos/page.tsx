import { fetchList, formatCurrency, isInDateRange, toNumber } from '../../lib';
import ReportDetailPanel from '../report-detail-panel';
import { buildReportRangeContext, type ReportSearchParams } from '../range';

type TopProduct = {
  product_name: string;
  sku: string;
  brand?: string | null;
  sold_qty: number | string;
  sold_total: number | string;
  last_sale_at: string;
};

export default async function RelatorioProdutosMaisVendidosPage({
  searchParams
}: {
  searchParams?: Promise<ReportSearchParams>;
}) {
  const resolvedParams = (await searchParams) || {};
  const { dateRange, periodLabel, rangeQuery } = buildReportRangeContext(resolvedParams);
  const response = await fetchList<TopProduct>(`/reports/top-products${rangeQuery}`);
  const products = (response?.data ?? []).filter((product) => isInDateRange(product.last_sale_at, dateRange));

  const columns = [
    { key: 'rank', label: '#' },
    { key: 'code', label: 'CÓDIGO' },
    { key: 'product', label: 'PRODUTO' },
    { key: 'brand', label: 'MARCA' },
    { key: 'qty', label: 'QTND.' },
    { key: 'total', label: 'TOTAL VENDAS' }
  ];

  const rows = products.map((product, index) => {
    const qty = toNumber(product.sold_qty);
    return {
      id: `${product.sku || product.product_name}-${index}`,
      values: {
        rank: `${index + 1}º`,
        code: product.sku || '-',
        product: product.product_name || '-',
        brand: product.brand || 'Sem marca',
        qty: `${qty} un.`,
        total: formatCurrency(toNumber(product.sold_total))
      }
    };
  });

  return (
    <main className="page-content">
      <ReportDetailPanel
        breadcrumb="Relatórios › Produtos mais vendidos"
        title="Produtos mais vendidos"
        columns={columns}
        rows={rows}
        periodLabel={periodLabel}
        exportBaseName="relatorio-produtos-mais-vendidos"
        emptyTitle="Nenhum produto vendido no periodo"
        emptyMessage="Nao ha vendas de produtos no periodo selecionado."
      />
    </main>
  );
}
