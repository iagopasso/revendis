'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE, buildMutationHeaders, digitsOnly, formatCurrency, toNumber } from './lib';
import { IconBox } from './icons';
import { downloadPdf } from '../lib/pdf';
import { closeDownloadWindow, isMobileWeb, prepareIosDownloadWindow } from '../lib/download';
import { printHtml } from '../lib/print';

export type SaleDetail = {
  id: string;
  customer: string;
  customerPhotoUrl?: string;
  date: string;
  status: 'delivered' | 'pending' | 'cancelled';
  total: number;
  paid: number;
  itemName: string;
  itemQty: number;
  dueDate?: string;
};

export type SaleUpdate = {
  id: string;
  status?: SaleDetail['status'];
  paymentStatus?: 'paid' | 'pending';
  removed?: boolean;
};

type SaleItemDetail = {
  id: string;
  product_id?: string | null;
  sku: string;
  quantity: number | string;
  price: number | string;
  stock_units?: number | string;
  product_name?: string | null;
  product_brand?: string | null;
  product_image_url?: string | null;
};

type PaymentDetail = {
  id: string;
  method: string;
  amount: number | string;
  created_at: string;
};

type ReceivableDetail = {
  id: string;
  amount: number | string;
  due_date: string;
  status: string;
  settled_at?: string | null;
  method?: string | null;
};

type SaleDetailResponse = {
  id: string;
  status: string;
  total: number | string;
  subtotal: number | string;
  discount_total: number | string;
  created_at: string;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_photo_url?: string | null;
  items: SaleItemDetail[];
  payments: PaymentDetail[];
  receivables: ReceivableDetail[];
  cost_total: number | string;
  profit: number | string;
};

type SalesDetailModalProps = {
  open: boolean;
  onClose: () => void;
  sale?: SaleDetail | null;
  onUpdated?: (update: SaleUpdate) => void;
  onEditSale?: (saleId: string) => void;
};

type PaymentState = {
  amount: number;
  dueDate: string;
  method: string;
  paidAt?: string | null;
};

type InstallmentInput = {
  id: string;
  dueDate: string;
  amount: string;
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

const padRight = (text: string, length: number) => text.padEnd(length, ' ');
const padLeft = (text: string, length: number) => text.padStart(length, ' ');
const repeatChar = (char: string, length: number) => char.repeat(length);

const centerText = (text: string, length: number) => {
  if (text.length >= length) return text;
  const padding = Math.floor((length - text.length) / 2);
  return `${' '.repeat(padding)}${text}`;
};

const wrapText = (text: string, length: number) => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [''];
  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    if (!current.length) {
      if (word.length <= length) {
        current = word;
        return;
      }
      for (let index = 0; index < word.length; index += length) {
        lines.push(word.slice(index, index + length));
      }
      return;
    }
    if (current.length + 1 + word.length <= length) {
      current = `${current} ${word}`;
      return;
    }
    lines.push(current);
    if (word.length <= length) {
      current = word;
      return;
    }
    for (let index = 0; index < word.length; index += length) {
      lines.push(word.slice(index, index + length));
    }
    current = '';
  });
  if (current.length) lines.push(current);
  return lines;
};

const buildRow = (label: string, value: string, columns: number) => {
  const available = columns - value.length;
  if (available <= 0 || label.length >= available) {
    return `${label}\n${padLeft(value, columns)}`;
  }
  return `${padRight(label, available)}${value}`;
};

const compactText = (value: string, maxLength: number) => {
  const normalized = value.trim();
  if (!normalized || maxLength <= 0) return '';
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 3) return normalized.slice(0, maxLength);
  const edge = Math.max(1, Math.floor((maxLength - 3) / 2));
  const tail = Math.max(1, maxLength - 3 - edge);
  return `${normalized.slice(0, edge)}...${normalized.slice(-tail)}`;
};

const formatCurrencyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const amount = Number(digits) / 100;
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const parseMoney = (value: string) => {
  const cleaned = value.replace(/[^\d,.-]/g, '');
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_NOON_HOUR = 12;

const toIsoDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toUtcIsoDate = (value: Date) => {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateOnlyAsUtcNoon = (value: string) => {
  const match = value.match(DATE_ONLY_REGEX);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day, UTC_NOON_HOUR, 0, 0, 0));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
};

const addMonths = (dateValue: string, months: number) => {
  const base = parseDateOnlyAsUtcNoon(dateValue);
  if (!base) return dateValue;
  base.setUTCMonth(base.getUTCMonth() + months);
  return toUtcIsoDate(base);
};

const buildInstallments = (count: number, total: number, startDate: string): InstallmentInput[] => {
  if (count <= 0 || total <= 0) return [];
  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }).map((_, index) => {
    const cents = base + (index < remainder ? 1 : 0);
    return {
      id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      dueDate: addMonths(startDate, index),
      amount: formatCurrency(cents / 100)
    };
  });
};

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

const getPaymentStatus = (
  total: number,
  payments: PaymentDetail[],
  receivables: ReceivableDetail[]
): 'paid' | 'pending' => {
  if (total <= 0) return 'paid';
  const paidFromPayments = payments.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const paidFromReceivables = receivables
    .filter((item) => item.status === 'paid')
    .reduce((sum, item) => sum + toNumber(item.amount), 0);
  return paidFromPayments + paidFromReceivables >= total ? 'paid' : 'pending';
};

