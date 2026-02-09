import { fetchList, formatCurrency, toNumber } from '../../lib';
import ReportDetailPanel from '../report-detail-panel';
import { buildReportRangeContext, type ReportSearchParams } from '../range';

type TopCustomer = {
  customer_name: string;
  customer_phone?: string | null;
  orders_count: number | string;
  total_spent: number | string;
  total_paid: number | string;
  last_sale_at: string;
};

export default async function RelatorioMaioresCompradoresPage({
  searchParams
}: {
  searchParams?: Promise<ReportSearchParams>;
}) {
  const resolvedParams = (await searchParams) || {};
  const { periodLabel, rangeQuery } = buildReportRangeContext(resolvedParams);
  const response = await fetchList<TopCustomer>(`/reports/top-customers${rangeQuery}`);
  const customers = response?.data ?? [];

  const columns = [
    { key: 'rank', label: '#' },
    { key: 'name', label: 'NOME' },
    { key: 'phone', label: 'TELEFONE' },
    { key: 'orders', label: 'QUANTIDADE' },
    { key: 'totalSpent', label: 'TOTAL EM COMPRAS' },
    { key: 'totalPaid', label: 'TOTAL PAGO' }
  ];

  const rows = customers.map((customer, index) => ({
    id: `${customer.customer_name}-${index}`,
    values: {
      rank: `${index + 1}º`,
      name: customer.customer_name || 'Cliente nao informado',
      phone: customer.customer_phone || '-',
      orders: `${toNumber(customer.orders_count)} compras`,
      totalSpent: formatCurrency(toNumber(customer.total_spent)),
      totalPaid: formatCurrency(toNumber(customer.total_paid))
    }
  }));

  return (
    <main className="page-content">
      <ReportDetailPanel
        breadcrumb="Relatórios › Maiores compradores"
        title="Maiores compradores"
        columns={columns}
        rows={rows}
        periodLabel={periodLabel}
        exportBaseName="relatorio-maiores-compradores"
        emptyTitle="Nenhum comprador no periodo"
        emptyMessage="Nao houve compras de clientes no periodo selecionado."
      />
    </main>
  );
}
