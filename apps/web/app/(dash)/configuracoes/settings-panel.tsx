'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  IconCalendar,
  IconClipboard,
  IconDiamond,
  IconDots,
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
import { resolveBrandLogo } from '../brand-logos';

type BrandSource = 'existing' | 'catalog' | 'manual';
type BrandCreateMode = 'catalog' | 'manual';
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

type CatalogBrandOption = {
  slug: string;
  label: string;
};

type SettingsPanelProps = {
  initialSection: string;
  initialBrands: ResellerBrand[];
  catalogBrandOptions: CatalogBrandOption[];
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

type BrandEditForm = {
  id: string;
  name: string;
  profitability: string;
  logoUrl: string;
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

const sourcePillLabel: Record<BrandSource, string> = {
  existing: 'Existente',
  catalog: 'Catalogo',
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

const DEFAULT_BRAND_PROFITABILITY = 30;

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

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo.'));
    reader.readAsDataURL(file);
  });

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

const normalizeBrandToken = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();

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
  const catalogCreateOptions = useMemo(
    () =>
      [...catalogBrandOptions].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    [catalogBrandOptions]
  );
  const catalogOptionBySlug = useMemo(
    () =>
      new Map(
        catalogCreateOptions.map((option) => [option.slug, option] as const)
      ),
    [catalogCreateOptions]
  );
  const configuredBrandTokenSet = useMemo(
    () => new Set(brands.map((brand) => normalizeBrandToken(brand.name)).filter(Boolean)),
    [brands]
  );
  const [toast, setToast] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<BrandCreateMode | null>(null);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCatalogBrand, setSelectedCatalogBrand] = useState(catalogCreateOptions[0]?.slug || '');
  const [manualName, setManualName] = useState('');
  const [manualLogoUrl, setManualLogoUrl] = useState('');
  const [brandMenuOpenId, setBrandMenuOpenId] = useState<string | null>(null);
  const [brandEditOpen, setBrandEditOpen] = useState(false);
  const [brandEditForm, setBrandEditForm] = useState<BrandEditForm | null>(null);
  const [brandEditSaving, setBrandEditSaving] = useState(false);
  const [brandEditError, setBrandEditError] = useState<string | null>(null);

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
    if (createMode !== 'catalog') return;
    if (selectedCatalogBrand && catalogOptionBySlug.has(selectedCatalogBrand)) return;
    setSelectedCatalogBrand(catalogCreateOptions[0]?.slug || '');
  }, [catalogCreateOptions, catalogOptionBySlug, createMode, selectedCatalogBrand]);

  useEffect(() => {
    if (!brandMenuOpenId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.settings-brand-menu-wrap')) return;
      setBrandMenuOpenId(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [brandMenuOpenId]);

  const nextBrandName = useMemo(() => {
    if (createMode === 'catalog') {
      return catalogOptionBySlug.get(selectedCatalogBrand)?.label.trim() || '';
    }
    return manualName.trim();
  }, [catalogOptionBySlug, createMode, manualName, selectedCatalogBrand]);

  const filteredCatalogOptions = useMemo(() => {
    const normalizedSearch = normalizeBrandToken(catalogSearch);
    const withStatus = catalogCreateOptions.map((option) => ({
      ...option,
      alreadyAdded: configuredBrandTokenSet.has(normalizeBrandToken(option.label))
    }));

    if (!normalizedSearch) return withStatus;

    return withStatus.filter((option) => {
      const labelToken = normalizeBrandToken(option.label);
      const slugToken = normalizeBrandToken(option.slug);
      return labelToken.includes(normalizedSearch) || slugToken.includes(normalizedSearch);
    });
  }, [catalogCreateOptions, catalogSearch, configuredBrandTokenSet]);

  const resetCreateForm = () => {
    setCreateMode(null);
    setCreateError(null);
    setCreateSaving(false);
    setCatalogSearch('');
    setSelectedCatalogBrand(catalogCreateOptions[0]?.slug || '');
    setManualName('');
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

  const handleCreateBrand = async (catalogSlugOverride?: string) => {
    if (!createMode) {
      setCreateError('Selecione como deseja incluir a marca.');
      return;
    }
    const mode = createMode;
    const catalogSlug = (catalogSlugOverride || selectedCatalogBrand || '').trim();
    const catalogOption = catalogOptionBySlug.get(catalogSlug);
    const name = mode === 'catalog' ? catalogOption?.label.trim() || '' : nextBrandName;
    if (!name) {
      setCreateError('Selecione ou informe o nome da marca.');
      return;
    }

    const profitability = DEFAULT_BRAND_PROFITABILITY;

    setCreateSaving(true);
    setCreateError(null);
    try {
      const res = await fetch(`${API_BASE}/settings/brands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          source: mode,
          sourceBrand: mode === 'catalog' ? catalogSlug || undefined : undefined,
          profitability,
          logoUrl: mode === 'manual' ? manualLogoUrl || undefined : undefined
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
      setToast(
        mode === 'catalog' && catalogSlug
          ? "Marca adicionada. Use 'Sincronizar catalogo agora' no cadastro de produtos."
          : 'Marca adicionada.'
      );
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
      setBrandMenuOpenId((prev) => (prev === brandId ? null : prev));
      if (brandEditForm?.id === brandId) {
        setBrandEditOpen(false);
        setBrandEditForm(null);
      }
      setToast('Marca removida');
    } catch {
      setToast('Erro ao remover marca');
    }
  };

  const parseProfitabilityValue = (value: string) => {
    const parsed = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.min(100, parsed));
  };

  const openBrandEditModal = (brand: ResellerBrand) => {
    setBrandEditForm({
      id: brand.id,
      name: brand.name,
      profitability: formatProfitability(brand.profitability ?? DEFAULT_BRAND_PROFITABILITY),
      logoUrl: brand.logo_url || ''
    });
    setBrandEditError(null);
    setBrandEditSaving(false);
    setBrandEditOpen(true);
    setBrandMenuOpenId(null);
  };

  const closeBrandEditModal = () => {
    setBrandEditOpen(false);
    setBrandEditForm(null);
    setBrandEditError(null);
    setBrandEditSaving(false);
  };

  const handleBrandLogoUpload = async (file?: File | null) => {
    if (!file || !brandEditForm) return;
    try {
      const logoUrl = await readFileAsDataUrl(file);
      setBrandEditForm((prev) => (prev ? { ...prev, logoUrl } : prev));
      setBrandEditError(null);
    } catch {
      setBrandEditError('Nao foi possivel carregar a imagem.');
    }
  };

  const handleSaveBrandEdit = async () => {
    if (!brandEditForm) return;
    const name = brandEditForm.name.trim();
    const parsed = parseProfitabilityValue(brandEditForm.profitability.trim());
    if (!name) {
      setBrandEditError('Informe o nome da marca.');
      return;
    }
    if (parsed === null) {
      setBrandEditError('Informe uma porcentagem de 0 a 100.');
      return;
    }

    setBrandEditSaving(true);
    setBrandEditError(null);
    try {
      const res = await fetch(`${API_BASE}/settings/brands/${brandEditForm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          profitability: parsed,
          logoUrl: brandEditForm.logoUrl || ''
        })
      });
      const payload = (await res.json().catch(() => null)) as { data?: ResellerBrand; message?: string } | null;

      if (!res.ok || !payload?.data) {
        setBrandEditError(normalizeApiMessage(payload, 'Erro ao atualizar marca.'));
        return;
      }

      const updated = payload.data;
      setBrands((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      closeBrandEditModal();
      setToast('Marca atualizada');
    } catch {
      setBrandEditError('Erro ao atualizar marca.');
    } finally {
      setBrandEditSaving(false);
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
          <div className="settings-brand-list" onClick={() => setBrandMenuOpenId(null)}>
            {brands.map((brand) => {
              const brandLogo = resolveBrandLogo(brand.name, brand.logo_url || null);
              const menuOpen = brandMenuOpenId === brand.id;
              const sourceClass =
                brand.source === 'catalog' ? 'catalog' : brand.source === 'existing' ? 'existing' : 'manual';

              return (
                <article
                  key={brand.id}
                  className="settings-brand-card menu-style"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="settings-brand-card-top">
                    <div className="settings-brand-id">
                      <div className="settings-brand-logo">
                        {brandLogo ? (
                          <img src={brandLogo} alt={brand.name} />
                        ) : (
                          <span>{brand.name.slice(0, 1).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="settings-brand-card-copy">
                        <strong>{brand.name}</strong>
                        <div className="meta">Lucratividade: {formatProfitability(brand.profitability)}%</div>
                        <span className={`settings-brand-pill ${sourceClass}`}>{sourcePillLabel[brand.source]}</span>
                      </div>
                    </div>

                    <div className="settings-brand-menu-wrap">
                      <button
                        className="settings-brand-kebab"
                        type="button"
                        aria-label={`Abrir menu da marca ${brand.name}`}
                        onClick={() => setBrandMenuOpenId((prev) => (prev === brand.id ? null : brand.id))}
                      >
                        <IconDots />
                      </button>

                      {menuOpen ? (
                        <div className="settings-brand-menu">
                          <button type="button" onClick={() => openBrandEditModal(brand)}>
                            <IconEdit />
                            Editar
                          </button>
                          <button type="button" className="danger" onClick={() => handleDeleteBrand(brand.id)}>
                            <IconTrash />
                            Excluir
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
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

  const editingBrandLogo = brandEditForm
    ? resolveBrandLogo(brandEditForm.name, brandEditForm.logoUrl || null)
    : null;

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
              <h3>Nova marca</h3>
              <button className="brand-modal-close" type="button" onClick={closeCreateModal}>
                ✕
              </button>
            </div>

            {createMode === null ? (
              <div className="brand-mode-grid">
                <button
                  type="button"
                  className="brand-mode-option active"
                  onClick={() => setCreateMode('catalog')}
                >
                  <IconClipboard />
                  <span>Incluir marca do catalogo</span>
                </button>
                <button
                  type="button"
                  className="brand-mode-option"
                  onClick={() => setCreateMode('manual')}
                >
                  <IconEdit />
                  <span>Incluir marca manualmente</span>
                </button>
              </div>
            ) : createMode === 'manual' ? (
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
                          void readFileAsDataUrl(file)
                            .then((nextUrl) => {
                              setManualLogoUrl(nextUrl);
                              setCreateError(null);
                            })
                            .catch(() => {
                              setCreateError('Nao foi possivel carregar a imagem.');
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
                <span className="meta">Lucratividade padrao aplicada: 30%</span>
              </div>
            ) : (
              <div className="brand-selector-form">
                <label className="brand-search-field">
                  <div className="brand-search-input">
                    <span>⌕</span>
                    <input
                      value={catalogSearch}
                      onChange={(event) => setCatalogSearch(event.target.value)}
                      placeholder="Buscar marca"
                    />
                  </div>
                </label>
                <span className="meta">Lucratividade padrao aplicada: 30%</span>

                <div className="catalog-brand-picker-list">
                  {filteredCatalogOptions.length === 0 ? (
                    <div className="meta">Nenhuma marca encontrada.</div>
                  ) : (
                    filteredCatalogOptions.map((option) => {
                      const alreadyAdded = option.alreadyAdded;

                      return (
                        <article key={option.slug} className="catalog-brand-picker-item">
                          <div className="catalog-brand-picker-info">
                            <span className="catalog-brand-logo">{option.label.slice(0, 1).toUpperCase()}</span>
                            <div className="catalog-brand-picker-text">
                              <strong>{option.label}</strong>
                              <span className="meta">{option.slug}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`button primary small${alreadyAdded ? ' ghost' : ''}`}
                            onClick={() => {
                              setSelectedCatalogBrand(option.slug);
                              void handleCreateBrand(option.slug);
                            }}
                            disabled={createSaving || alreadyAdded}
                          >
                            {alreadyAdded ? 'Adicionada' : 'Adicionar'}
                          </button>
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {createError ? <div className="field-error">{createError}</div> : null}

            <div className="brand-modal-footer">
              {createMode !== null ? (
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => {
                    setCreateMode(null);
                    setCreateError(null);
                  }}
                  disabled={createSaving}
                >
                  Voltar
                </button>
              ) : null}
              <button className="button ghost" type="button" onClick={closeCreateModal}>
                Cancelar
              </button>
              {createMode === 'manual' ? (
                <button
                  className="button primary"
                  type="button"
                  onClick={() => void handleCreateBrand()}
                  disabled={createSaving}
                >
                  {createSaving ? 'Salvando...' : 'Adicionar marca'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {brandEditOpen && brandEditForm ? (
        <div className="modal-backdrop" onClick={closeBrandEditModal}>
          <div className="modal modal-brand-edit" onClick={(event) => event.stopPropagation()}>
            <div className="brand-edit-header">
              <h3>Editar marca</h3>
              <button type="button" onClick={closeBrandEditModal} aria-label="Fechar edicao da marca">
                ✕
              </button>
            </div>

            <label className="brand-edit-field">
              <span>Logo</span>
              <div className="brand-edit-logo-box">
                <div className="brand-edit-logo-preview">
                  {editingBrandLogo ? (
                    <img src={editingBrandLogo} alt={brandEditForm.name} />
                  ) : (
                    <span>{brandEditForm.name.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>

                <div className="brand-edit-logo-actions">
                  <label className="brand-edit-logo-change">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        void handleBrandLogoUpload(file);
                        event.currentTarget.value = '';
                      }}
                    />
                    Alterar
                  </label>
                  <button
                    type="button"
                    className="brand-edit-logo-remove"
                    onClick={() => setBrandEditForm((prev) => (prev ? { ...prev, logoUrl: '' } : prev))}
                  >
                    Remover
                  </button>
                </div>
              </div>
            </label>

            <label className="brand-edit-field">
              <span>Nome</span>
              <input
                value={brandEditForm.name}
                onChange={(event) =>
                  setBrandEditForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                }
                placeholder="Nome da marca"
              />
            </label>

            <label className="brand-edit-field">
              <span>Lucratividade</span>
              <div className="brand-edit-profit-input">
                <input
                  value={brandEditForm.profitability}
                  inputMode="decimal"
                  onChange={(event) =>
                    setBrandEditForm((prev) =>
                      prev ? { ...prev, profitability: event.target.value.replace(/[^\d.,]/g, '').slice(0, 8) } : prev
                    )
                  }
                />
                <strong>%</strong>
              </div>
            </label>

            {brandEditError ? <div className="field-error">{brandEditError}</div> : null}

            <div className="brand-edit-footer">
              <button type="button" className="button ghost" onClick={closeBrandEditModal}>
                Cancelar
              </button>
              <button type="button" className="button primary" disabled={brandEditSaving} onClick={() => void handleSaveBrandEdit()}>
                {brandEditSaving ? 'Salvando...' : 'Salvar'}
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
