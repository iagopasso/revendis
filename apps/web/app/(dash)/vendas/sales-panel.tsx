'use client';

import { useEffect, useState } from 'react';
import { formatCurrency, toNumber } from '../lib';
import SalesDetailModal, { type SaleDetail, type SaleUpdate } from '../sales-detail-modal';

type PaymentStatus = 'paid' | 'pending' | 'overdue' | 'partial';

type Sale = {
  id: string;
  status: string;
  total: number | string;
  created_at: string;
  customer_name?: string | null;
  items_count?: number | string;
  cost_total?: number | string;
  profit?: number | string;
  payment_status?: PaymentStatus;
};

type SalesPanelProps = {
  sales: Sale[];
  totalSales: number;
  profit: number;
  totalReceivable: number;
  salesCount: number;
  hasSalesInRange: boolean;
};

const PAGE_SIZE = 6;

const formatDate = (value: string) => {
  if (!value) return '--';
  const date = new Date(value);
  return date.toLocaleDateString('pt-BR');
};

const deliveryLabel = (status: string) => {
  if (status === 'cancelled') return 'Cancelado';
  if (status === 'pending') return 'A entregar';
  if (status === 'delivered') return 'Entregue';
  return 'Confirmado';
};

const deliveryBadge = (status: string) => {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'pending') return 'pending';
  if (status === 'delivered') return 'delivered';
  return 'confirmed';
};

const deliveryIcon = (status: string) => {
  if (status === 'cancelled') return '✕';
  if (status === 'pending') return '⏳';
  if (status === 'delivered') return '✓';
  return '●';
};

const paymentLabel = (status: PaymentStatus) => {
  if (status === 'paid') return 'Pago';
  if (status === 'partial') return 'Pago parcialmente';
  if (status === 'overdue') return 'Atrasado';
  return 'Pendente';
};

const paymentBadge = (status: PaymentStatus) => {
  if (status === 'paid') return 'paid';
  if (status === 'partial') return 'partial';
  if (status === 'overdue') return 'overdue';
  return 'pending';
};

const paymentIcon = (status: PaymentStatus) => {
  if (status === 'paid') return '✓';
  if (status === 'partial') return '⟳';
  if (status === 'overdue') return '!';
  return '⏳';
};

const formatItems = (count: number) => `${count} ${count === 1 ? 'unidade' : 'unidades'}`;

const getInitials = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '';
  const second = parts[1]?.[0] || '';
  const initials = `${first}${second}`.toUpperCase();
  return initials || value.slice(0, 2).toUpperCase();
};

