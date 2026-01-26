'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  IconDots,
  IconEdit,
  IconGrid,
  IconList,
  IconPlus,
  IconTrash,
  IconUpload
} from '../icons';
import SalesDetailModal, { type SaleDetail } from '../sales-detail-modal';
import { API_BASE, formatCurrency, toNumber } from '../lib';

type Product = {
  id: string;
  sku: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  price: number | string;
  active: boolean;
  quantity?: number | string;
  expires_at?: string | null;
  category_id?: string | null;
};

type StockOption = { label: string; value: string };

type Category = { id: string; name: string; color?: string | null };

type ProductDraft = {
  name: string;
  brand: string;
  brandCode: string;
  category: string;
  price: string;
  barcode: string;
  available: boolean;
};

type InventoryPanelProps = {
  products: Product[];
  productCount: number;
  totalUnits: number;
  productsLength: number;
  categories: Category[];
  categoryFilter: string;
  brands: string[];
  brandFilter: string;
  query: string;
  stockFilter: string;
  stockOptions: StockOption[];
  basePath: string;
  baseParams: Record<string, string>;
  viewParam: string;
};

const suggestions = [
  {
    id: '1',
    name: '174929 - Footworks Creme Hidratante para os Pes Noturno',
    brand: 'Avon',
    brandCode: '174929'
  },
  {
    id: '2',
    name: '1 Garrafa Aquavibe Motivacional 2 L + 3 Garrafas Eco Tupper Plus 500 ml',
    brand: 'Tupper',
    brandCode: 'TP-200'
  },
  { id: '3', name: '1 TOUCH FRESH QUAD 1,2L BORDEA', brand: 'Tupper', brandCode: 'TF-120' },
  { id: '4', name: '1 TOUCH FRESH QUAD 370ML BORD', brand: 'Tupper', brandCode: 'TF-037' },
  { id: '5', name: '1 TOUCH FRESH QUAD 810ML BORD', brand: 'Tupper', brandCode: 'TF-081' },
  { id: '6', name: '1 TOUCH FRESH RET 2,85L BORDEA', brand: 'Tupper', brandCode: 'TF-285' },
  {
    id: '7',
    name: '2 de 250 ml (1 Ouro e 1 Morango) + 1 de 740 ml + 1 de 3,5 L',
    brand: 'Natura',
    brandCode: 'NT-250'
  }
];

const emptyDraft: ProductDraft = {
  name: '',
  brand: '',
  brandCode: '',
  category: '',
  price: '',
  barcode: '',
  available: true
};

const EXPIRING_DAYS = 7;
const LOW_STOCK_THRESHOLD = 2;

