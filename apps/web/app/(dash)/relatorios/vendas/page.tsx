import { fetchList, formatCurrency, isInDateRange, toNumber } from '../../lib';
import ReportDetailPanel from '../report-detail-panel';
import { buildReportRangeContext, type ReportSearchParams } from '../range';

type Sale = {
  id: string;
  status: string;
  total: number | string;
  created_at: string;
  customer_name?: string | null;
  cost_total?: number | string;
  profit?: number | string;
};

type Receivable = {
  id: string;
  sale_id?: string | null;
  amount: number | string;
  status: 'pending' | 'paid' | 'overdue';
};

const formatDate = (value: string) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('pt-BR');
};

const deliveryLabel = (status: string) => {
  if (status === 'delivered' || status === 'confirmed') return 'Entregue';
  if (status === 'cancelled') return 'Cancelado';
  return 'Nao entregue';
};

const paymentLabel = (total: number, paid: number) => {
  if (paid >= total - 0.01) return 'Pago';
  if (paid > 0.01) return 'Parcial';
  return 'Pendente';
};

export default async function RelatorioVendasPage({
  searchParams
}: {
  searchParams?: Promise<ReportSearchParams>;
}) {
  const resolvedParams = (await searchParams) || {};
  const { dateRange, periodLabel } = buildReportRangeContext(resolvedParams);

  const [salesResponse, receivablesResponse] = await Promise.all([
    fetchList<Sale>('/sales/orders'),
    fetchList<Receivable>('/finance/receivables')
  ]);

  const sales = (salesResponse?.data ?? []).filter((sale) => isInDateRange(sale.created_at, dateRange));
  const receivables = receivablesResponse?.data ?? [];

  const receivablesBySale = new Map<
    string,
    {
      total: number;
      paid: number;
    }
  >();

  receivables.forEach((receivable) => {
    const saleId = receivable.sale_id || '';
    if (!saleId) return;
    const amount = toNumber(receivable.amount);
    const current = receivablesBySale.get(saleId) || { total: 0, paid: 0 };
    current.total += amount;
    if (receivable.status === 'paid') {
      current.paid += amount;
    }
    receivablesBySale.set(saleId, current);
  });

  const columns = [
    { key: 'date', label: 'DATA' },
    { key: 'customer', label: 'CLIENTE' },
    { key: 'total', label: 'TOTAL' },
    { key: 'profit', label: 'LUCRO' },
    { key: 'paid', label: 'VALOR PAGO' },
    { key: 'delivery', label: 'ENVIO' },
    { key: 'payment', label: 'PAGAMENTO' }
  ];

  const rows = sales.map((sale) => {
    const total = toNumber(sale.total);
    const summary = receivablesBySale.get(sale.id);
    const outstanding = summary ? Math.max(0, summary.total - summary.paid) : 0;
    const paid = summary ? Math.max(0, total - outstanding) : total;
    const profit =
      sale.profit !== undefined
        ? toNumber(sale.profit)
        : total - toNumber(sale.cost_total);

    return {
      id: sale.id,
      values: {
        date: formatDate(sale.created_at),
        customer: sale.customer_name || 'Cliente nao informado',
        total: formatCurrency(total),
        profit: formatCurrency(profit),
        paid: formatCurrency(Math.max(0, paid)),
        delivery: deliveryLabel(sale.status),
        payment: paymentLabel(total, Math.max(0, paid))
      }
    };
  });

  return (
    <main className="page-content">
      <ReportDetailPanel
        breadcrumb="Relatórios › Vendas"
        title="Vendas"
        columns={columns}
        rows={rows}
        periodLabel={periodLabel}
        exportBaseName="relatorio-vendas"
        emptyTitle="Nenhuma venda no periodo"
        emptyMessage="Nao ha vendas registradas no periodo selecionado."
      />
    </main>
  );
}
