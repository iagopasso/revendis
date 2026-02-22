'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconEdit, IconTrash } from '../icons';
import { resizeImageToDataUrl } from '../image-upload';
import { API_BASE, buildMutationHeaders } from '../lib';

type Customer = {
  id: string;
  name: string;
  phone: string;
  photo_url?: string | null;
  email?: string | null;
  birth_date?: string | null;
  description?: string | null;
  cpf_cnpj?: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  tags?: string[] | null;
};

type CustomerSale = {
  id: string;
  status: string;
  total: number | string;
  created_at: string;
  items_count?: number | string;
};

type CustomerForm = {
  photoUrl: string;
  name: string;
  phone: string;
  email: string;
  birthDate: string;
  description: string;
  tagsInput: string;
  cpfCnpj: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

type ViewMode = 'table' | 'grid';

type CustomersListEditorProps = {
  customers: Customer[];
  viewMode: ViewMode;
};

const UPLOAD_IMAGE_MAX_SIZE_PX = 520;

const formatPhoneInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const formatCpfCnpjInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

const formatCepInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

const toInputDate = (value?: string | null) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createFormFromCustomer = (customer: Customer): CustomerForm => ({
  photoUrl: customer.photo_url || '',
  name: customer.name || '',
  phone: customer.phone || '',
  email: customer.email || '',
  birthDate: toInputDate(customer.birth_date),
  description: customer.description || '',
  tagsInput: (customer.tags || []).join(', '),
  cpfCnpj: customer.cpf_cnpj || '',
  cep: customer.cep || '',
  street: customer.street || '',
  number: customer.number || '',
  complement: customer.complement || '',
  neighborhood: customer.neighborhood || '',
  city: customer.city || '',
  state: (customer.state || '').toUpperCase().slice(0, 2)
});

const getInitials = (name: string) => {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!words.length) return 'CL';
  return words.map((word) => word[0]).join('').toUpperCase();
};

const toWhatsAppHref = (phone?: string | null) => {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '#';
  return `https://wa.me/${digits}`;
};

const toNumber = (value: number | string | null | undefined) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value) || 0;
  return 0;
};

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatSaleDate = (value?: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('pt-BR');
};

const saleStatusLabel = (value: string) => {
  const status = value.trim().toLowerCase();
  if (status === 'pending') return 'A entregar';
  if (status === 'delivered') return 'Entregue';
  if (status === 'cancelled') return 'Cancelada';
  return 'Confirmada';
};

