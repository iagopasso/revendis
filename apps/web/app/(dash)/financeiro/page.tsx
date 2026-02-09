import { fetchList } from '../lib';
import FinancePanel from './finance-panel';

type Receivable = {
  id: string;
  sale_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  amount: number | string;
  due_date: string;
  status: 'pending' | 'paid' | 'overdue';
  settled_at?: string | null;
  method?: string | null;
  created_at?: string;
};

type Expense = {
  id: string;
  store_id?: string;
  customer_id?: string | null;
  customer_name?: string | null;
  description: string;
  amount: number | string;
  due_date: string;
  status: 'pending' | 'paid';
  paid_at?: string | null;
  method?: string | null;
  created_at?: string;
};

type Customer = {
  id: string;
  name: string;
};

export default async function FinanceiroPage() {
  const [receivablesResponse, expensesResponse, customersResponse] = await Promise.all([
    fetchList<Receivable>('/finance/receivables'),
    fetchList<Expense>('/finance/expenses'),
    fetchList<Customer>('/customers')
  ]);

  const receivables = receivablesResponse?.data ?? [];
  const expenses = expensesResponse?.data ?? [];
  const customers = customersResponse?.data ?? [];

  return (
    <main className="page-content">
      <div className="topbar">
        <section className="hero">
          <span className="section-title">Financeiro</span>
          <h1>Financeiro</h1>
          <p>Monitore entradas, despesas e saldo mensal da operacao.</p>
        </section>
      </div>

      <FinancePanel initialReceivables={receivables} initialExpenses={expenses} customers={customers} />
    </main>
  );
}
