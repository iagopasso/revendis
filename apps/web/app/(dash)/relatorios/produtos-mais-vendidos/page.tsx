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

type Customer = {
  id: string;
  name: string;
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
  const selectedBrand = getStringParam(resolvedParams.brand).trim();
  const selectedCustomer = getStringParam(resolvedParams.customer).trim();
  const { periodLabel, rangeQuery } = buildReportRangeContext(resolvedParams);
  const reportQueryParams = new URLSearchParams(rangeQuery.startsWith('?') ? rangeQuery.slice(1) : '');
  if (selectedCustomer) {
    reportQueryParams.set('customer', selectedCustomer);
  }
  const reportQuery = reportQueryParams.toString();
  const salesQueryParams = new URLSearchParams(rangeQuery.startsWith('?') ? rangeQuery.slice(1) : '');
  const salesQuery = salesQueryParams.toString();

  const [topProductsResponse, salesResponse, customersResponse] = await Promise.all([
    fetchList<TopProduct>(`/reports/top-products${reportQuery ? `?${reportQuery}` : ''}`),
    fetchList<SaleCustomer>(`/sales/orders${salesQuery ? `?${salesQuery}` : ''}`),
    fetchList<Customer>('/customers')
  ]);

  const products = topProductsResponse?.data ?? [];
  const salesInRange = salesResponse?.data ?? [];
  const customers = customersResponse?.data ?? [];
  const customerOptionsMap = new Map<string, string>();

  customers.forEach((customer) => {
    const value = customer.id?.trim();
    const label = customer.name?.trim();
    if (!value || !label || customerOptionsMap.has(value)) return;
    customerOptionsMap.set(value, label);
  });

  salesInRange.forEach((sale) => {
    const value = getCustomerValue(sale);
    const label = getCustomerLabel(sale);
    if (!value || !label || customerOptionsMap.has(value)) return;
    customerOptionsMap.set(value, label);
  });

  const customerOptions = Array.from(customerOptionsMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

  const brandSet = new Set<string>();
  products.forEach((product) => {
    const brand = (product.brand || 'Sem marca').trim();
    if (!brand) return;
    brandSet.add(brand);
  });
  if (selectedBrand && !brandSet.has(selectedBrand)) {
    brandSet.add(selectedBrand);
  }
  const brandOptions = Array.from(brandSet)
    .map((value) => ({ value, label: value }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

  const filteredProducts = selectedBrand
    ? products.filter((product) => (product.brand || 'Sem marca').trim() === selectedBrand)
    : products;

  const columns = [
    { key: 'rank', label: '#' },
    { key: 'code', label: 'CÓDIGO' },
    { key: 'product', label: 'PRODUTO' },
    { key: 'brand', label: 'MARCA' },
    { key: 'qty', label: 'QTND.' },
    { key: 'total', label: 'TOTAL VENDAS' }
  ];

  const rows = filteredProducts.map((product, index) => {
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
        showCustomerFilter
        selectedBrand={selectedBrand}
        brandOptions={brandOptions}
        showBrandFilter
      />
    </main>
  );
}