export default function CustomersListEditor({ customers, viewMode }: CustomersListEditorProps) {
  const router = useRouter();
  const [localCustomers, setLocalCustomers] = useState<Customer[]>(customers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [customerSalesById, setCustomerSalesById] = useState<Record<string, CustomerSale[]>>({});
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);

  useEffect(() => {
    setLocalCustomers(customers);
  }, [customers]);

  const selectedCustomer = useMemo(
    () => localCustomers.find((customer) => customer.id === selectedId) || null,
    [selectedId, localCustomers]
  );

  const editingCustomer = useMemo(
    () => localCustomers.find((customer) => customer.id === editingId) || null,
    [editingId, localCustomers]
  );

  const selectedCustomerSales = useMemo(
    () => (selectedCustomer ? customerSalesById[selectedCustomer.id] || [] : []),
    [customerSalesById, selectedCustomer]
  );

  useEffect(() => {
    if (!selectedId) return;
    if (!selectedCustomer) {
      setSelectedId(null);
      setDetailsError(null);
      setSalesError(null);
      setSalesLoading(false);
    }
  }, [selectedCustomer, selectedId]);

  useEffect(() => {
    if (!editingId) return;
    if (!editingCustomer) {
      setEditingId(null);
      setForm(null);
      setSaving(false);
      setError(null);
      setAdditionalOpen(false);
    }
  }, [editingCustomer, editingId]);

  const openDetails = (customer: Customer) => {
    setSelectedId(customer.id);
    setDetailsError(null);
    setSalesError(null);
  };

  const closeDetails = () => {
    setSelectedId(null);
    setDeleting(false);
    setDetailsError(null);
    setSalesError(null);
    setSalesLoading(false);
  };

  const openEditor = (customer: Customer) => {
    setSelectedId(null);
    setEditingId(customer.id);
    setForm(createFormFromCustomer(customer));
    setError(null);
    setAdditionalOpen(false);
  };

  const closeEditor = () => {
    setEditingId(null);
    setForm(null);
    setSaving(false);
    setError(null);
    setAdditionalOpen(false);
  };

  const updateForm = (field: keyof CustomerForm, value: string) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    if (error) setError(null);
  };

  const handleSave = async () => {
    if (!editingCustomer || !form) return;
    const name = form.name.trim();
    const phone = form.phone.trim();
    const phoneDigits = phone.replace(/\D/g, '');
    if (!name) {
      setError('Informe o nome do cliente');
      return;
    }
    if (phoneDigits.length < 10) {
      setError('Informe um WhatsApp valido');
      return;
    }

    const tags = Array.from(
      new Set(
        form.tagsInput
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      )
    );

    const initialPhotoUrl = (editingCustomer.photo_url || '').trim();
    const nextPhotoUrl = form.photoUrl.trim();
    let photoPayload: string | undefined;
    if (nextPhotoUrl !== initialPhotoUrl) {
      photoPayload = nextPhotoUrl;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/customers/${editingCustomer.id}`, {
        method: 'PATCH',
        headers: buildMutationHeaders(),
        body: JSON.stringify({
          name,
          phone,
          photoUrl: photoPayload,
          email: form.email.trim() || undefined,
          birthDate: form.birthDate || undefined,
          description: form.description.trim() || undefined,
          cpfCnpj: form.cpfCnpj.trim() || undefined,
          cep: form.cep.trim() || undefined,
          street: form.street.trim() || undefined,
          number: form.number.trim() || undefined,
          complement: form.complement.trim() || undefined,
          neighborhood: form.neighborhood.trim() || undefined,
          city: form.city.trim() || undefined,
          state: form.state.trim().toUpperCase() || undefined,
          tags: tags.length ? tags : undefined
        })
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message || 'Erro ao atualizar cliente');
        return;
      }

      const payload = (await res.json()) as { data?: Customer };
      const updated = payload.data;
      if (!updated) {
        setError('Erro ao atualizar cliente');
        return;
      }

      setLocalCustomers((prev) =>
        prev.map((customer) => (customer.id === updated.id ? { ...customer, ...updated } : customer))
      );
      closeEditor();
    } catch {
      setError('Erro ao atualizar cliente');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedCustomer) return;
    setDeleting(true);
    setDetailsError(null);

    try {
      const res = await fetch(`${API_BASE}/customers/${selectedCustomer.id}`, {
        method: 'DELETE',
        headers: buildMutationHeaders()
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setDetailsError(payload?.message || 'Erro ao excluir cliente');
        return;
      }
      setLocalCustomers((prev) => prev.filter((customer) => customer.id !== selectedCustomer.id));
      closeDetails();
    } catch {
      setDetailsError('Erro ao excluir cliente');
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!selectedCustomer) return;
    if (customerSalesById[selectedCustomer.id]) return;

    const controller = new AbortController();

    const loadSales = async () => {
      setSalesLoading(true);
      setSalesError(null);
      try {
        const response = await fetch(`${API_BASE}/customers/${selectedCustomer.id}/sales`, {
          cache: 'no-store',
          signal: controller.signal
        });
        if (!response.ok) {
          setSalesError('Nao foi possivel carregar as vendas deste cliente.');
          return;
        }
        const payload = (await response.json().catch(() => null)) as { data?: CustomerSale[] } | null;
        if (controller.signal.aborted) return;
        setCustomerSalesById((prev) => ({
          ...prev,
          [selectedCustomer.id]: Array.isArray(payload?.data) ? payload.data : []
        }));
      } catch {
        if (!controller.signal.aborted) {
          setSalesError('Nao foi possivel carregar as vendas deste cliente.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setSalesLoading(false);
        }
      }
    };

    void loadSales();
    return () => controller.abort();
  }, [customerSalesById, selectedCustomer]);

  return (
    <>
      {viewMode === 'grid' ? (
        <div className="customers-grid-view">
          {localCustomers.map((customer) => (
            <button
              key={customer.id}
              type="button"
              className="customer-grid-card"
              onClick={() => openDetails(customer)}
            >
              <div className="customer-grid-avatar">
                {customer.photo_url ? (
                  <img src={customer.photo_url} alt={customer.name} />
                ) : (
                  getInitials(customer.name)
                )}
              </div>
              <strong>{customer.name.toUpperCase()}</strong>
              <span className="customer-grid-contact">{customer.phone || '--'}</span>
              <span className="customer-grid-location">
                {customer.city || '--'}
                {customer.state ? `/${customer.state}` : ''}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="data-list">
          <div className="data-row cols-4 header">
            <span>Cliente</span>
            <span>Contato</span>
            <span>Cidade</span>
            <span>Tags</span>
          </div>
          {localCustomers.map((customer) => (
            <div key={customer.id} className="data-row cols-4">
              <div>
                <button type="button" className="customer-name-button" onClick={() => openDetails(customer)}>
                  <strong>{customer.name}</strong>
                </button>
                <div className="meta">Clique no nome para visualizar</div>
              </div>
              <div className="data-cell">
                <div className="mono">{customer.phone || '--'}</div>
                <div className="meta">{customer.email || '--'}</div>
              </div>
              <div className="data-cell mono">
                {customer.city || '--'}
                {customer.state ? `/${customer.state}` : ''}
              </div>
              <div className="data-cell">{(customer.tags || []).join(', ') || '--'}</div>
            </div>
          ))}
        </div>
      )}

      {selectedCustomer ? (
        <div className="modal-backdrop" onClick={closeDetails}>
          <div className="modal modal-customer-profile" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close customer-profile-close" type="button" onClick={closeDetails}>
              ✕
            </button>
            <div className="customer-profile-layout">
              <aside className="customer-profile-side">
                <div className="customer-profile-avatar">
                  {selectedCustomer.photo_url ? (
                    <img src={selectedCustomer.photo_url} alt={selectedCustomer.name} />
                  ) : (
                    getInitials(selectedCustomer.name)
                  )}
                </div>
                <strong className="customer-profile-name">{selectedCustomer.name.toUpperCase()}</strong>
                <a
                  className="customer-profile-phone"
                  href={toWhatsAppHref(selectedCustomer.phone)}
                  target="_blank"
                  rel="noreferrer"
                >
                  ☏ {selectedCustomer.phone || '--'}
                </a>
                <span className="meta">
                  {(selectedCustomer.tags || []).length
                    ? `Tags: ${(selectedCustomer.tags || []).join(', ')}`
                    : 'Nenhuma tag atribuida'}
                </span>

                <div className="customer-profile-actions-row">
                  <button
                    className="button ghost customer-profile-delete"
                    type="button"
                    onClick={handleDeleteSelected}
                    disabled={deleting}
                  >
                    <IconTrash />
                    {deleting ? 'Excluindo...' : 'Excluir'}
                  </button>
                  <button className="button primary customer-profile-edit" type="button" onClick={() => openEditor(selectedCustomer)}>
                    <IconEdit /> Editar
                  </button>
                </div>
                {detailsError ? <div className="field-error">{detailsError}</div> : null}
              </aside>

              <section className="customer-profile-main">
                <div className="customer-profile-balance-card">
                  <div>
                    <span className="meta">Saldo da conta</span>
                    <strong className="customer-profile-balance-value">R$ 0,00</strong>
                  </div>
                  <span className="customer-profile-balance-icon">💼</span>
                </div>

                <div className="customer-profile-sales-section">
                  <h4>Vendas</h4>
                  {salesLoading ? (
                    <div className="customer-profile-sales-empty">Carregando vendas...</div>
                  ) : salesError ? (
                    <div className="customer-profile-sales-empty">{salesError}</div>
                  ) : selectedCustomerSales.length === 0 ? (
                    <div className="customer-profile-sales-empty">Nenhum registro</div>
                  ) : (
                    <div className="customer-profile-sales-list">
                      {selectedCustomerSales.map((sale) => {
                        const saleTotal = toNumber(sale.total);
                        const itemsCount = Math.max(0, Math.trunc(toNumber(sale.items_count)));
                        return (
                          <button
                            key={sale.id}
                            type="button"
                            className="customer-profile-sales-item"
                            onClick={() => {
                              closeDetails();
                              router.push(`/vendas?saleId=${encodeURIComponent(sale.id)}`);
                            }}
                          >
                            <div className="customer-profile-sales-item-head">
                              <strong>Venda #{sale.id.slice(0, 6)}</strong>
                              <span className="customer-profile-sales-item-value">{formatCurrency(saleTotal)}</span>
                            </div>
                            <div className="customer-profile-sales-item-meta">
                              <span>{saleStatusLabel(sale.status)}</span>
                              <span>{itemsCount} {itemsCount === 1 ? 'item' : 'itens'}</span>
                              <span>{formatSaleDate(sale.created_at)}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {editingCustomer && form ? (
        <div className="modal-backdrop" onClick={closeEditor}>
          <div className="modal modal-customer-edit" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Editar cliente</h3>
              <button className="modal-close" type="button" onClick={closeEditor}>
                ✕
              </button>
            </div>

            <div className="customer-edit-grid">
              <div className="customer-edit-photo-section">
                <span className="customer-field-title">Foto do cliente</span>
                <div className="customer-photo-card">
                  <div className="customer-photo-preview">
                    {form.photoUrl ? (
                      <img src={form.photoUrl} alt={form.name || editingCustomer.name} />
                    ) : (
                      <span>{getInitials(form.name || editingCustomer.name)}</span>
                    )}
                  </div>
                  <label className="customer-upload-button">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (event) => {
                        const input = event.currentTarget;
                        const file = input.files?.[0];
                        if (!file) return;
                        try {
                          const resized = await resizeImageToDataUrl(file, {
                            maxSize: UPLOAD_IMAGE_MAX_SIZE_PX
                          });
                          updateForm('photoUrl', resized);
                          setError(null);
                        } catch {
                          setError('Nao foi possivel carregar a imagem do cliente');
                        } finally {
                          input.value = '';
                        }
                      }}
                    />
                    <span>⤴ Carregar</span>
                  </label>
                  {form.photoUrl ? (
                    <button
                      className="button ghost small customer-edit-photo-remove"
                      type="button"
                      onClick={() => updateForm('photoUrl', '')}
                    >
                      Remover foto
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="form-row">
                <label className="modal-field">
                  <span>Nome</span>
                  <input value={form.name} onChange={(event) => updateForm('name', event.target.value)} />
                </label>
                <label className="modal-field">
                  <span>WhatsApp</span>
                  <input
                    value={form.phone}
                    placeholder="(00) 00000-0000"
                    onChange={(event) => updateForm('phone', formatPhoneInput(event.target.value))}
                  />
                </label>
              </div>

              <div className="form-row">
                <label className="modal-field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={form.email}
                    placeholder="Email do cliente"
                    onChange={(event) => updateForm('email', event.target.value)}
                  />
                </label>
                <label className="modal-field">
                  <span>Nascimento</span>
                  <input
                    type="date"
                    value={form.birthDate}
                    onChange={(event) => updateForm('birthDate', event.target.value)}
                  />
                </label>
              </div>

              <label className="modal-field">
                <span>Descricao</span>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(event) => updateForm('description', event.target.value)}
                />
              </label>

              <label className="modal-field">
                <span>Tags</span>
                <input
                  value={form.tagsInput}
                  placeholder="Ex.: VIP, Frequente, Recompra"
                  onChange={(event) => updateForm('tagsInput', event.target.value)}
                />
                <small className="customer-edit-tags-hint">Separe multiplas tags com virgula.</small>
              </label>
            </div>

            <section className={`customer-extra${additionalOpen ? ' open' : ''}`}>
              <button
                type="button"
                className="customer-extra-toggle"
                onClick={() => setAdditionalOpen((prev) => !prev)}
              >
                <span>Informacoes adicionais</span>
                <strong>{additionalOpen ? '⌃' : '⌄'}</strong>
              </button>
              <div className={`customer-extra-content${additionalOpen ? ' open' : ''}`}>
                <label className="modal-field">
                  <span>CPF/CNPJ</span>
                  <input
                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                    value={form.cpfCnpj}
                    onChange={(event) => updateForm('cpfCnpj', formatCpfCnpjInput(event.target.value))}
                  />
                </label>

                <div className="customer-extra-title">ENDERECO</div>

                <label className="modal-field">
                  <span>CEP</span>
                  <input
                    placeholder="00000-000"
                    value={form.cep}
                    onChange={(event) => updateForm('cep', formatCepInput(event.target.value))}
                  />
                </label>

                <div className="form-row">
                  <label className="modal-field">
                    <span>Rua</span>
                    <input
                      placeholder="Nome da rua"
                      value={form.street}
                      onChange={(event) => updateForm('street', event.target.value)}
                    />
                  </label>
                  <label className="modal-field">
                    <span>Numero</span>
                    <input
                      placeholder="123"
                      value={form.number}
                      onChange={(event) => updateForm('number', event.target.value)}
                    />
                  </label>
                </div>

                <label className="modal-field">
                  <span>Complemento</span>
                  <input
                    placeholder="Apto, bloco, etc."
                    value={form.complement}
                    onChange={(event) => updateForm('complement', event.target.value)}
                  />
                </label>

                <label className="modal-field">
                  <span>Bairro</span>
                  <input
                    placeholder="Nome do bairro"
                    value={form.neighborhood}
                    onChange={(event) => updateForm('neighborhood', event.target.value)}
                  />
                </label>

                <div className="form-row">
                  <label className="modal-field">
                    <span>Cidade</span>
                    <input
                      placeholder="Nome da cidade"
                      value={form.city}
                      onChange={(event) => updateForm('city', event.target.value)}
                    />
                  </label>
                  <label className="modal-field">
                    <span>Estado</span>
                    <input
                      placeholder="UF"
                      value={form.state}
                      maxLength={2}
                      onChange={(event) => updateForm('state', event.target.value.toUpperCase())}
                    />
                  </label>
                </div>
              </div>
            </section>

            {error ? <div className="field-error">{error}</div> : null}

            <div className="modal-footer customer-edit-footer">
              <button className="button ghost" type="button" onClick={closeEditor}>
                Cancelar
              </button>
              <button className="button primary" type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </>
  );
}
