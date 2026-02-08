import { FilterSelect } from '../filters';
import { fetchList, formatCurrency, getStringParam, toNumber } from '../lib';

type Receivable = {
  id: string;
  sale_id: string;
  amount: number | string;
  due_date: string;
  status: string;
};

const statusLabel = (status: string) => {
  if (status === 'paid') return 'Pago';
  if (status === 'overdue') return 'Atrasado';
  return 'Pendente';
};

const statusBadge = (status: string) => {
  if (status === 'paid') return 'success';
  if (status === 'overdue') return 'danger';
  return 'warn';
};

const formatDate = (value: string) => {
  if (!value) return '--';
  return new Date(value).toLocaleDateString('pt-BR');
};

type SearchParams = { status?: string | string[] };

export default async function FinanceiroPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const receivablesResponse = await fetchList<Receivable>('/finance/receivables');
  const receivables = receivablesResponse?.data ?? [];

  const statusFilter = getStringParam(resolvedParams.status) || 'all';

  const filteredReceivables =
    statusFilter === 'all'
      ? receivables
      : receivables.filter((receivable) => receivable.status === statusFilter);

  const totalReceivable = filteredReceivables.reduce((sum, r) => sum + toNumber(r.amount), 0);
  const paidTotal = filteredReceivables
    .filter((r) => r.status === 'paid')
    .reduce((sum, r) => sum + toNumber(r.amount), 0);
  const pendingTotal = totalReceivable - paidTotal;

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
  const now = new Date();
  const monthLabel = monthNames[now.getMonth()];
  const yearLabel = now.getFullYear();

  return (
    <main className="page-content">
      <div className="topbar">
        <section className="hero">
          <span className="section-title">Financeiro</span>
          <h1>Financeiro</h1>
          <p>Monitore entradas, despesas e saldo mensal da operacao.</p>
        </section>
        <div className="actions">
          <button className="button primary" type="button">
            + Incluir despesa
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="toolbar">
          <div className="toolbar-group">
            <div className="button icon">‹</div>
            <div className="select">
              <span>{monthLabel}</span>
              <strong>/{yearLabel}</strong>
            </div>
            <div className="button icon">›</div>
          </div>
          <div className="toolbar-group">
            <FilterSelect
              name="status"
              value={statusFilter}
              options={[
                { label: 'Situacao da transacao: Todas', value: 'all' },
                { label: 'Pagas', value: 'paid' },
                { label: 'Pendentes', value: 'pending' },
                { label: 'Atrasadas', value: 'overdue' }
              ]}
            />
            <div className="select">
              <span>Cliente</span>
              <strong>▾</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="stat-grid">
        <div className="stat-card">
          <div>
            <div className="stat-label">Saldo do mes</div>
            <div className="stat-value">{formatCurrency(paidTotal)}</div>
            <div className="meta">Esperado: {formatCurrency(totalReceivable)}</div>
          </div>
          <div className="stat-icon">▣</div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Receitas</div>
            <div className="stat-value">{formatCurrency(paidTotal)}</div>
            <div className="meta">Esperado: {formatCurrency(totalReceivable)}</div>
          </div>
          <div className="stat-icon">↑</div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Despesas</div>
            <div className="stat-value">{formatCurrency(0)}</div>
            <div className="meta">Previstas: {formatCurrency(0)}</div>
          </div>
          <div className="stat-icon warn">↓</div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">A receber</div>
            <div className="stat-value">{formatCurrency(pendingTotal)}</div>
            <div className="meta">Titulos abertos</div>
          </div>
          <div className="stat-icon">$</div>
        </div>
      </section>

      <section className="panel">
        {receivables.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💰</div>
            <strong>Nenhuma movimentacao encontrada</strong>
            <span>Sem recebimentos no periodo selecionado.</span>
            <button className="button primary" type="button">
              + Incluir despesa
            </button>
          </div>
        ) : filteredReceivables.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔎</div>
            <strong>Nenhum recebivel encontrado</strong>
            <span>Aplique outro filtro para visualizar resultados.</span>
          </div>
        ) : (
          <div className="data-list">
            <div className="data-row cols-4 header">
              <span>Venda</span>
              <span>Vencimento</span>
              <span>Valor</span>
              <span>Status</span>
            </div>
            {filteredReceivables.slice(0, 6).map((item) => (
              <div key={item.id} className="data-row cols-4">
                <div>
                  <strong>Venda #{item.sale_id.slice(0, 6)}</strong>
                  <div className="meta">Recebivel</div>
                </div>
                <div className="data-cell mono">{formatDate(item.due_date)}</div>
                <div className="data-cell mono">{formatCurrency(toNumber(item.amount))}</div>
                <span className={`badge ${statusBadge(item.status)}`}>
                  {statusLabel(item.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