export default function SalesPanel({
  sales,
  totalSales,
  profit,
  totalReceivable,
  salesCount,
  hasSalesInRange
}: SalesPanelProps) {
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [localSales, setLocalSales] = useState<Sale[]>(sales);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLocalSales(sales);
    setPage(1);
  }, [sales]);

  const openModal = (sale: Sale) => {
    const mappedStatus: SaleDetail['status'] =
      sale.status === 'cancelled' ? 'cancelled' : sale.status === 'pending' ? 'pending' : 'delivered';
    const itemsCount = Math.max(0, toNumber(sale.items_count ?? 0));
    setSelectedSale({
      id: sale.id,
      customer: sale.customer_name || 'Cliente nao informado',
      date: sale.created_at,
      status: mappedStatus,
      total: Number(sale.total),
      paid: 0,
      itemName: '',
      itemQty: itemsCount || 1,
      dueDate: sale.created_at
    });
  };

  const handleSaleUpdated = (update: SaleUpdate) => {
    setLocalSales((prev) => {
      if (update.removed) {
        return prev.filter((sale) => sale.id !== update.id);
      }
      return prev.map((sale) =>
        sale.id === update.id
          ? {
              ...sale,
              status: update.status ?? sale.status,
              payment_status: update.paymentStatus ?? sale.payment_status
            }
          : sale
      );
    });
  };

  const totalRows = localSales.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalRows);
  const pageSales = localSales.slice(startIndex, endIndex);

  return (
    <>
      <section className="stat-grid">
        <div className="stat-card">
          <div>
            <div className="stat-label">Quantidade de vendas</div>
            <div className="stat-value">{salesCount}</div>
          </div>
          <div className="stat-icon">⬆</div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Valor em vendas</div>
            <div className="stat-value">{formatCurrency(totalSales)}</div>
          </div>
          <div className="stat-icon">$</div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Lucros</div>
            <div className="stat-value">{formatCurrency(profit)}</div>
          </div>
          <div className="stat-icon">%</div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Total a receber</div>
            <div className="stat-value">{formatCurrency(totalReceivable)}</div>
          </div>
          <div className="stat-icon">💳</div>
        </div>
      </section>

      <section className="panel">
        {salesCount === 0 ? (
          <div className="empty-state">
            {hasSalesInRange ? (
              <>
                <div className="empty-icon">🔎</div>
                <strong>Nenhuma venda encontrada</strong>
                <span>Revise os filtros ou selecione outro periodo.</span>
              </>
            ) : (
              <>
                <div className="empty-icon">🏷️</div>
                <strong>Nenhuma venda registrada</strong>
                <span>Crie sua primeira venda para alimentar os indicadores.</span>
                <button className="button primary" type="button">
                  + Nova venda
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="data-list">
              <div className="data-row cols-7 header">
                <span>Cliente</span>
                <span>Itens</span>
                <span>Total da venda</span>
                <span>Pagamento</span>
                <span>Entrega</span>
                <span>Lucro</span>
                <span>Data</span>
              </div>
              {pageSales.map((sale) => {
                const customerName = sale.customer_name || 'Cliente nao informado';
                const itemsCount = Math.max(0, toNumber(sale.items_count ?? 0));
                const profitValue = toNumber(
                  sale.profit ?? toNumber(sale.total) - toNumber(sale.cost_total)
                );
                const paymentStatus = sale.payment_status ?? 'paid';
                return (
                  <button
                    key={sale.id}
                    className="data-row cols-7 sale-row"
                    type="button"
                    onClick={() => openModal(sale)}
                  >
                    <div className="sale-customer">
                      <div className="sale-avatar">{getInitials(customerName)}</div>
                      <div>
                        <strong>{customerName}</strong>
                        <div className="meta">Venda #{sale.id.slice(0, 6)}</div>
                      </div>
                    </div>
                    <div className="data-cell mono">{formatItems(itemsCount)}</div>
                    <div className="data-cell mono">{formatCurrency(toNumber(sale.total))}</div>
                    <span className={`payment-badge ${paymentBadge(paymentStatus)}`}>
                      <span className="badge-icon">{paymentIcon(paymentStatus)}</span>
                      {paymentLabel(paymentStatus)}
                    </span>
                    <span className={`delivery-badge ${deliveryBadge(sale.status)}`}>
                      <span className="badge-icon">{deliveryIcon(sale.status)}</span>
                      {deliveryLabel(sale.status)}
                    </span>
                    <div className="data-cell mono">{formatCurrency(profitValue)}</div>
                    <div className="data-cell mono">{formatDate(sale.created_at)}</div>
                  </button>
                );
              })}
            </div>
            <div className="table-footer">
              <span className="meta">
                {totalRows === 0 ? '0' : `${startIndex + 1} - ${endIndex} de ${totalRows}`}
              </span>
              <div className="pager">
                <button
                  className="button icon"
                  type="button"
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  ‹
                </button>
                <button
                  className="button icon"
                  type="button"
                  onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <SalesDetailModal
        open={Boolean(selectedSale)}
        onClose={() => setSelectedSale(null)}
        sale={selectedSale}
        onUpdated={handleSaleUpdated}
      />
    </>
  );
}
