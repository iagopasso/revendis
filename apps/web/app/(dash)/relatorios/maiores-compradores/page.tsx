import { fetchList, toNumber } from '../../lib';
import ReportDetailPanel from '../report-detail-panel';

type TopCustomer = {
  customer_name: string;
  orders_count: number | string;
  total_spent: number | string;
  last_sale_at: string;
};

export default async function RelatorioMaioresCompradoresPage() {
  const response = await fetchList<TopCustomer>('/reports/top-customers');
  const customers = response?.data ?? [];

  const rows = customers.map((customer) => ({
    date: customer.last_sale_at,
    primary: customer.customer_name,
    secondary: `${toNumber(customer.orders_count)} pedidos`,
    status: 'Ativo',
    value: toNumber(customer.total_spent)
  }));

  return (
    <main className="page-content">
      <ReportDetailPanel
        breadcrumb="Relatorios > Maiores compradores"
        title="Maiores compradores"
        rows={rows}
        exportBaseName="relatorio-maiores-compradores"
        emptyTitle="Nenhum comprador no periodo"
        emptyMessage="Nao houve compras de clientes nos ultimos 28 dias."
      />
    </main>
  );
}
