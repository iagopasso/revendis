'use client';

import { useEffect, useMemo, useState } from 'react';
import { IconDots, IconPlus } from '../icons';
import { API_BASE, formatCurrency, toNumber } from '../lib';

type PurchaseStatus = 'pending' | 'received' | 'cancelled';

type Purchase = {
  id: string;
  supplier: string;
  status: PurchaseStatus;
  total: number | string;
  items: number | string;
  brand?: string | null;
  purchase_date: string;
  created_at: string;
};

type PurchasesPanelProps = {
  initialPurchases: Purchase[];
  availableBrands: string[];
};

type PurchaseForm = {
  supplier: string;
  brand: string;
  items: string;
  total: string;
  purchaseDate: string;
};

const statusLabel = (status: PurchaseStatus) => {
  if (status === 'received') return 'Recebido';
  if (status === 'cancelled') return 'Cancelado';
  return 'Pendente';
};

const statusBadge = (status: PurchaseStatus) => {
  if (status === 'received') return 'success';
  if (status === 'cancelled') return 'danger';
  return 'warn';
};

const toInputDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseCurrencyInput = (value: string) => {
  const sanitized = value.replace(/[^\d,.-]/g, '');
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

const createDefaultForm = (): PurchaseForm => ({
  supplier: '',
  brand: '',
  items: '',
  total: '',
  purchaseDate: toInputDate(new Date())
});

export default function PurchasesPanel({ initialPurchases, availableBrands }: PurchasesPanelProps) {
  const [purchases, setPurchases] = useState<Purchase[]>(initialPurchases);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PurchaseStatus>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<PurchaseForm>(createDefaultForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    setPurchases(initialPurchases);
  }, [initialPurchases]);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('.purchase-actions')) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const brands = useMemo(() => {
    const dynamic = purchases
      .map((purchase) => purchase.brand?.trim())
      .filter((brand): brand is string => Boolean(brand));

    return Array.from(new Set([...availableBrands, ...dynamic])).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [availableBrands, purchases]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return purchases.filter((purchase) => {
      const matchesQuery =
        !normalizedQuery ||
        purchase.id.toLowerCase().includes(normalizedQuery) ||
        purchase.supplier.toLowerCase().includes(normalizedQuery) ||
        (purchase.brand || '').toLowerCase().includes(normalizedQuery);

      const matchesStatus = statusFilter === 'all' || purchase.status === statusFilter;
      const matchesBrand =
        brandFilter === 'all' ||
        (purchase.brand || '').trim().toLowerCase() === brandFilter.trim().toLowerCase();

      return matchesQuery && matchesStatus && matchesBrand;
    });
  }, [brandFilter, purchases, query, statusFilter]);

  const closeCreate = () => {
    setCreateOpen(false);
    setFormError(null);
    setSaving(false);
  };

  const handleCreatePurchase = async () => {
    const supplier = form.supplier.trim();
    const items = Number(form.items);
    const total = parseCurrencyInput(form.total);

    if (!supplier) {
      setFormError('Informe o fornecedor.');
      return;
    }

    if (!Number.isInteger(items) || items <= 0) {
      setFormError('Informe uma quantidade de itens valida.');
      return;
    }

    if (!Number.isFinite(total) || total <= 0) {
      setFormError('Informe um valor total valido.');
      return;
    }

    if (!form.purchaseDate) {
      setFormError('Informe a data da compra.');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const res = await fetch(`${API_BASE}/purchases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier,
          items,
          total,
          brand: form.brand.trim() || undefined,
          purchaseDate: form.purchaseDate,
          status: 'pending'
        })
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setFormError(payload?.message || 'Erro ao criar compra.');
        return;
      }

      const payload = (await res.json()) as { data?: Purchase };
      if (!payload.data) {
        setFormError('Erro ao criar compra.');
        return;
      }

      setPurchases((prev) => [payload.data as Purchase, ...prev]);
      setForm(createDefaultForm());
      closeCreate();
    } catch {
      setFormError('Erro ao criar compra.');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (purchase: Purchase, status: PurchaseStatus) => {
    setActionError(null);
    setProcessingId(purchase.id);
    setMenuOpenId(null);

    try {
      const res = await fetch(`${API_BASE}/purchases/${purchase.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setActionError(payload?.message || 'Erro ao atualizar status da compra.');
        return;
      }

      setPurchases((prev) =>
        prev.map((item) => (item.id === purchase.id ? { ...item, status } : item))
      );
    } catch {
      setActionError('Erro ao atualizar status da compra.');
    } finally {
      setProcessingId(null);
    }
  };

  const removePurchase = async (purchase: Purchase) => {
    setActionError(null);
    setProcessingId(purchase.id);
    setMenuOpenId(null);

    try {
      const res = await fetch(`${API_BASE}/purchases/${purchase.id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setActionError(payload?.message || 'Erro ao excluir compra.');
        return;
      }

      setPurchases((prev) => prev.filter((item) => item.id !== purchase.id));
    } catch {
      setActionError('Erro ao excluir compra.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <section className="panel">
      <div className="toolbar">
        <div className="search">
          <span>🔍</span>
          <input
            placeholder="Buscar por numero do pedido, fornecedor ou marca"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="toolbar-group">
          <label className="select">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | PurchaseStatus)}>
              <option value="all">Todos os status</option>
              <option value="pending">Pendentes</option>
              <option value="received">Recebidos</option>
              <option value="cancelled">Cancelados</option>
            </select>
            <strong>▾</strong>
          </label>

          <label className="select">
            <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
              <option value="all">Todas as marcas</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
            <strong>▾</strong>
          </label>

          <button
            type="button"
            className="button primary"
            onClick={() => {
              setForm(createDefaultForm());
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            <IconPlus /> Nova compra
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🛒</div>
          <strong>Nenhuma compra encontrada</strong>
          <span>Adicione compras para acompanhar custos e abastecimento.</span>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setForm(createDefaultForm());
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            <IconPlus /> Nova compra
          </button>
        </div>
      ) : (
        <div className="data-list">
          <div className="data-row cols-6 header">
            <span>Compra</span>
            <span>Fornecedor</span>
            <span>Marca</span>
            <span>Status</span>
            <span>Total</span>
            <span>Data</span>
          </div>

          {filtered.map((purchase) => (
            <div key={purchase.id} className="data-row cols-6 purchase-row">
              <div>
                <strong>{purchase.id.slice(0, 8).toUpperCase()}</strong>
                <div className="meta">{toNumber(purchase.items)} itens</div>
              </div>
              <div>{purchase.supplier}</div>
              <div>{purchase.brand || '--'}</div>
              <span className={`badge ${statusBadge(purchase.status)}`}>{statusLabel(purchase.status)}</span>
              <div className="data-cell mono">{formatCurrency(toNumber(purchase.total))}</div>
              <div className="purchase-date-cell">
                <span className="mono">{new Date(`${purchase.purchase_date}T00:00:00`).toLocaleDateString('pt-BR')}</span>
                <div className="purchase-actions">
                  <button
                    type="button"
                    className={`button icon small${menuOpenId === purchase.id ? ' active' : ''}`}
                    aria-label="Acoes"
                    onClick={() => setMenuOpenId((current) => (current === purchase.id ? null : purchase.id))}
                    disabled={processingId === purchase.id}
                  >
                    <IconDots />
                  </button>

                  {menuOpenId === purchase.id ? (
                    <div className="purchase-menu">
                      <button type="button" onClick={() => updateStatus(purchase, 'pending')}>
                        Marcar pendente
                      </button>
                      <button type="button" onClick={() => updateStatus(purchase, 'received')}>
                        Marcar recebido
                      </button>
                      <button type="button" onClick={() => updateStatus(purchase, 'cancelled')}>
                        Marcar cancelado
                      </button>
                      <button type="button" className="danger" onClick={() => removePurchase(purchase)}>
                        Excluir
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {actionError ? <div className="field-error purchase-action-error">{actionError}</div> : null}

      {createOpen ? (
        <div className="modal-backdrop" onClick={closeCreate}>
          <div className="modal modal-purchase-create" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Nova compra</h3>
              <button className="modal-close" type="button" onClick={closeCreate}>
                ✕
              </button>
            </div>

            <div className="form-row">
              <label className="modal-field">
                <span>Fornecedor</span>
                <input
                  value={form.supplier}
                  onChange={(event) => setForm((prev) => ({ ...prev, supplier: event.target.value }))}
                  placeholder="Nome do fornecedor"
                />
              </label>
              <label className="modal-field">
                <span>Marca</span>
                <input
                  value={form.brand}
                  onChange={(event) => setForm((prev) => ({ ...prev, brand: event.target.value }))}
                  placeholder="Marca da compra"
                />
              </label>
            </div>

            <div className="form-row">
              <label className="modal-field">
                <span>Itens</span>
                <input
                  value={form.items}
                  onChange={(event) => setForm((prev) => ({ ...prev, items: event.target.value }))}
                  placeholder="Quantidade"
                />
              </label>
              <label className="modal-field">
                <span>Total da compra</span>
                <input
                  value={form.total}
                  onChange={(event) => setForm((prev) => ({ ...prev, total: event.target.value }))}
                  placeholder="0,00"
                />
              </label>
            </div>

            <label className="modal-field">
              <span>Data</span>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(event) => setForm((prev) => ({ ...prev, purchaseDate: event.target.value }))}
              />
            </label>

            {formError ? <div className="field-error">{formError}</div> : null}

            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={closeCreate}>
                Cancelar
              </button>
              <button className="button primary" type="button" onClick={handleCreatePurchase} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar compra'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