const getDaysUntil = (value?: string | null) => {
  if (!value) return null;
  const expiresAt = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = expiresAt.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const getStockBadge = (quantity: number, active: boolean) => {
  if (!active || quantity <= 0) return 'Sem estoque';
  if (quantity <= LOW_STOCK_THRESHOLD) return 'Acabando';
  return 'Com estoque';
};

const getStockTone = (quantity: number, active: boolean) => {
  if (!active || quantity <= 0) return 'danger';
  if (quantity <= LOW_STOCK_THRESHOLD) return 'warn';
  return 'success';
};

export default function InventoryPanel({
  products,
  productCount,
  totalUnits,
  productsLength,
  categories,
  categoryFilter,
  brands,
  brandFilter,
  query,
  stockFilter,
  stockOptions,
  basePath,
  baseParams,
  viewParam
}: InventoryPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [openCreate, setOpenCreate] = useState(false);
  const [createStep, setCreateStep] = useState<'search' | 'form'>('search');
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formDraft, setFormDraft] = useState<ProductDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openImport, setOpenImport] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productTab, setProductTab] = useState<'estoque' | 'vendas'>('estoque');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [unitQuantity, setUnitQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [unitExpiry, setUnitExpiry] = useState('');
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoryMode, setCategoryMode] = useState<'list' | 'create' | 'edit'>('list');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#000000');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<Category | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);
  const [saleModal, setSaleModal] = useState<SaleDetail | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const view = viewParam === 'grid' ? 'grid' : 'list';

  const updateView = (nextView: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextView) {
      params.set('view', nextView);
    } else {
      params.delete('view');
    }
    router.replace(params.toString() ? `${pathname}?${params}` : pathname);
  };

  const buildCategoryHref = (categoryId?: string) => {
    const params = new URLSearchParams({
      ...baseParams,
      stock: stockFilter === 'all' ? '' : stockFilter,
      category: categoryId || '',
      brand: brandFilter === 'all' ? '' : brandFilter,
      view
    });
    return `${basePath}?${params.toString()}`;
  };

  const buildBrandHref = (brand?: string) => {
    const params = new URLSearchParams({
      ...baseParams,
      stock: stockFilter === 'all' ? '' : stockFilter,
      category: categoryFilter === 'all' ? '' : categoryFilter,
      brand: brand || '',
      view
    });
    return `${basePath}?${params.toString()}`;
  };

  const gridProducts = products.slice(0, 12);

  const salesSample = useMemo<SaleDetail>(() => {
    const base = selectedProduct || products[0];
    return {
      id: base?.id || 'sale-demo',
      customer: 'iago',
      date: new Date().toISOString(),
      status: 'delivered',
      total: toNumber(base?.price || 100),
      paid: 0,
      itemName: base?.name || 'Produto demonstracao',
      itemQty: 1,
      dueDate: new Date().toISOString()
    };
  }, [selectedProduct, products]);

  const closeCreateModal = () => {
    setOpenCreate(false);
    setCreateStep('search');
    setFormMode('create');
    setFormDraft(emptyDraft);
    setEditingId(null);
  };

  const openCreateSearch = () => {
    setOpenCreate(true);
    setFormMode('create');
    setCreateStep('search');
    setFormDraft(emptyDraft);
    setEditingId(null);
  };

  const openForm = (draft: ProductDraft, mode: 'create' | 'edit', id?: string | null) => {
    setOpenCreate(true);
    setFormMode(mode);
    setCreateStep('form');
    setFormDraft(draft);
    setEditingId(id ?? null);
  };

  const openEditForm = (product: Product) => {
    openForm(
      {
        name: product.name,
        brand: product.brand || '',
        brandCode: product.sku || '',
        category: product.category_id || '',
        price: product.price ? formatCurrency(toNumber(product.price)) : '',
        barcode: product.barcode || '',
        available: product.active
      },
      'edit',
      product.id
    );
  };

  const parseMoney = (value: string) => {
    const cleaned = value.replace(/[^\d,.-]/g, '');
    const normalized = cleaned.includes(',')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned;
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const formatCurrencyInput = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    const amount = Number(digits) / 100;
    return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const buildSku = () => {
    const brandCode = formDraft.brandCode.trim();
    if (brandCode) return brandCode;
    const barcode = formDraft.barcode.trim();
    if (barcode) return barcode;
    return `SKU-${Date.now()}`;
  };

  const handleSaveForm = async () => {
    const payload = {
      name: formDraft.name.trim(),
      sku: buildSku(),
      brand: formDraft.brand.trim() || undefined,
      barcode: formDraft.barcode.trim() || undefined,
      price: parseMoney(formDraft.price),
      cost: 0,
      categoryId: formDraft.category || undefined,
      active: formDraft.available
    };

    if (!payload.name) {
      setToast('Informe o nome do produto');
      return;
    }
    if (formMode === 'edit' && !editingId) {
      setToast('Produto invalido');
      return;
    }

    try {
      const existingProduct =
        formMode === 'create'
          ? products.find((product) => product.sku.toLowerCase() === payload.sku.toLowerCase())
          : null;
      const targetId = formMode === 'edit' ? editingId : existingProduct?.id;
      const method = formMode === 'edit' || existingProduct ? 'PATCH' : 'POST';
      const url =
        method === 'PATCH' && targetId
          ? `${API_BASE}/inventory/products/${targetId}`
          : `${API_BASE}/inventory/products`;
      const body = payload;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        setToast('Erro ao salvar o produto');
        return;
      }

      closeCreateModal();
      router.refresh();
      if (formMode === 'edit' || existingProduct) {
        setToast('Produto atualizado');
      } else {
        setToast('Produto cadastrado');
      }
    } catch {
      setToast('Erro ao salvar o produto');
    }
  };

  const resetCategoryForm = () => {
    setNewCategoryName('');
    setNewCategoryColor('#000000');
    setEditingCategory(null);
    setCategoryMode('list');
  };

  const openCategories = () => {
    setCategoriesOpen(true);
    resetCategoryForm();
  };

  const closeCategories = () => {
    setCategoriesOpen(false);
    resetCategoryForm();
  };

  const startCreateCategory = () => {
    setCategoryMode('create');
    setEditingCategory(null);
    setNewCategoryName('');
    setNewCategoryColor('#000000');
  };

  const startEditCategory = (category: Category) => {
    setCategoryMode('edit');
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryColor(category.color || '#000000');
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      setToast('Informe o nome da categoria');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/inventory/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim(), color: newCategoryColor })
      });
      if (!res.ok) {
        setToast('Erro ao criar categoria');
        return;
      }
      resetCategoryForm();
      router.refresh();
      setToast('Categoria criada');
    } catch {
      setToast('Erro ao criar categoria');
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory) return;
    if (!newCategoryName.trim()) {
      setToast('Informe o nome da categoria');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/inventory/categories/${editingCategory.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim(), color: newCategoryColor })
      });
      if (!res.ok) {
        setToast('Erro ao atualizar categoria');
        return;
      }
      resetCategoryForm();
      router.refresh();
      setToast('Categoria atualizada');
    } catch {
      setToast('Erro ao atualizar categoria');
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    try {
      const res = await fetch(`${API_BASE}/inventory/categories/${category.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        setToast('Erro ao excluir categoria');
        return;
      }
      setDeleteCategory(null);
      router.refresh();
      setToast('Categoria removida');
    } catch {
      setToast('Erro ao excluir categoria');
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    try {
      const res = await fetch(`${API_BASE}/inventory/products/${product.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        setToast('Erro ao excluir produto');
        return;
      }
      setDeleteProduct(null);
      router.refresh();
      setToast('Produto removido');
    } catch {
      setToast('Erro ao excluir produto');
    }
  };

  const handleAddUnits = async () => {
    if (!adjustProduct) return;
    const quantity = Math.max(1, Number(unitQuantity) || 0);
    try {
      const res = await fetch(`${API_BASE}/inventory/adjustments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: adjustProduct.sku,
          quantity,
          reason: 'manual_add'
        })
      });
      if (!res.ok) {
        setToast('Erro ao adicionar unidades');
        return;
      }
      setAdjustProduct(null);
      setUnitQuantity('1');
      setUnitCost('');
      setUnitExpiry('');
      router.refresh();
      setToast('Unidades adicionadas');
    } catch {
      setToast('Erro ao adicionar unidades');
    }
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <>
      <div className="topbar">
        <section className="hero">
          <span className="section-title">Estoque</span>
          <h1>Estoque</h1>
          <p>Organize o catalogo e acompanhe a saude do inventario.</p>
        </section>
        <div className="actions">
          <button
            className="button icon view-toggle"
            type="button"
            onClick={() => updateView(view === 'grid' ? 'list' : 'grid')}
            title={view === 'grid' ? 'Layout de lista' : 'Layout de grade'}
          >
            {view === 'grid' ? <IconList /> : <IconGrid />}
          </button>
          <button className="button ghost" type="button" onClick={() => setOpenImport(true)}>
            <IconUpload /> Importar
          </button>
          <button className="button primary" type="button" onClick={openCreateSearch}>
            <IconPlus /> Novo produto
          </button>
        </div>
      </div>

      <div className="split">
        <aside className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Categorias</h2>
              <p className="panel-subtitle">Segmentos mais usados</p>
            </div>
            <span className="badge">{productCount}</span>
          </div>
          <div className="category-list">
            <Link
              href={buildCategoryHref()}
              className={`category-item${categoryFilter === 'all' ? ' active' : ''}`}
            >
              <span>Todas as categorias</span>
              <span className="badge">{productsLength}</span>
            </Link>
            {categories.map((category) => {
              const count = products.filter((p) => p.category_id === category.id).length;
              return (
                <Link
                  key={category.id}
                  href={buildCategoryHref(category.id)}
                  className={`category-item${categoryFilter === category.id ? ' active' : ''}`}
                >
                  <span className="category-label">
                    <span
                      className="category-dot"
                      style={{ background: category.color || 'rgba(255,255,255,0.45)' }}
                    />
                    {category.name}
                  </span>
                  <span className="badge">{count}</span>
                </Link>
              );
            })}
            <button className="category-item button-item" type="button" onClick={openCategories}>
              <span>Gerenciar categorias</span>
              <span className="badge">+</span>
            </button>
          </div>
        </aside>

        <section className="panel">
          <div className="toolbar">
            <form className="search" method="get">
              <span>🔍</span>
              <input name="q" placeholder="Buscar produto" defaultValue={query} />
              {stockFilter !== 'all' ? <input type="hidden" name="stock" value={stockFilter} /> : null}
              {categoryFilter !== 'all' ? <input type="hidden" name="category" value={categoryFilter} /> : null}
              {brandFilter !== 'all' ? <input type="hidden" name="brand" value={brandFilter} /> : null}
              <input type="hidden" name="view" value={view} />
            </form>
            <div className="toolbar-group">
              {stockOptions.map((option) => (
                <Link
                  key={option.value}
                  className={`pill${stockFilter === option.value ? ' active' : ''}`}
                  href={`${basePath}?${new URLSearchParams({
                    ...baseParams,
                    stock: option.value === 'all' ? '' : option.value,
                    category: categoryFilter === 'all' ? '' : categoryFilter,
                    brand: brandFilter === 'all' ? '' : brandFilter,
                    view
                  }).toString()}`}
                >
                  {option.label}
                </Link>
              ))}
            </div>
            <div className="toolbar-group">
              <div className="select-wrapper">
                <button
                  className="select-trigger"
                  type="button"
                  onClick={() => setBrandOpen((prev) => !prev)}
                >
                  <span>{brandFilter === 'all' ? 'Todas marcas' : brandFilter}</span>
                  <strong>▾</strong>
                </button>
                {brandOpen ? (
                  <div className="select-menu">
                    <Link
                      href={buildBrandHref()}
                      className={brandFilter === 'all' ? 'active' : ''}
                      onClick={() => setBrandOpen(false)}
                    >
                      Todas marcas
                    </Link>
                    {brands.map((brand) => (
                      <Link
                        key={brand}
                        href={buildBrandHref(brand)}
                        className={brandFilter === brand ? 'active' : ''}
                        onClick={() => setBrandOpen(false)}
                      >
                        {brand}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
              <span className="meta">
                Produtos: {productCount} · Unidades: {totalUnits}
              </span>
            </div>
          </div>

          {productsLength === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📦</div>
              <strong>Nenhum produto cadastrado</strong>
              <span>Comece adicionando um produto para controlar o estoque.</span>
              <button className="button primary" type="button" onClick={openCreateSearch}>
                + Cadastrar produto
              </button>
            </div>
          ) : productCount === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔎</div>
              <strong>Nenhum produto encontrado</strong>
              <span>Ajuste os filtros ou busque por outro termo.</span>
              <Link className="button ghost" href={basePath}>
                Limpar filtros
              </Link>
            </div>
          ) : (
            <div className="inventory-list">
              <div className="data-row cols-4 header">
                <span>Produto</span>
                <span>Preco de venda</span>
                <span>Estoque</span>
                <span>Acoes</span>
              </div>
              {gridProducts.map((product) => {
                const quantity = toNumber(product.quantity ?? 0);
                const stockLabel =
                  product.active && quantity > 0
                    ? `${quantity} ${quantity === 1 ? 'unidade' : 'unidades'}`
                    : 'Sem estoque';
                return (
                  <div key={product.id} className="data-row cols-4 inventory-row">
                    <button
                      className="inventory-row-main"
                      type="button"
                      onClick={() => {
                        setSelectedProduct(product);
                        setProductTab('estoque');
                      }}
                    >
                      <span className="inventory-row-thumb">🧴</span>
                      <div>
                        <strong>{product.name}</strong>
                        <div className="meta">
                          {(product.brand || 'Sem marca') + ' · ' + product.sku}
                        </div>
                      </div>
                    </button>
                    <div className="data-cell mono">
                      {product.price ? formatCurrency(toNumber(product.price)) : 'Sem preco'}
                    </div>
                    <span className={`badge ${getStockTone(quantity, product.active)}`}>{stockLabel}</span>
                    <div className="inventory-row-actions">
                      <button
                        className={`button icon small${menuOpenId === product.id ? ' active' : ''}`}
                        type="button"
                        onClick={() => setMenuOpenId((prev) => (prev === product.id ? null : product.id))}
                      >
                        <IconDots />
                      </button>
                      {menuOpenId === product.id ? (
                        <div className="inventory-dropdown">
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              openEditForm(product);
                            }}
                          >
                            <IconEdit /> Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              setAdjustProduct(product);
                              setUnitQuantity('1');
                              setUnitCost('');
                              setUnitExpiry('');
                            }}
                          >
                            <IconPlus /> Adicionar unidades
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => {
                              setMenuOpenId(null);
                              setDeleteProduct(product);
                            }}
                          >
                            <IconTrash /> Excluir
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {openCreate ? (
        <div className="modal-backdrop" onClick={closeCreateModal}>
          <div className="modal modal-create" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{formMode === 'edit' ? 'Editar produto' : 'Cadastrar produto'}</h3>
              <button className="modal-close" type="button" onClick={closeCreateModal}>
                ✕
              </button>
            </div>

                    {createStep === 'search' && formMode === 'create' ? (
              <>
                <label className="modal-field">
                  <span>Nome ou codigo</span>
                  <input placeholder="Busque pelo nome ou codigo do produto" />
                </label>
                <div className="modal-suggestions">
                  <div className="modal-suggestions-title">Sugestoes</div>
                  <div className="modal-suggestions-list">
                    {(products.length
                      ? products.map((product) => ({
                          id: product.id,
                          name: product.name,
                          brand: product.brand || 'Avon',
                          brandCode: product.sku
                        }))
                      : suggestions
                    ).map((item) => (
                      <button
                        key={item.id}
                        className="modal-suggestion"
                        type="button"
                        onClick={() =>
                          openForm(
                            {
                              ...emptyDraft,
                              name: item.name,
                              brand: item.brand,
                              brandCode: item.brandCode
                            },
                            'create'
                          )
                        }
                      >
                        <span className="modal-suggestion-thumb">🧴</span>
                        <span>{item.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="button ghost" type="button" onClick={closeCreateModal}>
                    Cancelar
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => openForm(emptyDraft, 'create')}
                  >
                    Cadastrar manualmente
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="product-form">
                  <div className="product-image">
                    <div className="product-upload">
                      <span>⬆</span>
                      <p>Arraste a imagem ou clique para enviar</p>
                    </div>
                  </div>
                  <div className="product-fields">
                    <label className="modal-field">
                      <span>Nome do produto</span>
                      <input
                        value={formDraft.name}
                        onChange={(event) =>
                          setFormDraft((prev) => ({ ...prev, name: event.target.value }))
                        }
                      />
                    </label>
                    <div className="form-row">
                      <label className="modal-field">
                        <span>Marca</span>
                        <select
                          value={formDraft.brand}
                          onChange={(event) =>
                            setFormDraft((prev) => ({ ...prev, brand: event.target.value }))
                          }
                        >
                          <option value="">Selecione a marca</option>
                          <option value="Avon">Avon</option>
                          <option value="Natura">Natura</option>
                          <option value="Tupper">Tupper</option>
                        </select>
                      </label>
                      <label className="modal-field">
                        <span>Codigo da marca</span>
                        <input
                          value={formDraft.brandCode}
                          onChange={(event) =>
                            setFormDraft((prev) => ({ ...prev, brandCode: event.target.value }))
                          }
                        />
                      </label>
                    </div>
                    <label className="modal-field">
                      <span>Categoria</span>
                      <select
                        value={formDraft.category}
                        onChange={(event) =>
                          setFormDraft((prev) => ({ ...prev, category: event.target.value }))
                        }
                      >
                        <option value="">Selecione a categoria</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="form-row">
                      <label className="modal-field">
                        <span>Preco de venda</span>
                        <input
                          value={formDraft.price}
                          inputMode="decimal"
                          placeholder="R$ 0,00"
                          onChange={(event) =>
                            setFormDraft((prev) => ({
                              ...prev,
                              price: formatCurrencyInput(event.target.value)
                            }))
                          }
                        />
                      </label>
                      <label className="modal-field">
                        <span>Codigo de barras</span>
                        <input
                          value={formDraft.barcode}
                          onChange={(event) =>
                            setFormDraft((prev) => ({ ...prev, barcode: event.target.value }))
                          }
                        />
                      </label>
                    </div>
                    <div className="toggle-row">
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={formDraft.available}
                          onChange={(event) =>
                            setFormDraft((prev) => ({ ...prev, available: event.target.checked }))
                          }
                        />
                        <span className="slider" />
                      </label>
                      <span>Disponivel na loja</span>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  {formMode === 'create' ? (
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => setCreateStep('search')}
                    >
                      Voltar
                    </button>
                  ) : (
                    <span />
                  )}
                  <div className="footer-actions">
                    <button className="button ghost" type="button" onClick={closeCreateModal}>
                      Cancelar
                    </button>
                    <button className="button primary" type="button" onClick={handleSaveForm}>
                      {formMode === 'edit' ? 'Salvar' : 'Cadastrar'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {openImport ? (
        <div className="modal-backdrop" onClick={() => setOpenImport(false)}>
          <div className="modal modal-import" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Upload do Arquivo Excel</h3>
                <span className="meta">Passo 1 de 4</span>
              </div>
              <button className="modal-close" type="button" onClick={() => setOpenImport(false)}>
                ✕
              </button>
            </div>
            <div className="import-tip">
              <strong>Como preparar seu arquivo Excel:</strong>
              <ul>
                <li>A primeira linha deve conter os cabecalhos das colunas</li>
                <li>Inclua colunas como: Nome, Marca, Categoria, Preco, Codigo de Barras, etc.</li>
                <li>Formatos aceitos: .xlsx, .xls, .csv</li>
                <li>Tamanho maximo: 10MB</li>
              </ul>
            </div>
            <div className="import-drop">
              <div className="import-icon">⤴</div>
              <strong>Arraste um arquivo Excel aqui</strong>
              <span>ou clique para selecionar um arquivo</span>
              <button className="button primary" type="button">
                Selecionar Arquivo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedProduct ? (
        <div className="modal-backdrop" onClick={() => setSelectedProduct(null)}>
          <div className="modal modal-product" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-product-header">
                <div className="modal-product-thumb">🧴</div>
                <div>
                  <strong>{selectedProduct.name}</strong>
                  <span>{selectedProduct.barcode || selectedProduct.sku}</span>
                </div>
              </div>
              <button className="modal-close" type="button" onClick={() => setSelectedProduct(null)}>
                ✕
              </button>
            </div>

            <div className="modal-tabs">
              <button
                className={productTab === 'estoque' ? 'active' : ''}
                type="button"
                onClick={() => setProductTab('estoque')}
              >
                Estoque
              </button>
              <button
                className={productTab === 'vendas' ? 'active' : ''}
                type="button"
                onClick={() => setProductTab('vendas')}
              >
                Vendas
              </button>
            </div>

            {productTab === 'estoque' ? (
              <div className="modal-product-body">
                {toNumber(selectedProduct.quantity ?? 0) > 0 && selectedProduct.active ? (
                  <>
                    <div className="modal-product-table">
                      <div className="modal-table-header">
                        <span>Preco de compra</span>
                        <span>Vencimento</span>
                        <span>Acoes</span>
                      </div>
                      <div className="modal-table-row">
                        <span>{formatCurrency(0.7)}</span>
                        <span>-</span>
                        <button className="button icon small" type="button">
                          <IconDots />
                        </button>
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button className="button ghost" type="button" onClick={() => openEditForm(selectedProduct)}>
                        <IconEdit /> Editar
                      </button>
                      <button
                        className="button primary"
                        type="button"
                        onClick={() => {
                          setAdjustProduct(selectedProduct);
                          setUnitQuantity('1');
                          setUnitCost('');
                          setUnitExpiry('');
                        }}
                      >
                        <IconPlus /> Incluir unidades
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="modal-empty">
                      <div className="modal-empty-icon">📦</div>
                      <strong>Nenhuma unidade em estoque</strong>
                      <span>Adicione unidades para acompanhar vencimentos e compras.</span>
                    </div>
                    <div className="modal-footer">
                      <button className="button ghost" type="button" onClick={() => openEditForm(selectedProduct)}>
                        <IconEdit /> Editar
                      </button>
                      <button
                        className="button primary"
                        type="button"
                        onClick={() => {
                          setAdjustProduct(selectedProduct);
                          setUnitQuantity('1');
                          setUnitCost('');
                          setUnitExpiry('');
                        }}
                      >
                        <IconPlus /> Incluir unidades
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="modal-product-body">
                <div className="modal-product-row clickable" onClick={() => setSaleModal(salesSample)}>
                  <div>
                    <strong>iago - 1 itens</strong>
                    <span>{formatCurrency(100)} | 24 DE JAN.</span>
                  </div>
                  <button className="button ghost" type="button">
                    Clique para ver
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      

      {adjustProduct ? (
        <div className="modal-backdrop" onClick={() => setAdjustProduct(null)}>
          <div className="modal modal-units" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Incluir unidades</h3>
              <button className="modal-close" type="button" onClick={() => setAdjustProduct(null)}>
                ✕
              </button>
            </div>
            <div className="unit-product">
              <div className="unit-thumb">🧴</div>
              <div>
                <span>Incluindo unidades do produto</span>
                <strong>{adjustProduct.name}</strong>
              </div>
            </div>
            <label className="modal-field">
              <span>Quantidade</span>
              <input
                type="number"
                min="1"
                value={unitQuantity}
                onChange={(event) => setUnitQuantity(event.target.value)}
              />
            </label>
            <label className="modal-field">
              <span>Preco de compra</span>
              <input
                value={unitCost}
                inputMode="decimal"
                placeholder="R$ 0,00"
                onChange={(event) => setUnitCost(formatCurrencyInput(event.target.value))}
              />
            </label>
            <label className="modal-field">
              <span>Data de validade</span>
              <input
                type="date"
                value={unitExpiry}
                onChange={(event) => setUnitExpiry(event.target.value)}
              />
            </label>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setAdjustProduct(null)}>
                Cancelar
              </button>
              <button className="button primary" type="button" onClick={handleAddUnits}>
                Adicionar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteProduct ? (
        <div className="modal-backdrop" onClick={() => setDeleteProduct(null)}>
          <div className="modal modal-delete" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Excluir &quot;{deleteProduct.name}&quot;</h3>
              <button className="modal-close" type="button" onClick={() => setDeleteProduct(null)}>
                ✕
              </button>
            </div>
            <p>
              Ao excluir esse produto TODAS UNIDADES dele serao excluidas e voce perdera o historico
              de vendas relacionado ao produto.
            </p>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setDeleteProduct(null)}>
                Cancelar
              </button>
              <button className="button danger" type="button" onClick={() => handleDeleteProduct(deleteProduct)}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {categoriesOpen ? (
        <div className="modal-backdrop" onClick={closeCategories}>
          <div className="modal modal-categories" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {categoryMode === 'list'
                  ? 'Configurar categorias'
                  : categoryMode === 'edit'
                    ? 'Editar categoria'
                    : 'Nova categoria'}
              </h3>
              <button className="modal-close" type="button" onClick={closeCategories}>
                ✕
              </button>
            </div>

            {categoryMode === 'list' ? (
              <>
                <div className="category-manager-list">
                  {categories.length === 0 ? (
                    <p className="meta">Nenhuma categoria cadastrada.</p>
                  ) : (
                    categories.map((category) => (
                      <div key={category.id} className="category-manager-row">
                        <span
                          className="category-dot"
                          style={{ background: category.color || 'rgba(255,255,255,0.45)' }}
                        />
                        <strong>{category.name}</strong>
                        <div className="category-row-actions">
                          <button type="button" onClick={() => startEditCategory(category)}>
                            <IconEdit /> Editar
                          </button>
                          <button type="button" className="danger" onClick={() => setDeleteCategory(category)}>
                            <IconTrash /> Excluir
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <button className="category-action" type="button" onClick={startCreateCategory}>
                  + Nova categoria
                </button>
              </>
            ) : (
              <>
                <label className="modal-field">
                  <span>Nome da categoria</span>
                  <input
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="Ex: Beleza"
                  />
                </label>
                <label className="modal-field">
                  <span>Cor da categoria</span>
                  <input
                    type="color"
                    value={newCategoryColor}
                    onChange={(event) => setNewCategoryColor(event.target.value)}
                  />
                </label>
                <div className="modal-footer">
                  <button className="button ghost" type="button" onClick={resetCategoryForm}>
                    Voltar
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    onClick={categoryMode === 'edit' ? handleUpdateCategory : handleCreateCategory}
                  >
                    {categoryMode === 'edit' ? 'Salvar' : 'Criar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {deleteCategory ? (
        <div className="modal-backdrop" onClick={() => setDeleteCategory(null)}>
          <div className="modal modal-delete" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Remover categoria</h3>
              <button className="modal-close" type="button" onClick={() => setDeleteCategory(null)}>
                ✕
              </button>
            </div>
            <p>Tem certeza que deseja remover esta categoria?</p>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setDeleteCategory(null)}>
                Cancelar
              </button>
              <button className="button danger" type="button" onClick={() => handleDeleteCategory(deleteCategory)}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}

      <SalesDetailModal open={Boolean(saleModal)} onClose={() => setSaleModal(null)} sale={saleModal} />
    </>
  );
}
