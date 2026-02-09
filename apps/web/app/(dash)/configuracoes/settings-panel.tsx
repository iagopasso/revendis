'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  IconCalendar,
  IconDiamond,
  IconDollar,
  IconEdit,
  IconLock,
  IconPlus,
  IconStar,
  IconTrash,
  IconUpload,
  IconUser
} from '../icons';
import { API_BASE, toNumber } from '../lib';

type BrandSource = 'existing' | 'catalog' | 'manual';
type SubscriptionStatus = 'active' | 'trial' | 'overdue' | 'canceled';
type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

type ResellerBrand = {
  id: string;
  name: string;
  source: BrandSource;
  source_brand?: string | null;
  profitability?: number | string;
  logo_url?: string | null;
  created_at?: string;
};

type AccountSettings = {
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  businessName?: string;
};

type SubscriptionSettings = {
  plan?: string;
  status?: string;
  renewalDate?: string;
  monthlyPrice?: number | string;
};

type PixSettings = {
  keyType?: string;
  keyValue?: string;
  holderName?: string;
};

type AlertSettings = {
  enabled?: boolean;
  daysBeforeDue?: number | string;
};

type AccessMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  created_at?: string;
};

type SettingsPanelProps = {
  initialSection: string;
  initialBrands: ResellerBrand[];
  existingBrandOptions: string[];
  catalogBrandOptions: string[];
  initialAccount: AccountSettings;
  initialSubscription: SubscriptionSettings;
  initialPix: PixSettings;
  initialAlerts: AlertSettings;
  initialAccessMembers: AccessMember[];
};

type SettingsSection = 'conta' | 'assinatura' | 'marcas' | 'pix' | 'alerta' | 'acessos';

type AccountForm = {
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  businessName: string;
};

type SubscriptionForm = {
  plan: string;
  status: SubscriptionStatus;
  renewalDate: string;
  monthlyPrice: string;
};

type PixForm = {
  keyType: PixKeyType | '';
  keyValue: string;
  holderName: string;
};

type AlertForm = {
  enabled: boolean;
  daysBeforeDue: string;
};

type AccessForm = {
  name: string;
  email: string;
  role: string;
  active: boolean;
};

const sectionOptions: Array<{
  id: SettingsSection;
  label: string;
  icon: typeof IconUser;
}> = [
  { id: 'conta', label: 'Editar conta', icon: IconUser },
  { id: 'assinatura', label: 'Minha assinatura', icon: IconDollar },
  { id: 'marcas', label: 'Gerenciar marcas', icon: IconStar },
  { id: 'pix', label: 'Chave Pix', icon: IconDiamond },
  { id: 'alerta', label: 'Alerta de vencimento', icon: IconCalendar },
  { id: 'acessos', label: 'Gerenciar acessos', icon: IconLock }
];

const sectionTitle: Record<SettingsSection, string> = {
  conta: 'Editar conta',
  assinatura: 'Minha assinatura',
  marcas: 'Configurar marcas revendidas',
  pix: 'Chave Pix',
  alerta: 'Alerta de vencimento',
  acessos: 'Gerenciar acessos'
};

const sectionDescription: Record<SettingsSection, string> = {
  conta: 'Atualize dados basicos da conta e informacoes do negocio.',
  assinatura: 'Gerencie plano, status e renovacao da assinatura.',
  marcas: 'Adicione as marcas que voce revende para seus clientes.',
  pix: 'Configure as chaves para recebimentos e conciliacao.',
  alerta: 'Defina alertas de vencimento para recebiveis pendentes.',
  acessos: 'Controle membros da equipe e niveis de permissao.'
};

const sourceLabel: Record<BrandSource, string> = {
  existing: 'Marca existente',
  catalog: 'Marca do catalogo',
  manual: 'Manual'
};

const statusLabel: Record<SubscriptionStatus, string> = {
  active: 'Ativa',
  trial: 'Teste',
  overdue: 'Em atraso',
  canceled: 'Cancelada'
};

const roleOptions = [
  { value: 'owner', label: 'Proprietario' },
  { value: 'manager', label: 'Gestor' },
  { value: 'seller', label: 'Vendedor' },
  { value: 'finance', label: 'Financeiro' },
  { value: 'viewer', label: 'Leitura' }
] as const;

const isSection = (value: string): value is SettingsSection =>
  sectionOptions.some((option) => option.id === value);

const isSubscriptionStatus = (value?: string): value is SubscriptionStatus =>
  value === 'active' || value === 'trial' || value === 'overdue' || value === 'canceled';

const isPixKeyType = (value?: string): value is PixKeyType =>
  value === 'cpf' || value === 'cnpj' || value === 'email' || value === 'phone' || value === 'random';

