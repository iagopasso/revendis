import { FilterSelect } from '../filters';
import { fetchList, getStringParam } from '../lib';

type Customer = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
};

type SearchParams = { q?: string | string[]; city?: string | string[]; tag?: string | string[] };

export default async function ClientesPage({
  searchParams
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolvedParams = (await Promise.resolve(searchParams)) ?? {};
  const customersResponse = await fetchList<Customer>('/customers');
  const customers = customersResponse?.data ?? [];
  const query = getStringParam(resolvedParams.q).trim();
  const cityFilter = getStringParam(resolvedParams.city) || 'all';
  const tagFilter = getStringParam(resolvedParams.tag) || 'all';
  const normalizedQuery = query.toLowerCase();

  const filteredCustomers = customers.filter((customer) => {
    const matchesQuery =
      !normalizedQuery ||
      customer.name.toLowerCase().includes(normalizedQuery) ||
      customer.phone.toLowerCase().includes(normalizedQuery) ||
      (customer.email || '').toLowerCase().includes(normalizedQuery);
    const matchesCity =
      cityFilter === 'all' ||
      (cityFilter === 'phone' && customer.phone) ||
      (cityFilter === 'no-phone' && !customer.phone);
    const matchesTag =
      tagFilter === 'all' ||
      (tagFilter === 'email' && customer.email) ||
      (tagFilter === 'no-email' && !customer.email);
    return matchesQuery && matchesCity && matchesTag;
  });

  const topCustomers = filteredCustomers.slice(0, 6);

  return (
    <main className="page-content">
      <div className="topbar">
        <section className="hero">
          <span className="section-title">Clientes</span>
          <h1>Clientes</h1>
          <p>Centralize informacoes de relacionamento e historico.</p>
        </section>
        <div className="actions">
          <div className="toggle-group">
            <button className="toggle active" type="button">
              ▦
            </button>
            <button className="toggle" type="button">
              ▤
            </button>
          </div>
          <button className="button primary" type="button">
            + Cadastrar cliente
          </button>
        </div>
      </div>

      <section className="panel">
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
                { label: 'Filtrar por cidade', value: 'all' },
                { label: 'Com telefone', value: 'phone' },
                { label: 'Sem telefone', value: 'no-phone' }
              ]}
            />
            <FilterSelect
              name="tag"
              value={tagFilter}
              options={[
                { label: 'Filtrar por tags', value: 'all' },
                { label: 'Com email', value: 'email' },
                { label: 'Sem email', value: 'no-email' }
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
            <button className="button primary" type="button">
              + Cadastrar cliente
            </button>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔎</div>
            <strong>Nenhum cliente encontrado</strong>
            <span>Revise os filtros ou busque por outro termo.</span>
          </div>
        ) : (
          <div className="data-list">
            <div className="data-row cols-3 header">
              <span>Cliente</span>
              <span>Telefone</span>
              <span>Email</span>
            </div>
            {topCustomers.map((customer) => (
              <div key={customer.id} className="data-row cols-3">
                <div>
                  <strong>{customer.name}</strong>
                  <div className="meta">Relacionamento ativo</div>
                </div>
                <div className="data-cell mono">{customer.phone}</div>
                <div className="data-cell mono">{customer.email || '--'}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
