import { fetchList, isInDateRange, toNumber, digitsOnly } from '../../lib';
import ReportDetailPanel from '../report-detail-panel';
import { buildReportRangeContext, type ReportSearchParams } from '../range';

type Product = {
  id: string;
  sku?: string | null;
  name: string;
  brand?: string | null;
  quantity?: number | string;
  expires_at?: string | null;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
};

export default async function RelatorioProximosDeVencerPage({
  searchParams
}: {
  searchParams?: Promise<ReportSearchParams>;
}) {
  const resolvedParams = (await searchParams) || {};
  const { dateRange, periodLabel } = buildReportRangeContext(resolvedParams);
  const response = await fetchList<Product>('/inventory/products');
  const products = response?.data ?? [];

  const columns = [
    { key: 'rank', label: '#' },
    { key: 'code', label: 'CÓDIGO' },
    { key: 'product', label: 'PRODUTO' },
    { key: 'brand', label: 'MARCA' },
    { key: 'expiresAt', label: 'P. VENC.' },
    { key: 'qty', label: 'QTND.' }
  ];

  const rows = products
    .filter((product) => Boolean(product.expires_at))
    .filter((product) => isInDateRange(product.expires_at || undefined, dateRange))
    .sort((a, b) => {
      const aDate = new Date(a.expires_at || '').getTime();
      const bDate = new Date(b.expires_at || '').getTime();
      return aDate - bDate;
    })
    .map((product, index) => ({
      id: product.id,
      values: {
        rank: `${index + 1}º`,
        code: digitsOnly(product.sku) || '-',
        product: product.name || '-',
        brand: product.brand || '-',
        expiresAt: formatDate(product.expires_at),
        qty: `${toNumber(product.quantity)} un.`
      }
    }));

  return (
    <main className="page-content">
      <ReportDetailPanel
        breadcrumb="Relatórios › Próximos de vencer"
        title="Próximos de vencer"
        columns={columns}
        rows={rows}
        periodLabel={periodLabel}
        exportBaseName="relatorio-proximos-de-vencer"
        emptyTitle="Nenhum produto com vencimento"
        emptyMessage="Nao ha produtos com data de vencimento no periodo selecionado."
      />
    </main>
  );
}
