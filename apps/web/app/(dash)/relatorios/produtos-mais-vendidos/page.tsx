import { fetchList, formatCurrency, getStringParam, toNumber, digitsOnly } from '../../lib';
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

type SaleCustomer = {
  customer_id?: string | null;
  customer_name?: string | null;
  created_at: string;
};

const getCustomerValue = (sale: SaleCustomer) => {
  const customerId = sale.customer_id?.trim();
  if (customerId) return customerId;
  return sale.customer_name?.trim() || '';
};

const getCustomerLabel = (sale: SaleCustomer) => sale.customer_name?.trim() || '';

export default async function RelatorioProdutosMaisVendidosPage({
  searchParams
}: {
  searchParams?: Promise<ReportSearchParams>;
}) {
  const resolvedParams = (await searchParams) || {};
  const selectedCustomer = getStringParam(resolvedParams.customer).trim();
  const { periodLabel, rangeQuery } = buildReportRangeContext(resolvedParams);
  const reportQueryParams = new URLSearchParams(rangeQuery.startsWith('?') ? rangeQuery.slice(1) : '');
  if (selectedCustomer) {
    reportQueryParams.set('customer', selectedCustomer);
  }
  const reportQuery = reportQueryParams.toString();
  const salesQueryParams = new URLSearchParams(rangeQuery.startsWith('?') ? rangeQuery.slice(1) : '');
  const salesQuery = salesQueryParams.toString();

  const [topProductsResponse, salesResponse] = await Promise.all([
    fetchList<TopProduct>(`/reports/top-products${reportQuery ? `?${reportQuery}` : ''}`),
    fetchList<SaleCustomer>(`/sales/orders${salesQuery ? `?${salesQuery}` : ''}`)
  ]);

  const products = topProductsResponse?.data ?? [];
  const salesInRange = salesResponse?.data ?? [];
  const customerOptionsMap = new Map<string, string>();

  salesInRange.forEach((sale) => {
    const value = getCustomerValue(sale);
    const label = getCustomerLabel(sale);
    if (!value || !label || customerOptionsMap.has(value)) return;
    customerOptionsMap.set(value, label);
  });

  const customerOptions = Array.from(customerOptionsMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

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
    const numericCode = digitsOnly(product.sku);
    return {
      id: `${numericCode || product.product_name}-${index}`,
      values: {
        rank: `${index + 1}º`,
        code: numericCode || '-',
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
        selectedCustomer={selectedCustomer}
        customerOptions={customerOptions}
      />
    </main>
  );
}
