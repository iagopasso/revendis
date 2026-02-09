import { fetchList, toNumber } from '../../lib';
import ReportDetailPanel from '../report-detail-panel';

type Product = {
  id: string;
  sku: string;
  name: string;
  quantity?: number | string;
  expires_at?: string | null;
};

const expirationStatus = (expiresAt: string) => {
  const now = new Date();
  const exp = new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return 'Sem data';
  const diff = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'Vencido';
  if (diff <= 7) return 'Proximo';
  return 'No prazo';
};

export default async function RelatorioProximosDeVencerPage() {
  const response = await fetchList<Product>('/inventory/products');
  const products = response?.data ?? [];

  const rows = products
    .filter((product) => Boolean(product.expires_at))
    .map((product) => ({
      date: product.expires_at || new Date().toISOString(),
      primary: product.name,
      secondary: `SKU ${product.sku} | ${toNumber(product.quantity)} unidades`,
      status: expirationStatus(product.expires_at || ''),
      value: toNumber(product.quantity)
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <main className="page-content">
      <ReportDetailPanel
        breadcrumb="Relatorios > Proximos de vencer"
        title="Proximos de vencer"
        rows={rows}
        exportBaseName="relatorio-proximos-de-vencer"
        emptyTitle="Nenhum produto com vencimento"
        emptyMessage="Nao ha produtos com data de vencimento cadastrada."
        valueFormat="number"
      />
    </main>
  );
}
