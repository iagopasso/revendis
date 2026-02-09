import { fetchList, toNumber } from '../../lib';
import ReportDetailPanel from '../report-detail-panel';

type Sale = {
  id: string;
  status: string;
  total: number | string;
  created_at: string;
  customer_name?: string | null;
};

const saleStatusLabel = (status: string) => {
  if (status === 'delivered' || status === 'confirmed') return 'Concluida';
  if (status === 'cancelled') return 'Cancelada';
  if (status === 'pending') return 'Pendente';
  return status;
};

export default async function RelatorioVendasPage() {
  const salesResponse = await fetchList<Sale>('/sales/orders');
  const sales = salesResponse?.data ?? [];

  const rows = sales.map((sale) => ({
    date: sale.created_at,
    primary: sale.customer_name || `Venda ${sale.id.slice(0, 8).toUpperCase()}`,
    secondary: `Pedido #${sale.id.slice(0, 8).toUpperCase()}`,
    status: saleStatusLabel(sale.status),
    value: toNumber(sale.total)
  }));

  return (
    <main className="page-content">
      <ReportDetailPanel
        breadcrumb="Relatorios > Vendas"
        title="Vendas"
        rows={rows}
        exportBaseName="relatorio-vendas"
        emptyTitle="Nenhuma venda no periodo"
        emptyMessage="Nao ha vendas registradas para os ultimos 28 dias."
      />
    </main>
  );
}
