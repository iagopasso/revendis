'use client';

import { useEffect, useMemo, useState } from 'react';
import { IconDots, IconPlus } from '../icons';
import { API_BASE, formatCurrency, toNumber } from '../lib';

type Receivable = {
  id: string;
  sale_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  amount: number | string;
  due_date: string;
  status: 'pending' | 'paid' | 'overdue';
  settled_at?: string | null;
  method?: string | null;
  created_at?: string;
};

type Expense = {
  id: string;
  store_id?: string;
  customer_id?: string | null;
  customer_name?: string | null;
  description: string;
  amount: number | string;
  due_date: string;
  status: 'pending' | 'paid';
  paid_at?: string | null;
  method?: string | null;
  created_at?: string;
};

type Payment = {
  id: string;
  sale_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  amount: number | string;
  due_date?: string;
  method?: string | null;
  created_at?: string;
};

type Customer = {
  id: string;
  name: string;
};

type EntryStatus = 'pending' | 'paid' | 'overdue';
type EntryKind = 'income' | 'expense';
type TransactionFilter =
  | 'all'
  | 'expenses'
  | 'expenses_pending'
  | 'expenses_paid'
  | 'income'
  | 'income_pending'
  | 'income_paid';

type FinanceEntry = {
  id: string;
  kind: EntryKind;
  description: string;
  subtitle: string;
  amount: number;
  dueDate: string;
  status: EntryStatus;
  paidAt?: string | null;
  settledAt?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  method?: string | null;
  sourceId: string;
  createdAt?: string;
  incomeSource?: 'receivable' | 'payment';
};

type FinancePanelProps = {
  initialReceivables: Receivable[];
  initialExpenses: Expense[];
  initialPayments: Payment[];
  customers: Customer[];
};

type ExpenseForm = {
  description: string;
  amount: string;
  dueDate: string;
  method: string;
  paid: boolean;
};

