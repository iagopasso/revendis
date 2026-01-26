'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { IconBox, IconCalendar, IconCreditCard, IconDollar } from './icons';

const buildHref = (path: string, params: URLSearchParams) => {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDate = (value?: string | null) => {
  if (!value) return '--';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

export type OverdueReceivable = {
  id: string;
  sale_id?: string | null;
  amount: number;
  due_date?: string | null;
  status?: string | null;
};

type RemindersProps = {
  expiringCount: number;
  lowStockCount: number;
  overdueCount: number;
  cobrancasCount: number;
  overdueReceivables: OverdueReceivable[];
};

export default function Reminders({
  expiringCount,
  lowStockCount,
  overdueCount,
  cobrancasCount,
  overdueReceivables
}: RemindersProps) {
  const searchParams = useSearchParams();
  const [openOverdue, setOpenOverdue] = useState(false);

  const rangeParams = useMemo(() => {
    const params = new URLSearchParams();
    const keys = ['range', 'month', 'from', 'to'];
    keys.forEach((key) => {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    });
    return params;
  }, [searchParams]);

  const expiringHref = useMemo(() => {
    const params = new URLSearchParams(rangeParams.toString());
    params.set('stock', 'empty');
    return buildHref('/categorias', params);
  }, [rangeParams]);

  const lowStockHref = useMemo(() => {
    const params = new URLSearchParams(rangeParams.toString());
    params.set('stock', 'low');
    return buildHref('/categorias', params);
  }, [rangeParams]);

  const cobrancasHref = useMemo(() => {
    const params = new URLSearchParams(rangeParams.toString());
    params.set('status', 'pending');
    return buildHref('/financeiro', params);
  }, [rangeParams]);

  const overdueHref = useMemo(() => {
    const params = new URLSearchParams(rangeParams.toString());
    params.set('payment', 'overdue');
    return buildHref('/vendas', params);
  }, [rangeParams]);

  const firstOverdue = overdueReceivables[0];
  const extraOverdue = Math.max(overdueReceivables.length - 1, 0);
  const saleLabel = firstOverdue?.sale_id
    ? `Venda #${firstOverdue.sale_id.slice(0, 6)}`
    : 'Venda';

  return (
    <>
      <div className="reminders">
        <Link className="reminder-item" href={expiringHref}>
          <span className="reminder-left">
            <span className="reminder-icon">
              <IconCalendar />
            </span>
            <span>Sem estoque</span>
          </span>
          <strong className="reminder-count">{expiringCount}</strong>
        </Link>
        <Link className="reminder-item" href={lowStockHref}>
          <span className="reminder-left">
            <span className="reminder-icon">
              <IconBox />
            </span>
            <span>Produtos acabando</span>
          </span>
          <strong className="reminder-count">{lowStockCount}</strong>
        </Link>
        <button className="reminder-item" type="button" onClick={() => setOpenOverdue(true)}>
          <span className="reminder-left">
            <span className="reminder-icon">
              <IconDollar />
            </span>
            <span>Pagamentos atrasados</span>
          </span>
          <strong className="reminder-count">{overdueCount}</strong>
        </button>
        <Link className="reminder-item" href={cobrancasHref}>
          <span className="reminder-left">
            <span className="reminder-icon">
              <IconCreditCard />
            </span>
            <span>Cobrancas</span>
          </span>
          <strong className="reminder-count">{cobrancasCount}</strong>
        </Link>
      </div>

      {openOverdue ? (
        <div className="modal-backdrop" onClick={() => setOpenOverdue(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Pagamentos atrasados</h3>
              <button className="modal-close" type="button" onClick={() => setOpenOverdue(false)}>
                ✕
              </button>
            </div>

            {overdueCount === 0 ? (
              <div className="modal-empty">
                <div className="modal-empty-icon">$</div>
                <strong>Oba! Nenhum pagamento atrasado.</strong>
                <span>Lembre-se de registrar os pagamentos das vendas para que aparecam aqui.</span>
              </div>
            ) : (
              <div className="modal-body">
                <div className="overdue-card">
                  <div className="overdue-header">
                    <div className="avatar-circle">👤</div>
                  <div>
                      <strong>{saleLabel}</strong>
                      <span>Vence em {formatDate(firstOverdue?.due_date)}</span>
                    </div>
                    <div className="status-pill">Atrasado</div>
                    <button className="button ghost" type="button">
                      Acoes ▾
                    </button>
                  </div>

                  <div className="overdue-grid">
                    <div className="overdue-section">
                      <h4>Itens da venda (1)</h4>
                      <div className="overdue-item">
                        <div className="overdue-thumb">🧴</div>
                        <div>
                          <strong>Produto demonstracao</strong>
                          <span>1 unidade</span>
                        </div>
                        <span className="overdue-price">
                          {formatCurrency(firstOverdue?.amount || 0)}
                        </span>
                      </div>
                    </div>

                    <div className="overdue-section">
                      <h4>Pagamentos</h4>
                      <div className="overdue-payment">
                        <div className="overdue-payment-row">
                          <span>{formatCurrency(firstOverdue?.amount || 0)}</span>
                          <span className="badge danger">Atrasado</span>
                        </div>
                        <div className="meta">Vence em {formatDate(firstOverdue?.due_date)}</div>
                      </div>
                      <div className="overdue-summary">
                        <div>
                          <span>Valor Total</span>
                          <strong>{formatCurrency(firstOverdue?.amount || 0)}</strong>
                        </div>
                        <div>
                          <span>Valor Pago</span>
                          <strong>{formatCurrency(0)}</strong>
                        </div>
                        <div>
                          <span>Valor Restante</span>
                          <strong>{formatCurrency(firstOverdue?.amount || 0)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="modal-footer">
                    {extraOverdue > 0 ? (
                      <span className="meta">+{extraOverdue} outros atrasados</span>
                    ) : (
                      <span className="meta">Vencido</span>
                    )}
                    <Link className="button primary" href={overdueHref}>
                      Ver em Vendas
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
