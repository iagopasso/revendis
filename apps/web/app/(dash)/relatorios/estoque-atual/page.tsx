import { fetchList, toNumber } from '../../lib';
import ReportDetailPanel from '../report-detail-panel';

type Product = {
  id: string;
  sku: string;
  name: string;
  quantity?: number | string;
};

export default async function RelatorioEstoqueAtualPage() {
  const response = await fetchList<Product>('/inventory/products');
  const products = response?.data ?? [];

  const today = new Date().toISOString();
  const rows = products
    .slice()
    .sort((a, b) => toNumber(b.quantity) - toNumber(a.quantity))
    .map((product) => {
      const quantity = toNumber(product.quantity);
      return {
        date: today,
        primary: product.name,
        secondary: `SKU ${product.sku}`,
        status: quantity > 0 ? 'Disponivel' : 'Sem estoque',
        value: quantity
      };
    });

  return (
    <main className="page-content">
      <ReportDetailPanel
        breadcrumb="Relatorios > Estoque atual"
        title="Estoque atual"
        rows={rows}
        exportBaseName="relatorio-estoque-atual"
        emptyTitle="Nenhum produto encontrado"
        emptyMessage="Nao ha produtos para exibir no estoque atual."
        valueFormat="number"
      />
    </main>
  );
}