export default function SalesDetailModal({ open, onClose, sale, onUpdated, onEditSale }: SalesDetailModalProps) {
  const router = useRouter();
  const [statusOpen, setStatusOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptTab, setReceiptTab] = useState<'digital' | 'termico'>('digital');
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [unsettleOpen, setUnsettleOpen] = useState(false);
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
  const [registerAmount, setRegisterAmount] = useState('');
  const [registerMethod, setRegisterMethod] = useState('');
  const [installments, setInstallments] = useState<InstallmentInput[]>([]);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [activePaymentMenu, setActivePaymentMenu] = useState<string | null>(null);
  const [settleTarget, setSettleTarget] = useState<ReceivableDetail | null>(null);
  const [settleDate, setSettleDate] = useState(toIsoDate(new Date()));
  const [unsettleTarget, setUnsettleTarget] = useState<ReceivableDetail | null>(null);
  const [editTarget, setEditTarget] = useState<ReceivableDetail | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ReceivableDetail | null>(null);
  const [editDueDate, setEditDueDate] = useState(toIsoDate(new Date()));
  const [editAmount, setEditAmount] = useState('');
  const [editMethod, setEditMethod] = useState(paymentMethods[0]);
  const [detail, setDetail] = useState<SaleDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [profitVisible, setProfitVisible] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const digitalReceiptRef = useRef<HTMLDivElement>(null);
  const thermalReceiptRef = useRef<HTMLDivElement>(null);

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
    setEditDueDate(dueDate);
    setEditAmount(String(sale.total));
    setEditMethod('Dinheiro');
    setReceiptTab('digital');
    setStatusOpen(false);
    setActionsOpen(false);
    setActivePaymentMenu(null);
    setDetail(null);
    setProfitVisible(false);
    setRegisterAmount('');
    setRegisterMethod('');
    setInstallments([]);
    setRegistering(false);
    setRegisterError(null);
    setStatusUpdating(false);
    setSettleOpen(false);
    setSettleTarget(null);
    setSettleDate(toIsoDate(new Date()));
    setUnsettleOpen(false);
    setUnsettleTarget(null);
    setEditTarget(null);
    setRemoveTarget(null);
  }, [sale]);

  useEffect(() => {
    if (!sale || !open) return;
    let active = true;
    setDetailLoading(true);
    fetch(`${API_BASE}/sales/orders/${sale.id}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { data: SaleDetailResponse };
      })
      .then((payload) => {
        if (!active) return;
        setDetail(payload?.data || null);
      })
      .catch(() => {
        if (!active) return;
        setDetail(null);
      })
      .finally(() => {
        if (!active) return;
        setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sale, open]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!open || (!statusOpen && !actionsOpen && !activePaymentMenu)) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (statusOpen && !target.closest('.sale-dropdown.status-dropdown')) {
        setStatusOpen(false);
      }
      if (actionsOpen && !target.closest('.sale-dropdown.actions-dropdown')) {
        setActionsOpen(false);
      }
      if (activePaymentMenu && !target.closest('.payment-item')) {
        setActivePaymentMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setStatusOpen(false);
      setActionsOpen(false);
      setActivePaymentMenu(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, statusOpen, actionsOpen, activePaymentMenu]);

  const payments = detail?.payments ?? [];
  const receivables = detail?.receivables ?? [];
  const totalValue = toNumber(detail?.total ?? sale?.total ?? paymentState.amount);
  const paidFromPayments = payments.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const paidFromReceivables = receivables
    .filter((item) => item.status === 'paid')
    .reduce((sum, item) => sum + toNumber(item.amount), 0);
  const paidValue = paidFromPayments + paidFromReceivables;

  const summary = useMemo(() => {
    return { total: totalValue, paid: paidValue, remaining: Math.max(totalValue - paidValue, 0) };
  }, [totalValue, paidValue]);

  useEffect(() => {
    if (!markPaidOpen) return;
    const remaining = summary.remaining;
    const baseDate = paymentState.dueDate || toIsoDate(new Date());
    const amountValue = remaining > 0 ? remaining : 0;
    setRegisterAmount(amountValue > 0 ? formatCurrency(amountValue) : formatCurrency(0));
    setRegisterMethod('');
    setInstallments(amountValue > 0 ? buildInstallments(1, amountValue, baseDate) : []);
    setRegisterError(null);
  }, [markPaidOpen, summary.remaining, paymentState.dueDate]);

  useEffect(() => {
    if (!markPaidOpen) return;
    const total = parseMoney(registerAmount);
    if (total <= 0) {
      setInstallments([]);
      return;
    }
    const baseDate = paymentState.dueDate || toIsoDate(new Date());
    const count = installments.length || 1;
    setInstallments(buildInstallments(count, total, baseDate));
  }, [registerAmount, markPaidOpen, installments.length, paymentState.dueDate]);

  useEffect(() => {
    if (!markPaidOpen) return;
    const total = parseMoney(registerAmount);
    if (total > summary.remaining) {
      setRegisterError('Valor maior que o valor da venda');
    } else if (registerError === 'Valor maior que o valor da venda') {
      setRegisterError(null);
    }
  }, [registerAmount, markPaidOpen, registerError, summary.remaining]);

  if (!open || !sale) return null;

  const notifyUpdate = (override?: {
    status?: SaleDetail['status'];
    payments?: PaymentDetail[];
    receivables?: ReceivableDetail[];
    total?: number;
  }) => {
    const nextStatus = override?.status ?? deliveryStatus;
    const nextPayments = override?.payments ?? payments;
    const nextReceivables = override?.receivables ?? receivables;
    const nextTotal = override?.total ?? totalValue;
    onUpdated?.({
      id: sale.id,
      status: nextStatus,
      paymentStatus: getPaymentStatus(nextTotal, nextPayments, nextReceivables)
    });
  };

  const isCancelled = deliveryStatus === 'cancelled';
  const isPaid = summary.total > 0 ? summary.paid >= summary.total : false;
  const showPaymentCallout = !isCancelled && summary.remaining > 0 && receivables.length === 0;

  const customerName = detail?.customer_name || sale.customer;
  const customerPhotoUrl = detail?.customer_photo_url || sale.customerPhotoUrl;
  const saleItems =
    detail?.items && detail.items.length
      ? detail.items
      : [
          {
            id: sale.id,
            sku: '',
            quantity: sale.itemQty,
            price: sale.itemQty ? summary.total / sale.itemQty : summary.total,
            product_name: sale.itemName
          }
        ];

  const getItemTitle = (item: SaleItemDetail) => {
    const baseName = item.product_name || sale.itemName || '';
    const itemCode = digitsOnly(item.sku) || '';
    if (itemCode && baseName) return `${itemCode} - ${baseName}`;
    return baseName || itemCode;
  };

  const getItemMetaLine = (item: SaleItemDetail) => {
    const itemCode = digitsOnly(item.sku) || '';
    if (!itemCode) return '';
    return `${item.product_brand || 'Sem marca'} • ${itemCode}`;
  };

  const getItemImage = (item: SaleItemDetail) => {
    const value = item.product_image_url?.trim();
    return value || '';
  };

  const profitValue = detail
    ? toNumber(detail.profit ?? totalValue - toNumber(detail.cost_total))
    : 0;

  const receivableEntries = receivables.map((receivable, index) => ({
    id: receivable.id,
    label: `Parcela ${index + 1} de ${receivables.length}`,
    amount: toNumber(receivable.amount),
    status: receivable.status === 'paid' ? 'paid' : 'pending',
    date: receivable.status === 'paid' ? receivable.settled_at || receivable.due_date : receivable.due_date,
    method: receivable.method || 'Outro'
  }));

  const paymentEntries = payments.map((payment, index) => ({
    id: payment.id || `payment-${index}`,
    label: 'Pagamento',
    amount: toNumber(payment.amount),
    status: 'paid' as const,
    date: payment.created_at,
    method: payment.method || 'Outro'
  }));

  const paymentListEntries = [
    ...receivables.map((receivable) => ({
      id: receivable.id,
      kind: 'receivable' as const,
      amount: toNumber(receivable.amount),
      status: receivable.status === 'paid' ? 'paid' : 'pending',
      date: receivable.status === 'paid' ? receivable.settled_at || receivable.due_date : receivable.due_date,
      method: receivable.method || 'Outro'
    })),
    ...payments.map((payment, index) => ({
      id: payment.id || `payment-${index}`,
      kind: 'payment' as const,
      amount: toNumber(payment.amount),
      status: 'paid' as const,
      date: payment.created_at,
      method: payment.method || 'Outro'
    }))
  ]
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      return aTime - bTime;
    });

  const primaryPaidEntry = paymentListEntries.find((entry) => entry.status === 'paid');
  const paymentDisplayDate =
    primaryPaidEntry?.date ||
    paymentListEntries[0]?.date ||
    sale.dueDate ||
    sale.date;

  const receiptInstallments = paymentListEntries.map((entry, index) => ({
    ...entry,
    installmentLabel: `Parcela ${index + 1} de ${paymentListEntries.length}`,
    statusLabel: entry.status === 'paid' ? 'Pago' : 'Pendente'
  }));

  const receiptPaymentStatus =
    summary.paid <= 0
      ? 'Pendente'
      : summary.remaining <= 0
        ? 'Pago'
        : 'Parcial';

  const receiptPaymentStatusClass =
    receiptPaymentStatus === 'Pago' ? 'paid' : receiptPaymentStatus === 'Parcial' ? 'partial' : 'pending';

  const thermalStatusLabel =
    receiptPaymentStatus === 'Parcial' ? 'PARCIAL' : receiptPaymentStatus.toUpperCase();

  const thermalWidthMm: 80 | 58 = receiptInstallments.length > 4 ? 58 : 80;
  const thermalColumns = thermalWidthMm === 58 ? 24 : 32;
  const thermalFormat = thermalWidthMm === 58 ? 'thermal-58' : 'thermal-80';
  const thermalSaleValue = `#${compactText(sale.id, Math.max(8, thermalColumns - 8))}`;
  const thermalLine = repeatChar('=', thermalColumns);
  const thermalDash = repeatChar('-', thermalColumns);
  const thermalSubtotal = toNumber(detail?.subtotal ?? summary.total);

  const thermalItemLines = saleItems.flatMap((item) => {
    const qty = toNumber(item.quantity);
    const unitPrice = toNumber(item.price);
    const totalItem = qty * unitPrice;
    const itemTitle = getItemTitle(item) || 'Item';
    const nameLines = wrapText(itemTitle, thermalColumns);
    const qtyLine = `${qty} x ${formatCurrency(unitPrice)}`;
    const totalValue = formatCurrency(totalItem);
    const detailLine = buildRow(qtyLine, totalValue, thermalColumns);
    return [...nameLines, detailLine];
  });

  const thermalReceiptText = [
    thermalLine,
    centerText('COMPROVANTE DE VENDA', thermalColumns),
    thermalDash,
    `Data do pagamento: ${formatDate(paymentDisplayDate)}`,
    buildRow('Venda:', thermalSaleValue, thermalColumns),
    `Cliente: ${customerName}`,
    thermalDash,
    'PRODUTOS',
    thermalItemLines.length ? thermalItemLines.join('\n') : 'Sem itens',
    thermalDash,
    'RESUMO',
    buildRow('Subtotal:', formatCurrency(thermalSubtotal), thermalColumns),
    buildRow('Total:', formatCurrency(summary.total), thermalColumns),
    thermalDash,
    'PAGAMENTO',
    buildRow('Pago:', formatCurrency(summary.paid), thermalColumns),
    buildRow('Restante:', formatCurrency(summary.remaining), thermalColumns),
    thermalDash,
    `STATUS: ${thermalStatusLabel}`,
    thermalLine
  ].join('\n');

  const handleRegisterPayment = async () => {
    if (!sale || isCancelled) return;
    const totalToRegister = parseMoney(registerAmount);
    if (totalToRegister <= 0) {
      setRegisterError('Informe o valor do pagamento');
      return;
    }
    if (totalToRegister > summary.remaining) {
      setRegisterError('Valor maior que o valor da venda');
      return;
    }
    setRegisterError(null);

    const baseDate = paymentState.dueDate || toIsoDate(new Date());
    const normalizedInstallments =
      installments.length > 0 ? installments : buildInstallments(1, totalToRegister, baseDate);
    const installmentsTotal = normalizedInstallments.reduce(
      (sum, item) => sum + parseMoney(item.amount),
      0
    );
    if (Math.abs(installmentsTotal - totalToRegister) > 0.01) {
      setRegisterError('A soma das parcelas precisa ser igual ao valor informado');
      return;
    }

    setRegistering(true);
    try {
      let nextReceivables = [...receivables];

      for (const installment of normalizedInstallments) {
        const amount = parseMoney(installment.amount);
        if (!amount || !installment.dueDate) continue;
        const res = await fetch(`${API_BASE}/finance/receivables`, {
          method: 'POST',
          headers: buildMutationHeaders(),
          body: JSON.stringify({
            saleId: sale.id,
            amount,
            dueDate: installment.dueDate,
            method: registerMethod || undefined
          })
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { message?: string } | null;
          setToast(payload?.message || 'Erro ao registrar parcelas');
          return;
        }
        const payload = (await res.json()) as { data?: ReceivableDetail };
        if (payload.data) {
          nextReceivables = [...nextReceivables, payload.data];
        }
      }

      setDetail((prev) => (prev ? { ...prev, receivables: nextReceivables } : prev));
      setMarkPaidOpen(false);
      setToast('Pagamento registrado');
      router.refresh();
      notifyUpdate({ receivables: nextReceivables });
    } catch {
      setToast('Erro ao registrar pagamento');
    } finally {
      setRegistering(false);
    }
  };

  const registerTotal = parseMoney(registerAmount);

  const handleIncreaseInstallments = () => {
    if (registerTotal <= 0) return;
    const nextCount = Math.max(installments.length + 1, 1);
    setInstallments(buildInstallments(nextCount, registerTotal, paymentState.dueDate || toIsoDate(new Date())));
  };

  const handleDecreaseInstallments = () => {
    if (installments.length <= 1) return;
    const nextCount = installments.length - 1;
    setInstallments(buildInstallments(nextCount, registerTotal, paymentState.dueDate || toIsoDate(new Date())));
  };

  const updateInstallment = (id: string, field: 'dueDate' | 'amount', value: string) => {
    setInstallments((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleSaveEdit = async () => {
    if (!editTarget || isCancelled) return;
    const amountValue = parseMoney(editAmount);
    if (!amountValue) {
      setToast('Informe o valor da parcela');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/finance/receivables/${editTarget.id}`, {
        method: 'PATCH',
        headers: buildMutationHeaders(),
        body: JSON.stringify({
          amount: amountValue,
          dueDate: editDueDate,
          method: editMethod || undefined
        })
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setToast(payload?.message || 'Erro ao atualizar parcela');
        return;
      }
      const payload = (await res.json()) as { data?: ReceivableDetail };
      if (payload.data) {
        const updatedReceivables = detail
          ? detail.receivables.map((item) => (item.id === payload.data?.id ? { ...item, ...payload.data } : item))
          : [];
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                receivables: updatedReceivables
              }
            : prev
        );
        notifyUpdate({ receivables: updatedReceivables });
      }
      setEditOpen(false);
      setEditTarget(null);
      setToast('Parcela atualizada');
      router.refresh();
    } catch {
      setToast('Erro ao atualizar parcela');
    }
  };

  const handleRemove = async () => {
    if (!removeTarget || isCancelled) return;
    try {
      const res = await fetch(`${API_BASE}/finance/receivables/${removeTarget.id}`, {
        method: 'DELETE',
        headers: buildMutationHeaders()
      });
      if (!res.ok && res.status !== 204) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setToast(payload?.message || 'Erro ao remover parcela');
        return;
      }
      const updatedReceivables = detail
        ? detail.receivables.filter((item) => item.id !== removeTarget.id)
        : [];
      setDetail((prev) => (prev ? { ...prev, receivables: updatedReceivables } : prev));
      setRemoveOpen(false);
      setRemoveTarget(null);
      setToast('Parcela removida');
      router.refresh();
      notifyUpdate({ receivables: updatedReceivables });
    } catch {
      setToast('Erro ao remover parcela');
    }
  };

  const handleSettleReceivable = async () => {
    if (!settleTarget || isCancelled) return;
    try {
      const res = await fetch(`${API_BASE}/finance/receivables/${settleTarget.id}/settle`, {
        method: 'POST',
        headers: buildMutationHeaders(),
        body: JSON.stringify({
          amount: toNumber(settleTarget.amount),
          settledAt: settleDate ? `${settleDate}T00:00:00` : new Date().toISOString()
        })
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setToast(payload?.message || 'Erro ao marcar parcela como paga');
        return;
      }
      const updatedReceivables = detail
        ? detail.receivables.map((item) =>
            item.id === settleTarget.id ? { ...item, status: 'paid', settled_at: settleDate } : item
          )
        : [];
      setDetail((prev) => (prev ? { ...prev, receivables: updatedReceivables } : prev));
      setSettleOpen(false);
      setSettleTarget(null);
      setToast('Parcela marcada como paga');
      router.refresh();
      notifyUpdate({ receivables: updatedReceivables });
    } catch {
      setToast('Erro ao marcar parcela como paga');
    }
  };

  const handleUnsettleReceivable = async () => {
    if (!unsettleTarget || isCancelled) return;
    try {
      const res = await fetch(`${API_BASE}/finance/receivables/${unsettleTarget.id}/unsettle`, {
        method: 'POST',
        headers: buildMutationHeaders()
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setToast(payload?.message || 'Erro ao marcar parcela como nao paga');
        return;
      }
      const updatedReceivables = detail
        ? detail.receivables.map((item) =>
            item.id === unsettleTarget.id ? { ...item, status: 'pending', settled_at: null } : item
          )
        : [];
      setDetail((prev) => (prev ? { ...prev, receivables: updatedReceivables } : prev));
      setUnsettleOpen(false);
      setUnsettleTarget(null);
      setToast('Parcela marcada como nao paga');
      router.refresh();
      notifyUpdate({ receivables: updatedReceivables });
    } catch {
      setToast('Erro ao marcar parcela como nao paga');
    }
  };

  const handleUpdateStatus = async (nextStatus: SaleDetail['status']) => {
    if (!sale || nextStatus === deliveryStatus) return;
    setStatusUpdating(true);
    try {
      const res = await fetch(`${API_BASE}/sales/orders/${sale.id}/status`, {
        method: 'PATCH',
        headers: buildMutationHeaders(),
        body: JSON.stringify({ status: nextStatus })
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setToast(payload?.message || 'Erro ao atualizar status');
        return;
      }
      setDeliveryStatus(nextStatus);
      setDetail((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      setToast('Status atualizado');
      router.refresh();
      notifyUpdate({ status: nextStatus });
    } catch {
      setToast('Erro ao atualizar status');
    } finally {
      setStatusUpdating(false);
    }
  };

  const openReceiptPrintFallback = ({
    node,
    title,
    targetWindow
  }: {
    node: HTMLElement;
    title: string;
    targetWindow?: Window | null;
  }) => {
    if (typeof window === 'undefined') return false;

    const popup = targetWindow && !targetWindow.closed ? targetWindow : window.open('', '_blank');
    if (!popup) return false;
    const isThermal = node.classList.contains('receipt-thermal');
    const printRootClass = isThermal ? 'receipt-body receipt-body-thermal' : 'receipt-body receipt-body-digital';

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((styleNode) => styleNode.outerHTML)
      .join('\n');

    popup.document.open();
    popup.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
    ${styles}
    <style>
      body { margin: 0; padding: 16px; background: #ffffff; color: #0f172a; }
      .receipt-body-digital { max-width: 980px; margin: 0 auto; }
      .receipt-body-thermal { margin: 0 auto; }
      .receipt-thermal { background: #ffffff !important; border-color: #e2e8f0 !important; color: #0f172a !important; }
      .receipt-thermal pre { color: #0f172a !important; background: transparent !important; }
    </style>
  </head>
  <body>
    <div id="print-root" class="${printRootClass}">
      ${node.outerHTML}
    </div>
  </body>
</html>`);
    popup.document.close();
    window.setTimeout(() => popup.print(), 350);
    return true;
  };

  const handleDownloadReceipt = async () => {
    if (!sale) return;
    const node =
      receiptTab === 'digital'
        ? digitalReceiptRef.current?.querySelector<HTMLElement>('.receipt-card-group') ?? digitalReceiptRef.current
        : thermalReceiptRef.current?.querySelector<HTMLElement>('.receipt-thermal') ?? thermalReceiptRef.current;
    if (!node) {
      setToast('Extrato indisponivel para download');
      return;
    }
    const filename = `venda-${sale.id}-${receiptTab}.pdf`;
    const format = receiptTab === 'digital' ? 'a4' : thermalFormat;
    const iosTargetWindow = prepareIosDownloadWindow();

    try {
      await downloadPdf({ element: node, filename, format, iosTargetWindow });
      setToast('PDF gerado');
    } catch {
      const fallbackOpened = openReceiptPrintFallback({
        node,
        title: `Extrato da venda #${sale.id}`,
        targetWindow: iosTargetWindow
      });
      if (!fallbackOpened) {
        closeDownloadWindow(iosTargetWindow);
      }
      setToast(
        fallbackOpened
          ? 'Nao foi possivel gerar o PDF automaticamente. Use Imprimir/Compartilhar para salvar.'
          : 'Erro ao gerar PDF'
      );
    }
  };

  const handlePrintReceipt = async () => {
    if (!sale || typeof window === 'undefined') return;
    const node =
      receiptTab === 'digital'
        ? digitalReceiptRef.current?.querySelector<HTMLElement>('.receipt-card-group') ?? digitalReceiptRef.current
        : thermalReceiptRef.current?.querySelector<HTMLElement>('.receipt-thermal') ?? thermalReceiptRef.current;
    const printRoot = receiptTab === 'digital' ? digitalReceiptRef.current : thermalReceiptRef.current;
    if (!node || !printRoot) {
      setToast('Extrato indisponivel para impressao');
      return;
    }

    if (isMobileWeb()) {
      const opened = openReceiptPrintFallback({
        node,
        title: `Extrato da venda #${sale.id}`
      });
      setToast(opened ? 'Extrato aberto para impressao' : 'Erro ao imprimir extrato');
      return;
    }

    try {
      await printHtml({
        html: printRoot.outerHTML,
        title: `Extrato da venda ${sale.id}`,
        styles: `
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
          }
          body {
            color: #0f172a;
          }
        `,
        pageStyle:
          receiptTab === 'digital'
            ? `
                @page { size: A4 portrait; margin: 5mm; }
                body { background: #ffffff !important; }
              `
            : `
                @page { size: ${thermalWidthMm}mm auto; margin: 0; }
                body { background: #ffffff !important; }
              `
      });
    } catch {
      const fallbackOpened = openReceiptPrintFallback({
        node,
        title: `Extrato da venda #${sale.id}`
      });
      setToast(fallbackOpened ? 'Extrato aberto para impressao' : 'Erro ao imprimir extrato');
    }
  };

  const handleUndoSale = async () => {
    if (!sale) return;
    setUndoing(true);
    try {
      const res = await fetch(`${API_BASE}/sales/orders/${sale.id}/cancel`, {
        method: 'POST',
        headers: buildMutationHeaders()
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setToast(payload?.message || 'Erro ao desfazer venda');
        return;
      }
      setUndoOpen(false);
      setToast('Venda desfeita');
      router.refresh();
      onUpdated?.({ id: sale.id, removed: true });
      onClose();
    } catch {
      setToast('Erro ao desfazer venda');
    } finally {
      setUndoing(false);
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
            <div className="avatar-circle">
              {customerPhotoUrl ? <img src={customerPhotoUrl} alt={customerName} /> : '👤'}
            </div>
            <div className="sale-header-text">
              <strong>{customerName}</strong>
              <div className="sale-header-meta">
                <span>Pagamento: {formatDate(paymentDisplayDate)}</span>
                {isCancelled ? <span className="sale-cancelled-badge">Pedido cancelado</span> : null}
              </div>
            </div>
          </div>
          <div className="sale-header-actions">
            <div className="sale-dropdown status-dropdown">
              <button
                className={`button status-button ${statusClass(deliveryStatus)}`}
                type="button"
                onClick={() => {
                  if (isCancelled) return;
                  setStatusOpen((prev) => !prev);
                }}
                disabled={isCancelled}
              >
                <span className="status-icon">
                  {deliveryStatus === 'cancelled' ? '⛔' : deliveryStatus === 'pending' ? '🚚' : '✅'}
                </span>
                {statusLabel(deliveryStatus)} ▾
              </button>
              {statusOpen && !isCancelled ? (
                <div className="sale-menu">
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdateStatus('delivered');
                      setStatusOpen(false);
                    }}
                    disabled={statusUpdating}
                  >
                    Ja entregue
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdateStatus('pending');
                      setStatusOpen(false);
                    }}
                    disabled={statusUpdating}
                  >
                    A entregar
                  </button>
                </div>
              ) : null}
            </div>
            <div className="sale-dropdown actions-dropdown">
              <button className="button ghost" type="button" onClick={() => setActionsOpen((prev) => !prev)}>
                <span className="status-icon">⚙</span>Acoes ▾
              </button>
              {actionsOpen ? (
                <div className="sale-menu">
                  {!isCancelled ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActionsOpen(false);
                        onEditSale?.(sale.id);
                      }}
                    >
                      Editar venda
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptOpen(true);
                      setActionsOpen(false);
                    }}
                  >
                    Baixar extrato
                  </button>
                  {!isCancelled ? (
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
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="sale-grid">
          <section className="sale-section sale-items-section">
            <div className="sale-section-title">
              <span className="section-icon">📦</span>
              <h4>Itens da Venda ({saleItems.length})</h4>
            </div>
            {detailLoading ? (
              <div className="meta">Carregando itens...</div>
            ) : (
              saleItems.map((item) => {
                const qty = toNumber(item.quantity);
                const price = toNumber(item.price);
                const totalItem = qty * price;
                const itemTitle = getItemTitle(item);
                const itemMetaLine = getItemMetaLine(item);
                const itemImage = getItemImage(item);
                return (
                  <div key={item.id} className="sale-item">
                    <div className="sale-thumb large">
                      {itemImage ? (
                        <img className="product-thumb-image" src={itemImage} alt={itemTitle || 'Produto'} />
                      ) : (
                        <span className="product-thumb-placeholder" aria-hidden="true">
                          <IconBox />
                        </span>
                      )}
                    </div>
                    <div className="sale-item-info">
                      <strong>{itemTitle}</strong>
                      {itemMetaLine ? <span className="muted">{itemMetaLine}</span> : null}
                      <div className="sale-item-meta">
                        <span>{qty} {qty === 1 ? 'unidade' : 'unidades'}</span>
                        <span className="muted">Total: {formatCurrency(totalItem)}</span>
                      </div>
                    </div>
                    <span className="sale-price">{formatCurrency(totalItem)}</span>
                  </div>
                );
              })
            )}
          </section>

          <section className="sale-section">
            <div className="sale-payment-header">
              <div className="sale-section-title">
                <span className="section-icon">💳</span>
                <h4>Pagamentos</h4>
              </div>
              <div className="payment-progress" />
            </div>

            {showPaymentCallout ? (
              <div className="payment-callout">
                <span>Valor pendente de registro: {formatCurrency(summary.remaining)}</span>
                <button
                  className="button primary"
                  type="button"
                  onClick={() => setMarkPaidOpen(true)}
                  disabled={isCancelled}
                >
                  + Registrar Pagamento
                </button>
              </div>
            ) : null}

            {paymentListEntries.length > 0 ? (
              <div className="payment-list">
                {paymentListEntries.map((entry) => (
                  <div key={entry.id} className={`payment-item ${entry.status}`}>
                    <div className="payment-item-header">
                      <div className="payment-item-left">
                        <span className="payment-status-icon">
                          {entry.status === 'paid' ? '✓' : '📅'}
                        </span>
                        <span className="payment-amount">{formatCurrency(entry.amount)}</span>
                      </div>
                    {entry.kind === 'receivable' && !isCancelled ? (
                      <button
                        className="button icon small"
                        type="button"
                        onClick={() =>
                          setActivePaymentMenu((prev) => (prev === entry.id ? null : entry.id))
                        }
                      >
                        ⋯
                      </button>
                    ) : null}
                    </div>
                    <div className="payment-item-meta">
                      <span className="payment-method-pill">{entry.method.toUpperCase()}</span>
                      <span className="payment-item-date">
                        {entry.status === 'paid'
                          ? `Pago em ${formatDate(entry.date)}`
                          : `Vence em ${formatDate(entry.date)}`}
                      </span>
                    </div>
                    {entry.kind === 'receivable' && !isCancelled && activePaymentMenu === entry.id ? (
                      <div className="payment-menu">
                        {entry.status !== 'paid' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setActivePaymentMenu(null);
                              const target = receivables.find((item) => item.id === entry.id) || null;
                              if (!target) return;
                              setSettleTarget(target);
                              setSettleDate(toIsoDate(new Date()));
                              setSettleOpen(true);
                            }}
                          >
                            Marcar como paga
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActivePaymentMenu(null);
                              const target = receivables.find((item) => item.id === entry.id) || null;
                              if (!target) return;
                              setUnsettleTarget(target);
                              setUnsettleOpen(true);
                            }}
                          >
                            Marcar como nao paga
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setActivePaymentMenu(null);
                            const target = receivables.find((item) => item.id === entry.id) || null;
                            if (!target) return;
                            setEditTarget(target);
                            setEditAmount(formatCurrency(toNumber(target.amount)));
                            setEditDueDate(target.due_date);
                            setEditMethod(target.method || '');
                            setEditOpen(true);
                          }}
                        >
                          Editar parcela
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            setActivePaymentMenu(null);
                            const target = receivables.find((item) => item.id === entry.id) || null;
                            if (!target) return;
                            setRemoveTarget(target);
                            setRemoveOpen(true);
                          }}
                        >
                          Remover parcela
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="sale-summary-card">
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
                <button
                  className="button ghost profit-button"
                  type="button"
                  onClick={() => setProfitVisible((prev) => !prev)}
                  disabled={detailLoading && !detail}
                  data-state={profitVisible ? 'shown' : 'hidden'}
                >
                  <span className="profit-value">
                    {profitVisible
                      ? detailLoading && !detail
                        ? 'Calculando...'
                        : formatCurrency(profitValue)
                      : 'Clique para ver'}
                  </span>
                </button>
                </div>
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

            <div className="receipt-panel">
              {receiptTab === 'digital' ? (
                <div className="receipt-body receipt-body-digital" id="print-root" ref={digitalReceiptRef}>
                  <div className="receipt-card receipt-card-group">
                  <div className="receipt-hero">
                    <div className="receipt-header">
                      <strong>Resumo da venda</strong>
                      <div className="receipt-logo">R</div>
                    </div>
                    <div className="receipt-meta">
                      <span>Emitido em {formatDate(sale.date)}</span>
                      <span>às {formatTime(sale.date)} no Revendis Web</span>
                    </div>
                  </div>

                    <div className="receipt-grid">
                      <div>
                        <span className="receipt-grid-label">Cliente</span>
                        <strong>{sale.customer}</strong>
                      </div>
                      <div>
                        <span className="receipt-grid-label">Data do pagamento</span>
                        <strong>{formatDate(paymentDisplayDate)}</strong>
                      </div>
                      <div>
                        <span className="receipt-grid-label">Valor total</span>
                        <strong>{formatCurrency(summary.total)}</strong>
                      </div>
                      <div>
                        <span className="receipt-grid-label">Situação da entrega</span>
                        <span className={`receipt-status-pill ${statusClass(deliveryStatus)}`}>
                          <span className="receipt-status-dot" />
                          {statusLabel(deliveryStatus)}
                        </span>
                      </div>
                    </div>

                    <div className="receipt-products receipt-section">
                      <h3>Produtos</h3>
                      {saleItems.length === 0 ? (
                        <span className="muted">Nenhum produto na venda.</span>
                      ) : (
                        saleItems.map((item) => {
                          const qty = toNumber(item.quantity);
                          const price = toNumber(item.price);
                          const totalItem = qty * price;
                          const title = getItemTitle(item);
                          return (
                            <div key={item.id} className="receipt-product-row">
                              <span className="receipt-qty-badge">{qty}</span>
                              <div className="receipt-payment-meta">
                                <strong>{title}</strong>
                                <span>{qty} {qty === 1 ? 'unidade' : 'unidades'}</span>
                              </div>
                              <strong className="receipt-installment-amount">
                                {formatCurrency(totalItem)}
                              </strong>
                            </div>
                          );
                        })
                    )}
                  </div>

                  <div className="receipt-payment-header">
                    <strong>Pagamento</strong>
                    <span className={`receipt-pill ${receiptPaymentStatusClass}`}>{receiptPaymentStatus}</span>
                  </div>
                  <div className="receipt-summary receipt-summary-table">
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
                  <div className="receipt-print-footer" aria-hidden="true">
                    <span>{formatDate(sale.date)}, {formatTime(sale.date)}</span>
                    <span>Fatura de Venda</span>
                  </div>
                </div>
              ) : (
                <div
                  className="receipt-body receipt-body-thermal"
                  id="print-root"
                  ref={thermalReceiptRef}
                >
                  <div className="receipt-thermal" style={{ width: `${thermalWidthMm}mm` }}>
                    <pre>{thermalReceiptText}</pre>
                  </div>
                </div>
              )}
            </div>

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
          <div className="modal modal-payment" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Pagamento da venda</h3>
              <button className="modal-close" type="button" onClick={() => setMarkPaidOpen(false)}>
                ✕
              </button>
            </div>
            <label className="modal-field">
              <span>Valor do pagamento</span>
              <input
                className={registerError ? 'input-error' : undefined}
                value={registerAmount}
                inputMode="decimal"
                placeholder="R$ 0,00"
                onChange={(event) => {
                  setRegisterAmount(formatCurrencyInput(event.target.value));
                  if (registerError) setRegisterError(null);
                }}
              />
              {registerError ? <span className="field-error">{registerError}</span> : null}
            </label>
            <label className="modal-field">
              <span>Forma do pagamento</span>
              <div className="select-field">
                <select
                  value={registerMethod}
                  onChange={(event) => {
                    setRegisterMethod(event.target.value);
                    if (registerError) setRegisterError(null);
                  }}
                >
                  <option value="">Selecione</option>
                  {paymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
                {registerMethod ? (
                  <button
                    type="button"
                    className="select-clear"
                    onClick={() => setRegisterMethod('')}
                  >
                    ✕
                  </button>
                ) : null}
                <span className="select-arrow">▾</span>
              </div>
            </label>
            <div className="installments">
              <div className="installments-header">
                <strong>Parcelas</strong>
                <div className="installments-controls">
                  <button className="button icon small" type="button" onClick={handleDecreaseInstallments}>
                    −
                  </button>
                  <span>{installments.length || 0}</span>
                  <button className="button icon small" type="button" onClick={handleIncreaseInstallments}>
                    +
                  </button>
                </div>
              </div>
              {registerTotal > 0 ? (
                <div className="installments-list">
                  {installments.map((installment, index) => (
                    <div key={installment.id} className="installment-row">
                      <div className="installment-index">{index + 1}</div>
                      <div className="installment-fields">
                        <label>
                          <span>Vencimento</span>
                          <input
                            type="date"
                            value={installment.dueDate}
                            onChange={(event) => updateInstallment(installment.id, 'dueDate', event.target.value)}
                          />
                        </label>
                        <label>
                          <span>Valor</span>
                          <input
                            value={installment.amount}
                            inputMode="decimal"
                            placeholder="R$ 0,00"
                            onChange={(event) =>
                              updateInstallment(installment.id, 'amount', formatCurrencyInput(event.target.value))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="installments-empty">Sem parcelas pendentes.</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setMarkPaidOpen(false)}>
                Cancelar
              </button>
              <button
                className="button primary"
                type="button"
                onClick={handleRegisterPayment}
                disabled={registering || registerTotal <= 0 || Boolean(registerError)}
              >
                {registering ? 'Registrando...' : 'Registrar pagamento'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {settleOpen ? (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            event.stopPropagation();
            if (event.target !== event.currentTarget) return;
            setSettleOpen(false);
          }}
        >
          <div className="modal modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Marcar como pago</h3>
              <button className="modal-close" type="button" onClick={() => setSettleOpen(false)}>
                ✕
              </button>
            </div>
            <label className="modal-field">
              <span>Data do pagamento</span>
              <input type="date" value={settleDate} onChange={(event) => setSettleDate(event.target.value)} />
            </label>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setSettleOpen(false)}>
                Cancelar
              </button>
              <button className="button primary" type="button" onClick={handleSettleReceivable}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {unsettleOpen ? (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            event.stopPropagation();
            if (event.target !== event.currentTarget) return;
            setUnsettleOpen(false);
          }}
        >
          <div className="modal modal-small" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Marcar como nao paga</h3>
              <button className="modal-close" type="button" onClick={() => setUnsettleOpen(false)}>
                ✕
              </button>
            </div>
            <p>Tem certeza que deseja retornar esta parcela para pendente?</p>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setUnsettleOpen(false)}>
                Cancelar
              </button>
              <button className="button primary" type="button" onClick={handleUnsettleReceivable}>
                Confirmar
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
              <div className="select-field">
                <select value={editMethod} onChange={(event) => setEditMethod(event.target.value)}>
                  <option value="">Selecione</option>
                  {paymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
                {editMethod ? (
                  <button type="button" className="select-clear" onClick={() => setEditMethod('')}>
                    ✕
                  </button>
                ) : null}
                <span className="select-arrow">▾</span>
              </div>
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
            <p>A venda sera marcada como cancelada. O estoque nao sera alterado.</p>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setUndoOpen(false)}>
                Cancelar
              </button>
              <button className="button danger" type="button" onClick={handleUndoSale} disabled={undoing}>
                {undoing ? 'Desfazendo...' : 'Desfazer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