const monthNames = [
  'Janeiro',
  'Fevereiro',
  'Marco',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

const transactionFilterOptions: Array<{ value: TransactionFilter; label: string }> = [
  { value: 'all', label: 'Situacao da transacao' },
  { value: 'expenses', label: 'Despesas' },
  { value: 'expenses_pending', label: 'Despesas nao pagas' },
  { value: 'expenses_paid', label: 'Despesas pagas' },
  { value: 'income', label: 'Receitas' },
  { value: 'income_pending', label: 'Receitas nao recebidas' },
  { value: 'income_paid', label: 'Receitas recebidas' }
];

const paymentMethodLabel = (method?: string | null) => {
  const normalized = (method || '').trim().toLowerCase();
  if (!normalized) return 'Outro';
  if (normalized.includes('credito')) return 'Cartao de Credito';
  if (normalized.includes('debito')) return 'Cartao de Debito';
  if (normalized.includes('pix')) return 'Pix';
  if (normalized.includes('dinheiro') || normalized.includes('cash')) return 'Dinheiro';
  if (normalized.includes('boleto')) return 'Boleto';
  if (normalized.includes('transfer')) return 'Transferencia';
  return method || 'Outro';
};

const toInputDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateValue = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.includes('T') ? value : `${value}T00:00:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value: string) => {
  const date = parseDateValue(value);
  if (!date) return '--';
  return date.toLocaleDateString('pt-BR');
};

const formatLabelDate = (value?: string | null) => {
  const date = parseDateValue(value ?? '');
  return date ? date.toLocaleDateString('pt-BR') : null;
};

const isDateBefore = (value: string | null | undefined, today: Date) => {
  const date = parseDateValue(value);
  if (!date) return false;
  return date.getTime() < today.getTime();
};

const deriveReceivableStatus = (item: Receivable, today: Date): EntryStatus => {
  if (item.status === 'paid' || !!item.settled_at) return 'paid';
  if (item.status === 'overdue' || isDateBefore(item.due_date, today)) return 'overdue';
  return 'pending';
};

const deriveExpenseStatus = (item: Expense, today: Date): EntryStatus => {
  if (item.status === 'paid' || !!item.paid_at) return 'paid';
  if (isDateBefore(item.due_date, today)) return 'overdue';
  return 'pending';
};

const isSameMonth = (value: string, monthCursor: Date) => {
  const date = parseDateValue(value);
  if (!date) return false;
  return date.getFullYear() === monthCursor.getFullYear() && date.getMonth() === monthCursor.getMonth();
};

const toAmount = (input: string) => {
  const sanitized = input.replace(/[^\d,.-]/g, '');
  if (!sanitized) return NaN;

  const lastComma = sanitized.lastIndexOf(',');
  const lastDot = sanitized.lastIndexOf('.');
  const separatorIndex = Math.max(lastComma, lastDot);

  if (separatorIndex >= 0) {
    const integerRaw = sanitized.slice(0, separatorIndex).replace(/\D/g, '');
    const fractionRaw = sanitized.slice(separatorIndex + 1).replace(/\D/g, '');
    if (fractionRaw.length > 0 && fractionRaw.length <= 2) {
      const integerPart = integerRaw || '0';
      const fractionPart = fractionRaw.padEnd(2, '0');
      return Number(`${integerPart}.${fractionPart}`);
    }
  }

  const integerOnly = sanitized.replace(/\D/g, '');
  return integerOnly ? Number(integerOnly) : NaN;
};

const statusLabel = (entry: FinanceEntry) => {
  if (entry.status === 'paid') {
    const paidDate =
      entry.kind === 'expense'
        ? entry.paidAt
        : entry.incomeSource === 'receivable'
        ? entry.settledAt
        : entry.createdAt;
    const dateLabel = formatLabelDate(paidDate);
    return dateLabel ? `Pago em ${dateLabel}` : 'Pago';
  }
  if (entry.status === 'overdue') return 'Atrasado';
  return 'Pendente';
};

const statusClass = (status: EntryStatus) => {
  if (status === 'paid') return 'paid';
  if (status === 'overdue') return 'overdue';
  return 'pending';
};

const shortSaleCode = (saleId: string) => saleId.slice(0, 8).toUpperCase();

const sortByDateDesc = (entries: FinanceEntry[]) => {
  return [...entries].sort((a, b) => {
    const dueA = parseDateValue(a.dueDate)?.getTime() || 0;
    const dueB = parseDateValue(b.dueDate)?.getTime() || 0;
    if (dueB !== dueA) return dueB - dueA;
    const createdA = parseDateValue(a.createdAt || undefined)?.getTime() || 0;
    const createdB = parseDateValue(b.createdAt || undefined)?.getTime() || 0;
    return createdB - createdA;
  });
};

const createDefaultForm = (monthCursor: Date): ExpenseForm => {
  const baseDate = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  return {
    description: '',
    amount: '',
    dueDate: toInputDate(baseDate),
    method: '',
    paid: false
  };
};

export default function FinancePanel({
  initialReceivables,
  initialExpenses,
  initialPayments,
  customers
}: FinancePanelProps) {
  const [receivables, setReceivables] = useState<Receivable[]>(initialReceivables);
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [payments, setPayments] = useState<Payment[]>(initialPayments);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>('all');
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(() => createDefaultForm(new Date()));
  const [formError, setFormError] = useState<string | null>(null);
  const [creatingExpense, setCreatingExpense] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    setReceivables(initialReceivables);
  }, [initialReceivables]);

  useEffect(() => {
    setExpenses(initialExpenses);
  }, [initialExpenses]);

  useEffect(() => {
    setPayments(initialPayments);
  }, [initialPayments]);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('.finance-entry-actions')) {
        setMenuOpenId(null);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const allEntries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const incomeEntriesFromReceivables: FinanceEntry[] = receivables.map((item) => {
      const customerName = item.customer_name?.trim() || null;
      const description = customerName ? `Venda - ${customerName}` : `Venda #${shortSaleCode(item.sale_id)}`;
      return {
        id: `income-${item.id}`,
        kind: 'income',
        description,
        subtitle: `Receita - ${paymentMethodLabel(item.method)}`,
        amount: toNumber(item.amount),
        dueDate: item.due_date,
        status: deriveReceivableStatus(item, today),
        settledAt: item.settled_at ?? item.created_at ?? undefined,
        customerId: item.customer_id || null,
        customerName,
        method: item.method,
        sourceId: item.id,
        createdAt: item.created_at,
        incomeSource: 'receivable'
      };
    });

    const incomeEntriesFromPayments: FinanceEntry[] = payments.map((item) => {
      const customerName = item.customer_name?.trim() || null;
      const description = customerName ? `Venda - ${customerName}` : `Venda #${shortSaleCode(item.sale_id)}`;
      return {
        id: `payment-${item.id}`,
        kind: 'income',
        description,
        subtitle: `Pagamento - ${paymentMethodLabel(item.method)}`,
        amount: toNumber(item.amount),
        dueDate: item.due_date || (item.created_at ? item.created_at.slice(0, 10) : toInputDate(new Date())),
        status: 'paid',
        settledAt: item.created_at,
        customerId: item.customer_id || null,
        customerName,
        method: item.method,
        sourceId: item.id,
        createdAt: item.created_at,
        incomeSource: 'payment'
      };
    });

    const expenseEntries: FinanceEntry[] = expenses.map((item) => ({
      id: `expense-${item.id}`,
      kind: 'expense',
      description: item.description,
      subtitle: `Despesa avulsa - ${paymentMethodLabel(item.method)}`,
      amount: toNumber(item.amount),
      dueDate: item.due_date,
      status: deriveExpenseStatus(item, today),
      paidAt: item.paid_at,
      customerId: item.customer_id || null,
      customerName: item.customer_name || null,
      method: item.method,
      sourceId: item.id,
      createdAt: item.created_at
    }));

    return sortByDateDesc([...incomeEntriesFromReceivables, ...incomeEntriesFromPayments, ...expenseEntries]);
  }, [expenses, payments, receivables]);

  const monthEntries = useMemo(() => {
    return allEntries.filter((entry) => {
      if (!isSameMonth(entry.dueDate, monthCursor)) return false;
      if (customerFilter === 'all') return true;
      return entry.customerId === customerFilter;
    });
  }, [allEntries, customerFilter, monthCursor]);

  const visibleEntries = useMemo(() => {
    const filterByTransaction = (entry: FinanceEntry) => {
      if (transactionFilter === 'all') return true;
      if (transactionFilter === 'expenses') return entry.kind === 'expense';
      if (transactionFilter === 'expenses_pending') {
        return entry.kind === 'expense' && entry.status !== 'paid';
      }
      if (transactionFilter === 'expenses_paid') {
        return entry.kind === 'expense' && entry.status === 'paid';
      }
      if (transactionFilter === 'income') return entry.kind === 'income';
      if (transactionFilter === 'income_pending') {
        return entry.kind === 'income' && entry.status !== 'paid';
      }
      return entry.kind === 'income' && entry.status === 'paid';
    };

    return monthEntries.filter(filterByTransaction);
  }, [monthEntries, transactionFilter]);

  const summary = useMemo(() => {
    const incomeExpected = monthEntries
      .filter((entry) => entry.kind === 'income')
      .reduce((sum, entry) => sum + entry.amount, 0);
    const incomePaid = monthEntries
      .filter((entry) => entry.kind === 'income' && entry.status === 'paid')
      .reduce((sum, entry) => sum + entry.amount, 0);

    const expenseExpected = monthEntries
      .filter((entry) => entry.kind === 'expense')
      .reduce((sum, entry) => sum + entry.amount, 0);
    const expensePaid = monthEntries
      .filter((entry) => entry.kind === 'expense' && entry.status === 'paid')
      .reduce((sum, entry) => sum + entry.amount, 0);

    return {
      incomeExpected,
      incomePaid,
      expenseExpected,
      expensePaid,
      monthBalance: incomePaid - expensePaid,
      monthBalanceExpected: incomeExpected - expenseExpected
    };
  }, [monthEntries]);

  const monthLabel = `${monthNames[monthCursor.getMonth()]} / ${monthCursor.getFullYear()}`;

  const customerOptions = useMemo(() => {
    return [
      { value: 'all', label: 'Cliente' },
      ...customers
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map((customer) => ({ value: customer.id, label: customer.name }))
    ];
  }, [customers]);

  const changeMonth = (delta: number) => {
    setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const openCreateModal = () => {
    setExpenseForm(createDefaultForm(monthCursor));
    setFormError(null);
    setIsCreateOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setCreatingExpense(false);
    setFormError(null);
  };

  const handleCreateExpense = async () => {
    const description = expenseForm.description.trim();
    const amount = toAmount(expenseForm.amount);
    if (!description) {
      setFormError('Informe a descricao da despesa.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Informe um valor valido.');
      return;
    }
    if (!expenseForm.dueDate) {
      setFormError('Informe a data da despesa.');
      return;
    }

    setCreatingExpense(true);
    setFormError(null);

    try {
      const res = await fetch(`${API_BASE}/finance/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          amount,
          dueDate: expenseForm.dueDate,
          method: expenseForm.method || undefined,
          paid: expenseForm.paid
        })
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setFormError(payload?.message || 'Erro ao incluir despesa.');
        return;
      }

      const payload = (await res.json()) as { data?: Expense };
      if (!payload.data) {
        setFormError('Erro ao incluir despesa.');
        return;
      }

      setExpenses((prev) => [payload.data as Expense, ...prev]);
      closeCreateModal();
    } catch {
      setFormError('Erro ao incluir despesa.');
    } finally {
      setCreatingExpense(false);
    }
  };

  const updateEntryInState = (
    entry: FinanceEntry,
    updated: { status?: EntryStatus; paid_at?: string | null; settled_at?: string | null }
  ) => {
    if (entry.kind === 'expense') {
      setExpenses((prev) =>
        prev.map((item) =>
          item.id === entry.sourceId
            ? {
                ...item,
                status: updated.status === 'paid' ? 'paid' : 'pending',
                paid_at: updated.paid_at ?? item.paid_at
              }
            : item
        )
      );
      return;
    }

    setReceivables((prev) =>
      prev.map((item) =>
        item.id === entry.sourceId
          ? {
              ...item,
              status: updated.status || item.status,
              settled_at: updated.settled_at ?? item.settled_at
            }
          : item
      )
    );
  };

  const markAsPaid = async (entry: FinanceEntry) => {
    setActionError(null);
    setProcessingId(entry.id);
    setMenuOpenId(null);

    try {
      if (entry.kind === 'expense') {
        const res = await fetch(`${API_BASE}/finance/expenses/${entry.sourceId}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { message?: string } | null;
          setActionError(payload?.message || 'Erro ao marcar despesa como paga.');
          return;
        }

        const payload = (await res.json()) as { data?: Expense };
        if (payload.data) {
          updateEntryInState(entry, {
            status: 'paid',
            paid_at: payload.data.paid_at || new Date().toISOString()
          });
        }
        return;
      }

      const res = await fetch(`${API_BASE}/finance/receivables/${entry.sourceId}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: entry.amount, settledAt: new Date().toISOString() })
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setActionError(payload?.message || 'Erro ao marcar receita como recebida.');
        return;
      }

      updateEntryInState(entry, { status: 'paid', settled_at: new Date().toISOString() });
    } catch {
      setActionError('Erro ao atualizar transacao.');
    } finally {
      setProcessingId(null);
    }
  };

  const markAsPending = async (entry: FinanceEntry) => {
    setActionError(null);
    setProcessingId(entry.id);
    setMenuOpenId(null);

    try {
      if (entry.kind === 'expense') {
        const res = await fetch(`${API_BASE}/finance/expenses/${entry.sourceId}/unpay`, {
          method: 'POST'
        });

        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { message?: string } | null;
          setActionError(payload?.message || 'Erro ao reabrir despesa.');
          return;
        }

        updateEntryInState(entry, { status: 'pending', paid_at: null });
        return;
      }

      const res = await fetch(`${API_BASE}/finance/receivables/${entry.sourceId}/unsettle`, {
        method: 'POST'
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setActionError(payload?.message || 'Erro ao reabrir receita.');
        return;
      }

      updateEntryInState(entry, { status: 'pending', settled_at: null });
    } catch {
      setActionError('Erro ao atualizar transacao.');
    } finally {
      setProcessingId(null);
    }
  };

  const deleteExpense = async (entry: FinanceEntry) => {
    if (entry.kind !== 'expense') return;

    setActionError(null);
    setProcessingId(entry.id);
    setMenuOpenId(null);

    try {
      const res = await fetch(`${API_BASE}/finance/expenses/${entry.sourceId}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setActionError(payload?.message || 'Erro ao excluir despesa.');
        return;
      }

      setExpenses((prev) => prev.filter((item) => item.id !== entry.sourceId));
    } catch {
      setActionError('Erro ao excluir despesa.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <>
      <section className="panel finance-toolbar-panel filters-panel-static">
        <div className="finance-toolbar-row">
          <div className="finance-month-picker">
            <button type="button" className="button icon" onClick={() => changeMonth(-1)} aria-label="Mes anterior">
              ‹
            </button>
            <div className="finance-month-current">{monthLabel}</div>
            <button type="button" className="button icon" onClick={() => changeMonth(1)} aria-label="Proximo mes">
              ›
            </button>
          </div>

          <div className="finance-toolbar-actions">
            <label className="select finance-select">
              <span>Tipo</span>
              <select
                value={transactionFilter}
                onChange={(event) => setTransactionFilter(event.target.value as TransactionFilter)}
              >
                {transactionFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <strong>▾</strong>
            </label>

            <label className="select finance-select">
              <span>Cliente</span>
              <select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
                {customerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <strong>▾</strong>
            </label>

            <button type="button" className="button primary finance-expense-button" onClick={openCreateModal}>
              <IconPlus /> Incluir despesa
            </button>
          </div>
        </div>
      </section>

      <section className="finance-summary-grid">
        <article className="stat-card finance-summary-card">
          <div>
            <div className="stat-label">Saldo do mes</div>
            <div className="stat-value">{formatCurrency(summary.monthBalance)}</div>
            <div className={`meta ${summary.monthBalanceExpected < 0 ? 'finance-negative' : ''}`}>
              Esperado: {formatCurrency(summary.monthBalanceExpected)}
            </div>
          </div>
          <div className="finance-summary-icon violet">▥</div>
        </article>

        <article className="stat-card finance-summary-card">
          <div>
            <div className="stat-label">Receitas</div>
            <div className="stat-value">{formatCurrency(summary.incomePaid)}</div>
            <div className="meta">Esperado: {formatCurrency(summary.incomeExpected)}</div>
          </div>
          <div className="finance-summary-icon green">↑</div>
        </article>

        <article className="stat-card finance-summary-card">
          <div>
            <div className="stat-label">Despesas</div>
            <div className="stat-value">{formatCurrency(summary.expensePaid)}</div>
            <div className="meta">Esperado: {formatCurrency(summary.expenseExpected)}</div>
          </div>
          <div className="finance-summary-icon red">↓</div>
        </article>
      </section>

      <section className="panel finance-list-panel">
        {visibleEntries.length === 0 ? (
          <div className="finance-empty">
            <div className="finance-empty-icon">$</div>
            <strong>Nenhuma movimentacao encontrada</strong>
            <span>Nao foram encontradas movimentacoes para o periodo selecionado.</span>
          </div>
        ) : (
          <div className="finance-list-table">
            <div className="finance-list-head">
              <span>Descricao</span>
              <span>Valor</span>
              <span>Situacao</span>
              <span>Vencimento</span>
              <span />
            </div>

            {visibleEntries.map((entry) => (
              <div key={entry.id} className="finance-list-row">
                <div className="finance-desc-cell">
                  <span className={`finance-entry-dot ${entry.kind === 'expense' ? 'expense' : 'income'}`}>
                    {entry.kind === 'expense' ? '↓' : '↑'}
                  </span>
                  <div>
                    <strong>{entry.description}</strong>
                    <div className="meta">{entry.subtitle}</div>
                  </div>
                </div>
                <div className="mono finance-value-cell">{formatCurrency(entry.amount)}</div>
                <div>
                <span className={`finance-status-badge ${statusClass(entry.status)}`}>
                  {statusLabel(entry)}
                </span>
              </div>
                <div className="mono">{formatDate(entry.dueDate)}</div>
                <div className="finance-entry-actions">
                  {entry.kind === 'expense' || entry.incomeSource === 'receivable' ? (
                    <>
                      <button
                        type="button"
                        className={`button icon small${menuOpenId === entry.id ? ' active' : ''}`}
                        onClick={() => setMenuOpenId((current) => (current === entry.id ? null : entry.id))}
                        aria-label="Acoes"
                        disabled={processingId === entry.id}
                      >
                        <IconDots />
                      </button>

                      {menuOpenId === entry.id ? (
                        <div className="finance-entry-menu">
                          {entry.status === 'paid' ? (
                            <button type="button" onClick={() => markAsPending(entry)}>
                              Marcar como pendente
                            </button>
                          ) : (
                            <button type="button" onClick={() => markAsPaid(entry)}>
                              Marcar como pago
                            </button>
                          )}

                          {entry.kind === 'expense' ? (
                            <button type="button" className="danger" onClick={() => deleteExpense(entry)}>
                              Excluir
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <span className="finance-entry-action-placeholder">--</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {actionError ? <div className="field-error finance-action-error">{actionError}</div> : null}
      </section>

      {isCreateOpen ? (
        <div className="modal-backdrop" onClick={closeCreateModal}>
          <div className="modal modal-finance-expense" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Incluir despesa</h3>
              <button className="modal-close" type="button" onClick={closeCreateModal}>
                ✕
              </button>
            </div>

            <label className="modal-field">
              <span>Descricao</span>
              <input
                value={expenseForm.description}
                onChange={(event) => setExpenseForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Ex.: Conta de energia"
              />
            </label>

            <div className="form-row">
              <label className="modal-field">
                <span>Valor da despesa</span>
                <input
                  value={expenseForm.amount}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))}
                  placeholder="0,00"
                />
              </label>
              <label className="modal-field">
                <span>Data</span>
                <input
                  type="date"
                  value={expenseForm.dueDate}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                />
              </label>
            </div>

            <label className="modal-field">
              <span>Forma do pagamento</span>
              <select
                value={expenseForm.method}
                onChange={(event) => setExpenseForm((prev) => ({ ...prev, method: event.target.value }))}
              >
                <option value="">Selecione</option>
                <option value="pix">Pix</option>
                <option value="cash">Dinheiro</option>
                <option value="credit_card">Cartao de Credito</option>
                <option value="debit_card">Cartao de Debito</option>
                <option value="transfer">Transferencia</option>
                <option value="bank_slip">Boleto</option>
              </select>
            </label>

            <div className="finance-paid-switch-row">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={expenseForm.paid}
                  onChange={(event) =>
                    setExpenseForm((prev) => ({
                      ...prev,
                      paid: event.target.checked
                    }))
                  }
                />
                <span className="slider" />
              </label>
              <strong>Ja foi paga?</strong>
            </div>

            {formError ? <div className="field-error">{formError}</div> : null}

            <div className="modal-footer finance-expense-footer">
              <button className="button ghost" type="button" onClick={closeCreateModal}>
                Cancelar
              </button>
              <button
                className="button primary"
                type="button"
                onClick={handleCreateExpense}
                disabled={creatingExpense}
              >
                {creatingExpense ? 'Incluindo...' : 'Incluir'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
