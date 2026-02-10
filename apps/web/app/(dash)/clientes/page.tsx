import Link from 'next/link';
import { FilterSelect } from '../filters';
import { IconGrid, IconList } from '../icons';
import { fetchList, getStringParam } from '../lib';
import CustomersListEditor from './customers-list-editor';

type Customer = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  birth_date?: string | null;
  city?: string | null;
  state?: string | null;
  tags?: string[] | null;
  description?: string | null;
  photo_url?: string | null;
  cpf_cnpj?: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
};

type SearchParams = {
  q?: string | string[];
  city?: string | string[];
  tag?: string | string[];
  view?: string | string[];
};

const normalizeText = (value?: string | null) => (value || '').trim().toLowerCase();

export default async function ClientesPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const customersResponse = await fetchList<Customer>('/customers');
  const customers = customersResponse?.data ?? [];
  const query = getStringParam(resolvedParams.q).trim();
  const cityFilter = getStringParam(resolvedParams.city) || 'all';
  const tagFilter = getStringParam(resolvedParams.tag) || 'all';
  const viewFilter = getStringParam(resolvedParams.view) === 'grid' ? 'grid' : 'table';
  const normalizedQuery = query.toLowerCase();

  const cities = Array.from(
    new Set(
      customers
        .map((customer) => customer.city?.trim())
        .filter((city): city is string => Boolean(city))
    )
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const tags = Array.from(
    new Set(
      customers
        .flatMap((customer) => customer.tags || [])
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const filteredCustomers = customers.filter((customer) => {
    const searchable = [
      customer.name,
      customer.phone,
      customer.email || '',
      customer.city || '',
      customer.state || '',
      customer.description || '',
      ...(customer.tags || [])
    ]
      .join(' ')
      .toLowerCase();

    const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
    const matchesCity =
      cityFilter === 'all' || normalizeText(customer.city) === normalizeText(cityFilter);
    const matchesTag =
      tagFilter === 'all' || (customer.tags || []).some((tag) => normalizeText(tag) === normalizeText(tagFilter));
    return matchesQuery && matchesCity && matchesTag;
  });

  const buildViewHref = (view: 'table' | 'grid') => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (cityFilter !== 'all') params.set('city', cityFilter);
    if (tagFilter !== 'all') params.set('tag', tagFilter);
    params.set('view', view);
    const queryString = params.toString();
    return queryString ? `/clientes?${queryString}` : '/clientes';
  };

  return (
    <main className="page-content">
      <div className="topbar">
        <section className="hero">
          <span className="section-title">Clientes</span>
          <h1>Clientes</h1>
          <p>Centralize informacoes de relacionamento e historico.</p>
        </section>
        <div className="actions">
          <div className="toggle-group customers-view-toggle">
            <Link
              href={buildViewHref('grid')}
              className={`button icon view-toggle${viewFilter === 'grid' ? ' active' : ''}`}
              aria-label="Visualizacao em grade"
            >
              <IconGrid />
            </Link>
            <Link
              href={buildViewHref('table')}
              className={`button icon view-toggle${viewFilter === 'table' ? ' active' : ''}`}
              aria-label="Visualizacao em tabela"
            >
              <IconList />
            </Link>
          </div>
          <Link className="button primary" href="/vendas?newCustomer=1&returnTo=%2Fclientes">
            + Cadastrar cliente
          </Link>
        </div>
      </div>

      <section className="panel filters-panel-static clients-filters-panel">
        <div className="toolbar">
          <form className="search" method="get">
            <span>🔍</span>
            <input name="q" placeholder="Buscar cliente" defaultValue={query} />
            {cityFilter !== 'all' ? <input type="hidden" name="city" value={cityFilter} /> : null}
            {tagFilter !== 'all' ? <input type="hidden" name="tag" value={tagFilter} /> : null}
          </form>
          <div className="toolbar-group">
            <FilterSelect
              name="city"
              value={cityFilter}
              options={[
                { label: 'Todas cidades', value: 'all' },
                ...cities.map((city) => ({ label: city, value: city }))
              ]}
            />
            <FilterSelect
              name="tag"
              value={tagFilter}
              options={[
                { label: 'Todas tags', value: 'all' },
                ...tags.map((tag) => ({ label: tag, value: tag }))
              ]}
            />
            <span className="meta">Clientes ativos: {filteredCustomers.length}</span>
          </div>
        </div>

        {customers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <strong>Nenhum cliente cadastrado</strong>
            <span>Cadastre clientes para agilizar vendas e recebimentos.</span>
            <Link className="button primary" href="/vendas?newCustomer=1&returnTo=%2Fclientes">
              + Cadastrar cliente
            </Link>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔎</div>
            <strong>Nenhum cliente encontrado</strong>
            <span>Revise os filtros ou busque por outro termo.</span>
          </div>
        ) : (
          <CustomersListEditor customers={filteredCustomers} viewMode={viewFilter} />
        )}
      </section>
    </main>
  );
}
