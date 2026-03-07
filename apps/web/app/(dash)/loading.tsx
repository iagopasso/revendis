export default function DashboardLoading() {
  return (
    <main className="page-content" aria-busy="true" aria-live="polite">
      <section className="topbar">
        <div className="hero">
          <h1>Carregando...</h1>
          <p>Estamos preparando os dados desta tela.</p>
        </div>
      </section>
      <section className="panel">
        <p className="meta">Aguarde alguns segundos.</p>
      </section>
    </main>
  );
}
