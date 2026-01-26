'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatCurrency } from './lib';

export type SaleDetail = {
  id: string;
  customer: string;
  date: string;
  status: 'delivered' | 'pending' | 'cancelled';
  total: number;
  paid: number;
  itemName: string;
  itemQty: number;
  dueDate?: string;
};

type SalesDetailModalProps = {
  open: boolean;
  onClose: () => void;
  sale?: SaleDetail | null;
};

type PaymentState = {
  amount: number;
  dueDate: string;
  method: string;
  paidAt?: string | null;
};

const paymentMethods = [
  'Dinheiro',
  'Cartao de Credito',
  'Cartao de Debito',
  'Cheque',
  'Pix',
  'Boleto',
  'TED/DOC',
  'App de Pagamento'
];

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const toIsoDate = (value: Date) => value.toISOString().split('T')[0];

const statusLabel = (status: SaleDetail['status']) => {
  if (status === 'delivered') return 'Entregue';
  if (status === 'pending') return 'A entregar';
  return 'Cancelado';
};

const statusClass = (status: SaleDetail['status']) => {
  if (status === 'delivered') return 'delivered';
  if (status === 'pending') return 'pending';
  return 'cancelled';
};

const getOverdueDays = (dueDate?: string) => {
  if (!dueDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return 0;
  const diff = today.getTime() - due.getTime();
  return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
};

export default function SalesDetailModal({ open, onClose, sale }: SalesDetailModalProps) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [paymentMenuOpen, setPaymentMenuOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptTab, setReceiptTab] = useState<'digital' | 'termico'>('digital');
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<SaleDetail['status']>('pending');
  const [paymentState, setPaymentState] = useState<PaymentState>({
    amount: 0,
    dueDate: toIsoDate(new Date()),
    method: 'Dinheiro',
    paidAt: null
  });
  const [paymentRemoved, setPaymentRemoved] = useState(false);
  const [paymentPaid, setPaymentPaid] = useState(false);
  const [paymentDate, setPaymentDate] = useState(toIsoDate(new Date()));
  const [editDueDate, setEditDueDate] = useState(toIsoDate(new Date()));
  const [editAmount, setEditAmount] = useState('');
  const [editMethod, setEditMethod] = useState(paymentMethods[0]);

  useEffect(() => {
    if (!sale) return;
    const dueDate = sale.dueDate ? sale.dueDate.split('T')[0] : sale.date.split('T')[0];
    setDeliveryStatus(sale.status);
    setPaymentState({
      amount: sale.total,
      dueDate,
      method: 'Dinheiro',
      paidAt: null
    });
    setPaymentRemoved(false);
    setPaymentPaid(false);
    setPaymentDate(toIsoDate(new Date()));
    setEditDueDate(dueDate);
    setEditAmount(String(sale.total));
    setEditMethod('Dinheiro');
    setReceiptTab('digital');
    setStatusOpen(false);
    setActionsOpen(false);
    setPaymentMenuOpen(false);
  }, [sale]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const summary = useMemo(() => {
    const total = paymentState.amount;
    const paid = paymentPaid ? paymentState.amount : 0;
    return { total, paid, remaining: Math.max(total - paid, 0) };
  }, [paymentState.amount, paymentPaid]);

  if (!open || !sale) return null;

  const overdueDays = paymentPaid ? 0 : getOverdueDays(paymentState.dueDate);
  const isOverdue = overdueDays > 0;

  const paymentStatusLabel = paymentPaid
    ? `Pago em ${formatDate(paymentState.paidAt || paymentDate)}`
    : `Vence em ${formatDate(paymentState.dueDate)}`;

  const receiptStatus = paymentPaid ? 'Pago' : isOverdue ? `Atrasado (${overdueDays} dias)` : 'Pendente';

  const handleSavePaid = () => {
    setPaymentPaid(true);
    setPaymentRemoved(false);
    setPaymentState((prev) => ({ ...prev, paidAt: paymentDate }));
    setMarkPaidOpen(false);
    setToast('Marcado como pago');
  };

  const handleSaveEdit = () => {
    const amountValue = Number(editAmount.replace(',', '.')) || paymentState.amount;
    setPaymentState((prev) => ({
      ...prev,
      amount: amountValue,
      dueDate: editDueDate,
      method: editMethod
    }));
    setEditOpen(false);
    setToast('Parcela atualizada');
  };

  const handleRemove = () => {
    setPaymentRemoved(true);
    setPaymentPaid(false);
    setRemoveOpen(false);
    setToast('Parcela removida');
  };

  const handleDownloadReceipt = () => {
    setReceiptOpen(true);
    setToast('Extrato pronto para baixar');
  };

  const handlePrintReceipt = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        onClose();
      }}
    >
      <div className="modal modal-sale" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="sale-header-left">
            <div className="avatar-circle">👤</div>
            <div>
              <strong>{sale.customer}</strong>
              <span>{formatDate(sale.date)}</span>
            </div>
          </div>
          <div className="sale-header-actions">
            <div className="sale-dropdown">
              <button
                className={`button status-button ${statusClass(deliveryStatus)}`}
                type="button"
                onClick={() => setStatusOpen((prev) => !prev)}
              >
                <span className="status-icon">{deliveryStatus === 'pending' ? '🚚' : '✅'}</span>
                {statusLabel(deliveryStatus)} ▾
              </button>
              {statusOpen ? (
                <div className="sale-menu">
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryStatus('delivered');
                      setStatusOpen(false);
                    }}
                  >
                    Ja entregue
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryStatus('pending');
                      setStatusOpen(false);
                    }}
                  >
                    A entregar
                  </button>
                </div>
              ) : null}
            </div>
            <div className="sale-dropdown">
              <button className="button ghost" type="button" onClick={() => setActionsOpen((prev) => !prev)}>
                <span className="status-icon">⚙</span>Acoes ▾
              </button>
              {actionsOpen ? (
                <div className="sale-menu">
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptOpen(true);
                      setActionsOpen(false);
                    }}
                  >
                    Baixar extrato
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      setUndoOpen(true);
                      setActionsOpen(false);
                    }}
                  >
                    Desfazer venda
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="sale-grid">
          <section className="sale-section">
            <h4>Itens da Venda (1)</h4>
            <div className="sale-item">
              <div className="sale-thumb">🧴</div>
              <div>
                <strong>{sale.itemName}</strong>
                <span>{sale.itemQty} unidade</span>
                <span>Total: {formatCurrency(summary.total)}</span>
              </div>
              <span className="sale-price">{formatCurrency(summary.total)}</span>
            </div>
          </section>

          <section className="sale-section">
            <div className="sale-payment-header">
              <h4>Pagamentos</h4>
              <div className="payment-progress" />
            </div>

            {paymentRemoved ? (
              <div className="payment-callout">
                <span>Valor pendente de registro: {formatCurrency(summary.total)}</span>
                <button className="button primary" type="button" onClick={() => setMarkPaidOpen(true)}>
                  + Registrar Pagamento
                </button>
              </div>
            ) : (
              <div className={`payment-card${paymentPaid ? ' paid' : isOverdue ? ' overdue' : ''}`}>
                <div className="sale-payment-row">
                  <div className="payment-left">
                    <span className="payment-status-icon">{paymentPaid ? '✓' : '!'}</span>
                    <span>{formatCurrency(summary.total)}</span>
                  </div>
                  <button className="button icon small" type="button" onClick={() => setPaymentMenuOpen((prev) => !prev)}>
                    ⋯
                  </button>
                  {paymentMenuOpen ? (
                    <div className="payment-menu">
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMenuOpen(false);
                          setMarkPaidOpen(true);
                        }}
                      >
                        Marcar como paga
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMenuOpen(false);
                          setEditOpen(true);
                        }}
                      >
                        Editar parcela
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          setPaymentMenuOpen(false);
                          setRemoveOpen(true);
                        }}
                      >
                        Remover parcela
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="meta">{paymentState.method.toUpperCase()}</div>
                <div className="meta">{paymentStatusLabel}</div>
              </div>
            )}

            <div className="sale-summary">
              <div>
                <span>Valor Total</span>
                <strong>{formatCurrency(summary.total)}</strong>
              </div>
              <div>
                <span>Valor Pago</span>
                <strong>{formatCurrency(summary.paid)}</strong>
              </div>
              <div>
                <span>Valor Restante</span>
                <strong>{formatCurrency(summary.remaining)}</strong>
              </div>
              <div>
                <span>Lucro</span>
                <button className="button ghost" type="button">
                  Clique para ver
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {receiptOpen ? (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            event.stopPropagation();
            if (event.target !== event.currentTarget) return;
            setReceiptOpen(false);
          }}
        >
          <div className="modal modal-receipt" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Extrato da venda</h3>
              <button className="modal-close" type="button" onClick={() => setReceiptOpen(false)}>
                ✕
              </button>
            </div>

            <div className="receipt-tabs">
              <button
                className={receiptTab === 'digital' ? 'active' : ''}
                type="button"
                onClick={() => setReceiptTab('digital')}
              >
                Digital
              </button>
              <button
                className={receiptTab === 'termico' ? 'active' : ''}
                type="button"
                onClick={() => setReceiptTab('termico')}
              >
                Termico
              </button>
            </div>

            {receiptTab === 'digital' ? (
              <div className="receipt-body">
                <div className="receipt-card">
                  <div className="receipt-header">
                    <strong>Resumo da venda</strong>
                    <div className="receipt-logo">R</div>
                  </div>
                  <div className="receipt-meta">
                    Emitido em {formatDate(sale.date)} as {formatTime(sale.date)} no Revendi Web
                  </div>
                  <div className="receipt-grid">
                    <div>
                      <span>Cliente</span>
                      <strong>{sale.customer}</strong>
                    </div>
                    <div>
                      <span>Data da venda</span>
                      <strong>{formatDate(sale.date)}</strong>
                    </div>
                    <div>
                      <span>Valor total</span>
                      <strong>{formatCurrency(summary.total)}</strong>
                    </div>
                    <div>
                      <span>Situacao da entrega</span>
                      <strong>{statusLabel(deliveryStatus)}</strong>
                    </div>
                  </div>
                  <div className="receipt-products">
                    <strong>Produtos</strong>
                    <div className="receipt-product-row">
                      <span>{sale.itemQty}</span>
                      <span>{sale.itemName}</span>
                      <strong>{formatCurrency(summary.total)}</strong>
                    </div>
                  </div>
                </div>

                <div className="receipt-card">
                  <div className="receipt-header">
                    <strong>Pagamento</strong>
                    <span className={`receipt-pill ${paymentPaid ? 'paid' : 'pending'}`}>{paymentPaid ? 'Pago' : 'Pendente'}</span>
                  </div>
                  <div className="receipt-payment-status">
                    {isOverdue && !paymentPaid ? <span className="receipt-badge">{receiptStatus}</span> : null}
                    <span>Parcela 1 de 1</span>
                    <strong>{formatCurrency(summary.total)}</strong>
                    <span>{paymentState.method}</span>
                    <span>{formatDate(paymentState.dueDate)}</span>
                  </div>
                  <div className="receipt-summary">
                    <div>
                      <span>Valor original</span>
                      <strong>{formatCurrency(summary.total)}</strong>
                    </div>
                    <div>
                      <span>Desconto</span>
                      <strong>-{formatCurrency(0)}</strong>
                    </div>
                    <div>
                      <span>Valor final</span>
                      <strong>{formatCurrency(summary.total)}</strong>
                    </div>
                    <div>
                      <span>Valor pago</span>
                      <strong>{formatCurrency(summary.paid)}</strong>
                    </div>
                    <div>
                      <span>Valor restante</span>
                      <strong>{formatCurrency(summary.remaining)}</strong>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="receipt-body">
                <div className="receipt-thermal">
                  <pre>
{`==============================\nCOMPROVANTE DE VENDA\n\nData: ${formatDate(sale.date)}\nVenda: #${sale.id.slice(0, 6)}\nCliente: ${sale.customer}\n\n------------------------------\nPRODUTOS:\n${sale.itemName}\n${sale.itemQty}x ${formatCurrency(summary.total)}\n\nSubtotal: ${formatCurrency(summary.total)}\nTOTAL: ${formatCurrency(summary.total)}\n\n------------------------------\nPAGAMENTO:\n${paymentState.method}\nPENDENTE: ${formatDate(paymentState.dueDate)}\nPago: ${formatCurrency(summary.paid)}\nRestante: ${formatCurrency(summary.remaining)}\n\nSTATUS: ${paymentPaid ? 'PAGO' : 'PENDENTE'}\n------------------------------\nObrigado pela preferencia!\n${formatDate(sale.date)} ${formatTime(sale.date)}`}
                  </pre>
                </div>
              </div>
            )}

            <div className="receipt-actions">
              <button className="button primary" type="button" onClick={handleDownloadReceipt}>
                ⬇ Baixar
              </button>
              <button className="button ghost" type="button" onClick={handlePrintReceipt}>
                🖨 Imprimir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {markPaidOpen ? (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            event.stopPropagation();
            if (event.target !== event.currentTarget) return;
            setMarkPaidOpen(false);
          }}
        >
          <div className="modal modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Marcar como pago</h3>
              <button className="modal-close" type="button" onClick={() => setMarkPaidOpen(false)}>
                ✕
              </button>
            </div>
            <label className="modal-field">
              <span>Data do pagamento</span>
              <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
            </label>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setMarkPaidOpen(false)}>
                Cancelar
              </button>
              <button className="button primary" type="button" onClick={handleSavePaid}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen ? (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            event.stopPropagation();
            if (event.target !== event.currentTarget) return;
            setEditOpen(false);
          }}
        >
          <div className="modal modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Editar parcela</h3>
              <button className="modal-close" type="button" onClick={() => setEditOpen(false)}>
                ✕
              </button>
            </div>
            <label className="modal-field">
              <span>Data do vencimento</span>
              <input type="date" value={editDueDate} onChange={(event) => setEditDueDate(event.target.value)} />
            </label>
            <label className="modal-field">
              <span>Valor da parcela</span>
              <input value={editAmount} onChange={(event) => setEditAmount(event.target.value)} />
            </label>
            <label className="modal-field">
              <span>Forma do pagamento</span>
              <select value={editMethod} onChange={(event) => setEditMethod(event.target.value)}>
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setEditOpen(false)}>
                Cancelar
              </button>
              <button className="button primary" type="button" onClick={handleSaveEdit}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removeOpen ? (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            event.stopPropagation();
            if (event.target !== event.currentTarget) return;
            setRemoveOpen(false);
          }}
        >
          <div className="modal modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Remover parcela</h3>
              <button className="modal-close" type="button" onClick={() => setRemoveOpen(false)}>
                ✕
              </button>
            </div>
            <p>Tem certeza que deseja remover esta parcela?</p>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setRemoveOpen(false)}>
                Cancelar
              </button>
              <button className="button primary" type="button" onClick={handleRemove}>
                Remover
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {undoOpen ? (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            event.stopPropagation();
            if (event.target !== event.currentTarget) return;
            setUndoOpen(false);
          }}
        >
          <div className="modal modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Desfazer venda?</h3>
              <button className="modal-close" type="button" onClick={() => setUndoOpen(false)}>
                ✕
              </button>
            </div>
            <p>A cobranca gerada ao cliente sera removida e a unidade voltara ao estoque.</p>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setUndoOpen(false)}>
                Cancelar
              </button>
              <button className="button danger" type="button" onClick={() => setUndoOpen(false)}>
                Desfazer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