const parseProfitability = (value: string) => {
  const normalized = value.replace('%', '').replace(',', '.').trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
};

const formatProfitability = (value?: number | string) => {
  const parsed = toNumber(value);
  return parsed.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(parsed) ? 0 : 2,
    maximumFractionDigits: 2
  });
};

const formatCurrencyInput = (value?: number | string) => {
  const parsed = toNumber(value);
  return parsed.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const parseCurrencyInput = (value: string) => {
  const normalized = value
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
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

const normalizeApiMessage = (value: unknown, fallback: string) => {
  if (
    value &&
    typeof value === 'object' &&
    'message' in value &&
    typeof (value as { message?: unknown }).message === 'string'
  ) {
    return (value as { message: string }).message;
  }
  return fallback;
};

const roleLabel = (role: string) => {
  const normalized = role.trim().toLowerCase();
  return roleOptions.find((item) => item.value === normalized)?.label || role;
};

const formatMemberDate = (value?: string) => {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleDateString('pt-BR');
};

const uniqueBrands = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

const toAccountForm = (value: AccountSettings): AccountForm => ({
  ownerName: value.ownerName || '',
  ownerEmail: value.ownerEmail || '',
  ownerPhone: value.ownerPhone || '',
  businessName: value.businessName || ''
});

const toSubscriptionForm = (value: SubscriptionSettings): SubscriptionForm => ({
  plan: value.plan || 'Essencial',
  status: isSubscriptionStatus(value.status) ? value.status : 'active',
  renewalDate: value.renewalDate || '',
  monthlyPrice: formatCurrencyInput(value.monthlyPrice)
});

const toPixForm = (value: PixSettings): PixForm => ({
  keyType: isPixKeyType(value.keyType) ? value.keyType : '',
  keyValue: value.keyValue || '',
  holderName: value.holderName || ''
});

const toAlertForm = (value: AlertSettings): AlertForm => ({
  enabled: value.enabled ?? true,
  daysBeforeDue: String(Math.max(0, Math.min(60, Number(value.daysBeforeDue ?? 3) || 0)))
});

const defaultAccessForm: AccessForm = {
  name: '',
  email: '',
  role: 'seller',
  active: true
};

export default function SettingsPanel({
  initialSection,
  initialBrands,
  existingBrandOptions,
  catalogBrandOptions,
  initialAccount,
  initialSubscription,
  initialPix,
  initialAlerts,
  initialAccessMembers
}: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    isSection(initialSection) ? initialSection : 'marcas'
  );
  const [brands, setBrands] = useState<ResellerBrand[]>(initialBrands);
  const existingCreateOptions = useMemo(
    () => uniqueBrands([...existingBrandOptions, ...brands.map((brand) => brand.name)]),
    [existingBrandOptions, brands]
  );
  const catalogCreateOptions = useMemo(
    () => uniqueBrands([...catalogBrandOptions, ...brands.map((brand) => brand.name)]),
    [catalogBrandOptions, brands]
  );
  const [toast, setToast] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<BrandSource>(
    existingCreateOptions.length > 0 ? 'existing' : catalogCreateOptions.length > 0 ? 'catalog' : 'manual'
  );
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedExistingBrand, setSelectedExistingBrand] = useState(existingCreateOptions[0] || '');
  const [selectedCatalogBrand, setSelectedCatalogBrand] = useState(catalogCreateOptions[0] || '');
  const [manualName, setManualName] = useState('');
  const [manualProfitability, setManualProfitability] = useState('');
  const [manualLogoUrl, setManualLogoUrl] = useState('');

  const [accountForm, setAccountForm] = useState<AccountForm>(toAccountForm(initialAccount));
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const [subscriptionForm, setSubscriptionForm] = useState<SubscriptionForm>(
    toSubscriptionForm(initialSubscription)
  );
  const [subscriptionSaving, setSubscriptionSaving] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  const [pixForm, setPixForm] = useState<PixForm>(toPixForm(initialPix));
  const [pixSaving, setPixSaving] = useState(false);
  const [pixError, setPixError] = useState<string | null>(null);

  const [alertsForm, setAlertsForm] = useState<AlertForm>(toAlertForm(initialAlerts));
  const [alertsSaving, setAlertsSaving] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  const [members, setMembers] = useState<AccessMember[]>(initialAccessMembers);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberModalMode, setMemberModalMode] = useState<'create' | 'edit'>('create');
  const [memberEditingId, setMemberEditingId] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState<AccessForm>(defaultAccessForm);
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberToggleLoadingId, setMemberToggleLoadingId] = useState<string | null>(null);

  useEffect(() => {
    setActiveSection(isSection(initialSection) ? initialSection : 'marcas');
  }, [initialSection]);

  useEffect(() => {
    setBrands(initialBrands);
  }, [initialBrands]);

  useEffect(() => {
    setAccountForm(toAccountForm(initialAccount));
  }, [initialAccount]);

  useEffect(() => {
    setSubscriptionForm(toSubscriptionForm(initialSubscription));
  }, [initialSubscription]);

  useEffect(() => {
    setPixForm(toPixForm(initialPix));
  }, [initialPix]);

  useEffect(() => {
    setAlertsForm(toAlertForm(initialAlerts));
  }, [initialAlerts]);

  useEffect(() => {
    setMembers(initialAccessMembers);
  }, [initialAccessMembers]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (createMode !== 'existing' || selectedExistingBrand) return;
    setSelectedExistingBrand(existingCreateOptions[0] || '');
  }, [createMode, selectedExistingBrand, existingCreateOptions]);

  useEffect(() => {
    if (createMode !== 'catalog' || selectedCatalogBrand) return;
    setSelectedCatalogBrand(catalogCreateOptions[0] || '');
  }, [createMode, selectedCatalogBrand, catalogCreateOptions]);

  const nextBrandName = useMemo(() => {
    if (createMode === 'existing') return selectedExistingBrand.trim();
    if (createMode === 'catalog') return selectedCatalogBrand.trim();
    return manualName.trim();
  }, [createMode, selectedExistingBrand, selectedCatalogBrand, manualName]);

  const resetCreateForm = () => {
    if (manualLogoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(manualLogoUrl);
    }
    setCreateMode(
      existingCreateOptions.length > 0 ? 'existing' : catalogCreateOptions.length > 0 ? 'catalog' : 'manual'
    );
    setCreateError(null);
    setCreateSaving(false);
    setSelectedExistingBrand(existingCreateOptions[0] || '');
    setSelectedCatalogBrand(catalogCreateOptions[0] || '');
    setManualName('');
    setManualProfitability('');
    setManualLogoUrl('');
  };

  const closeCreateModal = () => {
    setCreateOpen(false);
    resetCreateForm();
  };

  const openCreateModal = () => {
    setCreateOpen(true);
    setCreateError(null);
  };

  const handleCreateBrand = async () => {
    const name = nextBrandName;
    if (!name) {
      setCreateError('Selecione ou informe o nome da marca.');
      return;
    }

    const profitability = parseProfitability(manualProfitability);

    setCreateSaving(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API_BASE}/settings/brands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          source: createMode,
          sourceBrand:
            createMode === 'existing'
              ? selectedExistingBrand || undefined
              : createMode === 'catalog'
                ? selectedCatalogBrand || undefined
                : undefined,
          profitability,
          logoUrl: createMode === 'manual' ? manualLogoUrl || undefined : undefined
        })
      });

      const payload = (await res.json().catch(() => null)) as { data?: ResellerBrand; message?: string } | null;

      if (!res.ok || !payload?.data) {
        setCreateError(normalizeApiMessage(payload, 'Erro ao adicionar marca.'));
        return;
      }

      const brand = payload.data;
      setBrands((prev) => [brand, ...prev.filter((item) => item.id !== brand.id)]);
      closeCreateModal();
      setToast('Marca adicionada');
    } catch {
      setCreateError('Erro ao adicionar marca.');
    } finally {
      setCreateSaving(false);
    }
  };

  const handleDeleteBrand = async (brandId: string) => {
    try {
      const res = await fetch(`${API_BASE}/settings/brands/${brandId}`, { method: 'DELETE' });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setToast(normalizeApiMessage(payload, 'Erro ao remover marca'));
        return;
      }
      setBrands((prev) => prev.filter((brand) => brand.id !== brandId));
      setToast('Marca removida');
    } catch {
      setToast('Erro ao remover marca');
    }
  };

  const handleSaveAccount = async () => {
    const ownerName = accountForm.ownerName.trim();
    const ownerEmail = accountForm.ownerEmail.trim();
    const ownerPhone = accountForm.ownerPhone.trim();
    const businessName = accountForm.businessName.trim();

    if (!ownerName && !ownerEmail && !ownerPhone && !businessName) {
      setAccountError('Preencha ao menos um campo.');
      return;
    }

    const payload: Record<string, string> = {};
    if (ownerName) payload.ownerName = ownerName;
    if (ownerEmail) payload.ownerEmail = ownerEmail;
    if (ownerPhone) payload.ownerPhone = ownerPhone;
    if (businessName) payload.businessName = businessName;

    setAccountSaving(true);
    setAccountError(null);

    try {
      const res = await fetch(`${API_BASE}/settings/account`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = (await res.json().catch(() => null)) as { data?: AccountSettings; message?: string } | null;

      if (!res.ok || !body?.data) {
        setAccountError(normalizeApiMessage(body, 'Erro ao atualizar conta.'));
        return;
      }

      setAccountForm(toAccountForm(body.data));
      setToast('Conta atualizada');
    } catch {
      setAccountError('Erro ao atualizar conta.');
    } finally {
      setAccountSaving(false);
    }
  };

  const handleSaveSubscription = async () => {
    const plan = subscriptionForm.plan.trim();
    if (!plan) {
      setSubscriptionError('Informe o plano da assinatura.');
      return;
    }

    setSubscriptionSaving(true);
    setSubscriptionError(null);

    try {
      const res = await fetch(`${API_BASE}/settings/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          status: subscriptionForm.status,
          renewalDate: subscriptionForm.renewalDate || undefined,
          monthlyPrice: parseCurrencyInput(subscriptionForm.monthlyPrice)
        })
      });
      const body = (await res.json().catch(() => null)) as { data?: SubscriptionSettings; message?: string } | null;

      if (!res.ok || !body?.data) {
        setSubscriptionError(normalizeApiMessage(body, 'Erro ao atualizar assinatura.'));
        return;
      }

      setSubscriptionForm(toSubscriptionForm(body.data));
      setToast('Assinatura atualizada');
    } catch {
      setSubscriptionError('Erro ao atualizar assinatura.');
    } finally {
      setSubscriptionSaving(false);
    }
  };

  const handleSavePix = async () => {
    const keyValue = pixForm.keyValue.trim();
    const holderName = pixForm.holderName.trim();

    if (pixForm.keyType && !keyValue) {
      setPixError('Informe a chave Pix para o tipo selecionado.');
      return;
    }

    if (!pixForm.keyType && !keyValue && !holderName) {
      setPixError('Preencha ao menos um campo.');
      return;
    }

    setPixSaving(true);
    setPixError(null);

    try {
      const res = await fetch(`${API_BASE}/settings/pix`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyType: pixForm.keyType || undefined,
          keyValue: keyValue || undefined,
          holderName: holderName || undefined
        })
      });
      const body = (await res.json().catch(() => null)) as { data?: PixSettings; message?: string } | null;

      if (!res.ok || !body?.data) {
        setPixError(normalizeApiMessage(body, 'Erro ao salvar chave Pix.'));
        return;
      }

      setPixForm(toPixForm(body.data));
      setToast('Chave Pix atualizada');
    } catch {
      setPixError('Erro ao salvar chave Pix.');
    } finally {
      setPixSaving(false);
    }
  };

  const handleSaveAlerts = async () => {
    const days = Math.max(0, Math.min(60, Number(alertsForm.daysBeforeDue.replace(/\D/g, '')) || 0));

    setAlertsSaving(true);
    setAlertsError(null);

    try {
      const res = await fetch(`${API_BASE}/settings/alerts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: alertsForm.enabled,
          daysBeforeDue: days
        })
      });
      const body = (await res.json().catch(() => null)) as { data?: AlertSettings; message?: string } | null;

      if (!res.ok || !body?.data) {
        setAlertsError(normalizeApiMessage(body, 'Erro ao atualizar alerta.'));
        return;
      }

      setAlertsForm(toAlertForm(body.data));
      setToast('Alertas atualizados');
    } catch {
      setAlertsError('Erro ao atualizar alerta.');
    } finally {
      setAlertsSaving(false);
    }
  };

  const openCreateMember = () => {
    setMemberModalMode('create');
    setMemberEditingId(null);
    setMemberForm(defaultAccessForm);
    setMemberError(null);
    setMemberSaving(false);
    setMemberModalOpen(true);
  };

  const openEditMember = (member: AccessMember) => {
    setMemberModalMode('edit');
    setMemberEditingId(member.id);
    setMemberForm({
      name: member.name,
      email: member.email,
      role: member.role || 'seller',
      active: member.active
    });
    setMemberError(null);
    setMemberSaving(false);
    setMemberModalOpen(true);
  };

  const closeMemberModal = () => {
    setMemberModalOpen(false);
    setMemberEditingId(null);
    setMemberError(null);
    setMemberSaving(false);
  };

  const handleSubmitMember = async () => {
    const name = memberForm.name.trim();
    const email = memberForm.email.trim().toLowerCase();
    const role = memberForm.role.trim().toLowerCase() || 'seller';

    if (!name) {
      setMemberError('Informe o nome do membro.');
      return;
    }

    if (!email) {
      setMemberError('Informe um email valido.');
      return;
    }

    setMemberSaving(true);
    setMemberError(null);

    try {
      const endpoint =
        memberModalMode === 'create'
          ? `${API_BASE}/settings/access`
          : `${API_BASE}/settings/access/${memberEditingId}`;
      const method = memberModalMode === 'create' ? 'POST' : 'PATCH';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          role,
          active: memberForm.active
        })
      });

      const body = (await res.json().catch(() => null)) as { data?: AccessMember; message?: string } | null;

      if (!res.ok || !body?.data) {
        setMemberError(normalizeApiMessage(body, 'Erro ao salvar acesso.'));
        return;
      }

      const nextMember = body.data;
      setMembers((prev) => {
        if (memberModalMode === 'create') return [...prev, nextMember];
        return prev.map((item) => (item.id === nextMember.id ? nextMember : item));
      });

      closeMemberModal();
      setToast(memberModalMode === 'create' ? 'Acesso adicionado' : 'Acesso atualizado');
    } catch {
      setMemberError('Erro ao salvar acesso.');
    } finally {
      setMemberSaving(false);
    }
  };

  const handleToggleMemberStatus = async (member: AccessMember) => {
    setMemberToggleLoadingId(member.id);
    try {
      const res = await fetch(`${API_BASE}/settings/access/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !member.active })
      });
      const body = (await res.json().catch(() => null)) as { data?: AccessMember; message?: string } | null;

      if (!res.ok || !body?.data) {
        setToast(normalizeApiMessage(body, 'Erro ao atualizar acesso'));
        return;
      }

      const updated = body.data;
      setMembers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setToast(updated.active ? 'Acesso ativado' : 'Acesso desativado');
    } catch {
      setToast('Erro ao atualizar acesso');
    } finally {
      setMemberToggleLoadingId(null);
    }
  };

  const renderBrandSection = () => (
    <div className="settings-brand-panel">
      {brands.length === 0 ? (
        <div className="settings-brands-empty">
          <strong>Voce nao possui nenhuma marca configurada</strong>
          <span>Adicione as marcas que voce revende para que seus clientes encontrem com facilidade.</span>
          <button className="button primary settings-brand-add" type="button" onClick={openCreateModal}>
            <IconPlus />
            Adicionar marca
          </button>
        </div>
      ) : (
        <>
          <div className="settings-brand-toolbar">
            <span className="meta">Marcas configuradas: {brands.length}</span>
            <button className="button primary settings-brand-add" type="button" onClick={openCreateModal}>
              <IconPlus />
              Adicionar marca
            </button>
          </div>
          <div className="settings-brand-list">
            {brands.map((brand) => (
              <article key={brand.id} className="settings-brand-card">
                <div className="settings-brand-id">
                  <div className="settings-brand-logo">
                    {brand.logo_url ? (
                      <img src={brand.logo_url} alt={brand.name} />
                    ) : (
                      <span>{brand.name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <strong>{brand.name}</strong>
                    <div className="meta">Lucratividade: {formatProfitability(brand.profitability)}%</div>
                  </div>
                </div>
                <div className="settings-brand-meta">
                  <span className={`settings-source-badge ${brand.source}`}>{sourceLabel[brand.source]}</span>
                  <button
                    className="button icon small settings-brand-remove"
                    type="button"
                    aria-label={`Remover ${brand.name}`}
                    onClick={() => handleDeleteBrand(brand.id)}
                  >
                    <IconTrash />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const renderAccountSection = () => (
    <div className="settings-form-card">
      <div className="settings-form-grid two">
        <label className="settings-field">
          <span>Nome do responsavel</span>
          <input
            value={accountForm.ownerName}
            placeholder="Nome completo"
            onChange={(event) => {
              setAccountForm((prev) => ({ ...prev, ownerName: event.target.value }));
              if (accountError) setAccountError(null);
            }}
          />
        </label>
        <label className="settings-field">
          <span>Email de contato</span>
          <input
            type="email"
            value={accountForm.ownerEmail}
            placeholder="email@empresa.com"
            onChange={(event) => {
              setAccountForm((prev) => ({ ...prev, ownerEmail: event.target.value }));
              if (accountError) setAccountError(null);
            }}
          />
        </label>
      </div>

      <div className="settings-form-grid two">
        <label className="settings-field">
          <span>WhatsApp</span>
          <input
            value={accountForm.ownerPhone}
            placeholder="(00) 00000-0000"
            onChange={(event) => {
              setAccountForm((prev) => ({
                ...prev,
                ownerPhone: formatPhoneInput(event.target.value)
              }));
              if (accountError) setAccountError(null);
            }}
          />
        </label>
        <label className="settings-field">
          <span>Nome do negocio</span>
          <input
            value={accountForm.businessName}
            placeholder="Nome da loja"
            onChange={(event) => {
              setAccountForm((prev) => ({ ...prev, businessName: event.target.value }));
              if (accountError) setAccountError(null);
            }}
          />
        </label>
      </div>

      {accountError ? <div className="field-error">{accountError}</div> : null}

      <div className="settings-actions-row">
        <button className="button primary" type="button" disabled={accountSaving} onClick={handleSaveAccount}>
          {accountSaving ? 'Salvando...' : 'Salvar conta'}
        </button>
      </div>
    </div>
  );

  const renderSubscriptionSection = () => (
    <div className="settings-form-card">
      <div className="settings-form-grid two">
        <label className="settings-field">
          <span>Plano</span>
          <input
            value={subscriptionForm.plan}
            placeholder="Ex.: Pro"
            onChange={(event) => {
              setSubscriptionForm((prev) => ({ ...prev, plan: event.target.value }));
              if (subscriptionError) setSubscriptionError(null);
            }}
          />
        </label>

        <label className="settings-field">
          <span>Status</span>
          <select
            value={subscriptionForm.status}
            onChange={(event) => {
              const next = event.target.value;
              if (!isSubscriptionStatus(next)) return;
              setSubscriptionForm((prev) => ({ ...prev, status: next }));
              if (subscriptionError) setSubscriptionError(null);
            }}
          >
            {Object.entries(statusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="settings-form-grid two">
        <label className="settings-field">
          <span>Renovacao</span>
          <input
            type="date"
            value={subscriptionForm.renewalDate}
            onChange={(event) => {
              setSubscriptionForm((prev) => ({ ...prev, renewalDate: event.target.value }));
              if (subscriptionError) setSubscriptionError(null);
            }}
          />
        </label>
        <label className="settings-field">
          <span>Valor mensal (R$)</span>
          <input
            value={subscriptionForm.monthlyPrice}
            inputMode="decimal"
            placeholder="0,00"
            onChange={(event) => {
              setSubscriptionForm((prev) => ({
                ...prev,
                monthlyPrice: event.target.value.replace(/[^\d,.]/g, '')
              }));
              if (subscriptionError) setSubscriptionError(null);
            }}
          />
        </label>
      </div>

      {subscriptionError ? <div className="field-error">{subscriptionError}</div> : null}

      <div className="settings-actions-row">
        <button
          className="button primary"
          type="button"
          disabled={subscriptionSaving}
          onClick={handleSaveSubscription}
        >
          {subscriptionSaving ? 'Salvando...' : 'Salvar assinatura'}
        </button>
      </div>
    </div>
  );

  const renderPixSection = () => (
    <div className="settings-form-card">
      <div className="settings-form-grid two">
        <label className="settings-field">
          <span>Tipo da chave</span>
          <select
            value={pixForm.keyType}
            onChange={(event) => {
              const next = event.target.value;
              setPixForm((prev) => ({ ...prev, keyType: isPixKeyType(next) ? next : '' }));
              if (pixError) setPixError(null);
            }}
          >
            <option value="">Selecione</option>
            <option value="cpf">CPF</option>
            <option value="cnpj">CNPJ</option>
            <option value="email">Email</option>
            <option value="phone">Telefone</option>
            <option value="random">Chave aleatoria</option>
          </select>
        </label>

        <label className="settings-field">
          <span>Chave</span>
          <input
            value={pixForm.keyValue}
            placeholder="Informe a chave Pix"
            onChange={(event) => {
              setPixForm((prev) => ({ ...prev, keyValue: event.target.value }));
              if (pixError) setPixError(null);
            }}
          />
        </label>
      </div>

      <label className="settings-field">
        <span>Titular da chave</span>
        <input
          value={pixForm.holderName}
          placeholder="Nome completo do titular"
          onChange={(event) => {
            setPixForm((prev) => ({ ...prev, holderName: event.target.value }));
            if (pixError) setPixError(null);
          }}
        />
      </label>

      {pixError ? <div className="field-error">{pixError}</div> : null}

      <div className="settings-actions-row">
        <button className="button primary" type="button" disabled={pixSaving} onClick={handleSavePix}>
          {pixSaving ? 'Salvando...' : 'Salvar chave Pix'}
        </button>
      </div>
    </div>
  );

  const renderAlertSection = () => (
    <div className="settings-form-card">
      <label className="settings-toggle-row">
        <span>Ativar alerta automatico</span>
        <input
          type="checkbox"
          checked={alertsForm.enabled}
          onChange={(event) => {
            setAlertsForm((prev) => ({ ...prev, enabled: event.target.checked }));
            if (alertsError) setAlertsError(null);
          }}
        />
      </label>

      <label className="settings-field">
        <span>Dias antes do vencimento</span>
        <input
          inputMode="numeric"
          value={alertsForm.daysBeforeDue}
          placeholder="3"
          onChange={(event) => {
            setAlertsForm((prev) => ({
              ...prev,
              daysBeforeDue: event.target.value.replace(/\D/g, '').slice(0, 2)
            }));
            if (alertsError) setAlertsError(null);
          }}
        />
      </label>

      <div className="settings-note">
        {alertsForm.enabled
          ? `Alertas serao enviados ${alertsForm.daysBeforeDue || '0'} dia(s) antes do vencimento.`
          : 'Alertas automaticos desativados.'}
      </div>

      {alertsError ? <div className="field-error">{alertsError}</div> : null}

      <div className="settings-actions-row">
        <button className="button primary" type="button" disabled={alertsSaving} onClick={handleSaveAlerts}>
          {alertsSaving ? 'Salvando...' : 'Salvar alerta'}
        </button>
      </div>
    </div>
  );

  const renderAccessSection = () => (
    <div className="settings-access-panel">
      <div className="settings-access-toolbar">
        <span className="meta">Membros cadastrados: {members.length}</span>
        <button className="button primary settings-brand-add" type="button" onClick={openCreateMember}>
          <IconPlus />
          Adicionar acesso
        </button>
      </div>

      {members.length === 0 ? (
        <div className="settings-access-empty">Nenhum membro cadastrado ainda.</div>
      ) : (
        <div className="settings-access-list">
          {members.map((member) => (
            <article key={member.id} className="settings-access-card">
              <div className="settings-access-id">
                <button type="button" className="settings-access-name" onClick={() => openEditMember(member)}>
                  {member.name}
                </button>
                <span className="meta">{member.email}</span>
                <span className="meta">Criado em {formatMemberDate(member.created_at)}</span>
              </div>
              <div className="settings-access-meta">
                <span className="settings-role-badge">{roleLabel(member.role)}</span>
                <span className={`settings-status-badge ${member.active ? 'active' : 'inactive'}`}>
                  {member.active ? 'Ativo' : 'Inativo'}
                </span>
                <button
                  type="button"
                  className="button ghost settings-access-toggle"
                  disabled={memberToggleLoadingId === member.id}
                  onClick={() => handleToggleMemberStatus(member)}
                >
                  {memberToggleLoadingId === member.id ? '...' : member.active ? 'Desativar' : 'Ativar'}
                </button>
                <button type="button" className="button icon small" onClick={() => openEditMember(member)}>
                  <IconEdit />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );

  const renderSection = () => {
    if (activeSection === 'marcas') return renderBrandSection();
    if (activeSection === 'conta') return renderAccountSection();
    if (activeSection === 'assinatura') return renderSubscriptionSection();
    if (activeSection === 'pix') return renderPixSection();
    if (activeSection === 'alerta') return renderAlertSection();
    return renderAccessSection();
  };

  return (
    <>
      <div className="settings-shell">
        <aside className="settings-nav">
          <strong className="settings-nav-title">Configuracoes</strong>
          <div className="settings-nav-list">
            {sectionOptions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`settings-nav-item${activeSection === item.id ? ' active' : ''}`}
                  onClick={() => setActiveSection(item.id)}
                >
                  <Icon />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="settings-main">
          <header className="settings-main-header">
            <h1>{sectionTitle[activeSection]}</h1>
            <p>{sectionDescription[activeSection]}</p>
          </header>

          {renderSection()}
        </section>
      </div>

      {createOpen ? (
        <div className="modal-backdrop" onClick={closeCreateModal}>
          <div className="modal modal-brand-create" onClick={(event) => event.stopPropagation()}>
            <div className="brand-modal-header">
              <h3>{createMode === 'manual' ? 'Nova marca' : 'Adicionar marca'}</h3>
              <button className="brand-modal-close" type="button" onClick={closeCreateModal}>
                ✕
              </button>
            </div>

            <div className="brand-mode-grid">
              <button
                type="button"
                className={`brand-mode-option${createMode === 'existing' ? ' active' : ''}`}
                onClick={() => setCreateMode('existing')}
              >
                Incluir marca existente
              </button>
              <button
                type="button"
                className={`brand-mode-option${createMode === 'catalog' ? ' active' : ''}`}
                onClick={() => setCreateMode('catalog')}
              >
                Marca do catalogo
              </button>
              <button
                type="button"
                className={`brand-mode-option${createMode === 'manual' ? ' active' : ''}`}
                onClick={() => setCreateMode('manual')}
              >
                Manual
              </button>
            </div>

            {createMode === 'manual' ? (
              <div className="brand-manual-form">
                <label className="brand-field">
                  <span>Logo</span>
                  <div className="brand-logo-upload-card">
                    <div className="brand-logo-preview">
                      {manualLogoUrl ? <img src={manualLogoUrl} alt="Logo da marca" /> : <span>◉</span>}
                    </div>
                    <label className="brand-upload-button">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          const nextUrl = URL.createObjectURL(file);
                          setManualLogoUrl((prev) => {
                            if (prev.startsWith('blob:') && prev !== nextUrl) URL.revokeObjectURL(prev);
                            return nextUrl;
                          });
                          event.currentTarget.value = '';
                        }}
                      />
                      <IconUpload />
                      Carregar
                    </label>
                  </div>
                </label>

                <label className="brand-field">
                  <span>Nome</span>
                  <input
                    value={manualName}
                    onChange={(event) => setManualName(event.target.value)}
                    placeholder="Informe o nome da marca"
                  />
                </label>

                <label className="brand-field">
                  <span>Lucratividade</span>
                  <div className="brand-profit-input">
                    <input
                      value={manualProfitability}
                      inputMode="decimal"
                      placeholder="0"
                      onChange={(event) => setManualProfitability(event.target.value.replace(/[^\d,.]/g, ''))}
                    />
                    <strong>%</strong>
                  </div>
                </label>
              </div>
            ) : (
              <div className="brand-selector-form">
                <label className="brand-field">
                  <span>{createMode === 'existing' ? 'Marca existente' : 'Marca do catalogo'}</span>
                  <select
                    value={createMode === 'existing' ? selectedExistingBrand : selectedCatalogBrand}
                    onChange={(event) =>
                      createMode === 'existing'
                        ? setSelectedExistingBrand(event.target.value)
                        : setSelectedCatalogBrand(event.target.value)
                    }
                  >
                    <option value="">Selecione uma marca</option>
                    {(createMode === 'existing' ? existingCreateOptions : catalogCreateOptions).map((brand) => (
                      <option key={brand} value={brand}>
                        {brand}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="brand-field">
                  <span>Lucratividade</span>
                  <div className="brand-profit-input">
                    <input
                      value={manualProfitability}
                      inputMode="decimal"
                      placeholder="0"
                      onChange={(event) => setManualProfitability(event.target.value.replace(/[^\d,.]/g, ''))}
                    />
                    <strong>%</strong>
                  </div>
                </label>
              </div>
            )}

            {createError ? <div className="field-error">{createError}</div> : null}

            <div className="brand-modal-footer">
              <button className="button ghost" type="button" onClick={closeCreateModal}>
                Cancelar
              </button>
              <button className="button primary" type="button" onClick={handleCreateBrand} disabled={createSaving}>
                {createSaving ? 'Salvando...' : 'Adicionar marca'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {memberModalOpen ? (
        <div className="modal-backdrop" onClick={closeMemberModal}>
          <div className="modal modal-settings-member" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{memberModalMode === 'create' ? 'Novo acesso' : 'Editar acesso'}</h3>
              <button className="modal-close" type="button" onClick={closeMemberModal}>
                ✕
              </button>
            </div>

            <div className="settings-member-grid">
              <label className="modal-field">
                <span>Nome</span>
                <input
                  value={memberForm.name}
                  placeholder="Nome completo"
                  onChange={(event) => {
                    setMemberForm((prev) => ({ ...prev, name: event.target.value }));
                    if (memberError) setMemberError(null);
                  }}
                />
              </label>

              <label className="modal-field">
                <span>Email</span>
                <input
                  type="email"
                  value={memberForm.email}
                  placeholder="usuario@empresa.com"
                  onChange={(event) => {
                    setMemberForm((prev) => ({ ...prev, email: event.target.value }));
                    if (memberError) setMemberError(null);
                  }}
                />
              </label>

              <label className="modal-field">
                <span>Perfil</span>
                <select
                  value={memberForm.role}
                  onChange={(event) => {
                    setMemberForm((prev) => ({ ...prev, role: event.target.value }));
                    if (memberError) setMemberError(null);
                  }}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-toggle-row">
                <span>Permitir acesso</span>
                <input
                  type="checkbox"
                  checked={memberForm.active}
                  onChange={(event) => {
                    setMemberForm((prev) => ({ ...prev, active: event.target.checked }));
                    if (memberError) setMemberError(null);
                  }}
                />
              </label>
            </div>

            {memberError ? <div className="field-error">{memberError}</div> : null}

            <div className="brand-modal-footer">
              <button className="button ghost" type="button" onClick={closeMemberModal}>
                Cancelar
              </button>
              <button className="button primary" type="button" onClick={handleSubmitMember} disabled={memberSaving}>
                {memberSaving ? 'Salvando...' : memberModalMode === 'create' ? 'Adicionar acesso' : 'Salvar acesso'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}
