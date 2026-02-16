import { fetchList, formatCurrency, isInDateRange, toNumber, digitsOnly } from '../../lib';
import ReportDetailPanel from '../report-detail-panel';
import { buildReportRangeContext, type ReportSearchParams } from '../range';

type Product = {
  id: string;
  sku?: string | null;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  price?: number | string;
  cost?: number | string;
  expires_at?: string | null;
  quantity?: number | string;
  created_at?: string;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
};

export default async function RelatorioEstoqueAtualPage({
  searchParams
}: {
  searchParams?: Promise<ReportSearchParams>;
}) {
  const resolvedParams = (await searchParams) || {};
  const { dateRange, periodLabel } = buildReportRangeContext(resolvedParams);
  const response = await fetchList<Product>('/inventory/products');
  const products = (response?.data ?? []).filter((product) =>
    product.created_at ? isInDateRange(product.created_at, dateRange) : true
  );

  const columns = [
    { key: 'code', label: 'CÓDIGO' },
    { key: 'product', label: 'PRODUTO' },
    { key: 'brand', label: 'MARCA' },
    { key: 'salePrice', label: 'PREÇO VENDA' },
    { key: 'costPrice', label: 'PREÇO CUSTO' },
    { key: 'expiresAt', label: 'P. VENC.' },
    { key: 'qty', label: 'QTND.' }
  ];

  const rows = products
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((product) => {
      const quantity = toNumber(product.quantity);
      return {
        id: product.id,
        values: {
          code: digitsOnly(product.sku || product.barcode) || '-',
          product: product.name || '-',
          brand: product.brand || '-',
          salePrice: formatCurrency(toNumber(product.price)),
          costPrice: formatCurrency(toNumber(product.cost)),
          expiresAt: formatDate(product.expires_at),
          qty: `${quantity} un.`
        }
      };
    });

  return (
    <main className="page-content">
      <ReportDetailPanel
        breadcrumb="Relatórios › Estoque atual"
        title="Estoque atual"
        columns={columns}
        rows={rows}
        periodLabel={periodLabel}
        exportBaseName="relatorio-estoque-atual"
        emptyTitle="Nenhum item em estoque"
        emptyMessage="Nao ha produtos cadastrados para exibir no periodo selecionado."
      />
    </main>
  );
}
