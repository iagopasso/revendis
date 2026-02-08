'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../lib';

type Customer = {
  id: string;
  name: string;
  phone: string;
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

type CustomerForm = {
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

type CustomersListEditorProps = {
  customers: Customer[];
};

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

export default function CustomersListEditor({ customers }: CustomersListEditorProps) {
  const [localCustomers, setLocalCustomers] = useState<Customer[]>(customers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [additionalOpen, setAdditionalOpen] = useState(false);

  useEffect(() => {
    setLocalCustomers(customers);
  }, [customers]);

  const editingCustomer = useMemo(
    () => localCustomers.find((customer) => customer.id === editingId) || null,
    [editingId, localCustomers]
  );

  const openEditor = (customer: Customer) => {
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

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/customers/${editingCustomer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
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

  return (
    <>
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
              <button type="button" className="customer-name-button" onClick={() => openEditor(customer)}>
                <strong>{customer.name}</strong>
              </button>
              <div className="meta">Clique no nome para editar</div>
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
                    placeholder="cliente@exemplo.com"
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
