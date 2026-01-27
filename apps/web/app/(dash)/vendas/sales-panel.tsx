'use client';

import { useEffect, useState } from 'react';
import { formatCurrency } from '../lib';
import SalesDetailModal, { type SaleDetail, type SaleUpdate } from '../sales-detail-modal';

type Sale = {
  id: string;
  status: string;
  total: number | string;
  created_at: string;
  customer_name?: string | null;
};

type SalesPanelProps = {
  sales: Sale[];
  totalSales: number;
  profit: number;
  totalReceivable: number;
  salesCount: number;
};

const formatDate = (value: string) => {
  if (!value) return '--';
  const date = new Date(value);
  return date.toLocaleDateString('pt-BR');
};

const statusLabel = (status: string) => {
  if (status === 'cancelled') return 'Cancelado';
  if (status === 'pending') return 'A entregar';
  if (status === 'delivered') return 'Entregue';
  return 'Confirmado';
};

const statusBadge = (status: string) => {
  if (status === 'cancelled') return 'danger';
  if (status === 'pending') return 'warn';
  if (status === 'delivered') return 'success';
  return 'success';
};

export default function SalesPanel({ sales, totalSales, profit, totalReceivable, salesCount }: SalesPanelProps) {
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [localSales, setLocalSales] = useState<Sale[]>(sales);

  useEffect(() => {
    setLocalSales(sales);
  }, [sales]);

  const openModal = (sale: Sale) => {
    const mappedStatus: SaleDetail['status'] =
      sale.status === 'cancelled' ? 'cancelled' : sale.status === 'pending' ? 'pending' : 'delivered';
    setSelectedSale({
      id: sale.id,
      customer: sale.customer_name || 'Cliente nao informado',
      date: sale.created_at,
      status: mappedStatus,
      total: Number(sale.total),
      paid: 0,
      itemName: '',
      itemQty: 1,
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
              status: update.status ?? sale.status
            }
          : sale
      );
    });
  };

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
            <div className="empty-icon">🏷️</div>
            <strong>Nenhuma venda registrada</strong>
            <span>Crie sua primeira venda para alimentar os indicadores.</span>
            <button className="button primary" type="button">
              + Nova venda
            </button>
          </div>
        ) : (
          <div className="data-list">
            <div className="data-row cols-4 header">
              <span>Venda</span>
              <span>Status</span>
              <span>Total</span>
              <span>Data</span>
            </div>
            {localSales.slice(0, 6).map((sale) => (
              <button key={sale.id} className="data-row cols-4 sale-row" type="button" onClick={() => openModal(sale)}>
                <div>
                  <strong>Pedido #{sale.id.slice(0, 6)}</strong>
                  <div className="meta">Clique para ver</div>
                </div>
                <span className={`badge ${statusBadge(sale.status)}`}>{statusLabel(sale.status)}</span>
                <div className="data-cell mono">{formatCurrency(Number(sale.total))}</div>
                <div className="data-cell mono">{formatDate(sale.created_at)}</div>
              </button>
            ))}
          </div>
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
