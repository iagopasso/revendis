const reportSections = [
  {
    title: 'Vendas',
    items: [
      {
        title: 'Vendas',
        description: 'Vendas realizadas em determinado periodo',
        icon: '🏷️'
      },
      {
        title: 'Produtos mais vendidos',
        description: 'Produtos mais vendidos em determinado periodo',
        icon: '📊'
      }
    ]
  },
  {
    title: 'Estoque',
    items: [
      {
        title: 'Estoque atual',
        description: 'Quantidades disponiveis em estoque para cada produto',
        icon: '📦'
      },
      {
        title: 'Proximos de vencer',
        description: 'Produtos proximos de vencer em determinado periodo',
        icon: '📅'
      }
    ]
  },
  {
    title: 'Clientes',
    items: [
      {
        title: 'Maiores compradores',
        description: 'Clientes que mais compraram em determinado periodo',
        icon: '👥'
      }
    ]
  }
];

export default function RelatoriosPage() {
  return (
    <main className="page-content">
      <div className="topbar">
        <section className="hero">
          <span className="section-title">Relatorios</span>
          <h1>Relatorios</h1>
          <p>Gere visoes estrategicas para estoque, clientes e vendas.</p>
        </section>
      </div>

      <section className="panel report-grid">
        {reportSections.map((section) => (
          <div key={section.title} className="report-section">
            <h2 className="panel-title">{section.title}</h2>
            <div className="report-cards">
              {section.items.map((item) => (
                <div key={item.title} className="report-card">
                  <div className="icon">{item.icon}</div>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
