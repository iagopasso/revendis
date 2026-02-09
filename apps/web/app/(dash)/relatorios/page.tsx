import Link from 'next/link';

const reportSections = [
  {
    title: 'Vendas',
    items: [
      {
        title: 'Vendas',
        description: 'Vendas realizadas em determinado periodo',
        icon: '🏷️',
        href: '/relatorios/vendas'
      },
      {
        title: 'Produtos mais vendidos',
        description: 'Produtos mais vendidos em determinado periodo',
        icon: '📊',
        href: '/relatorios/produtos-mais-vendidos'
      }
    ]
  },
  {
    title: 'Estoque',
    items: [
      {
        title: 'Estoque atual',
        description: 'Quantidades disponiveis em estoque para cada produto',
        icon: '📦',
        href: '/relatorios/estoque-atual'
      },
      {
        title: 'Proximos de vencer',
        description: 'Produtos proximos de vencer em determinado periodo',
        icon: '📅',
        href: '/relatorios/proximos-de-vencer'
      }
    ]
  },
  {
    title: 'Clientes',
    items: [
      {
        title: 'Maiores compradores',
        description: 'Clientes que mais compraram em determinado periodo',
        icon: '👥',
        href: '/relatorios/maiores-compradores'
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
                <Link key={item.title} href={item.href} className="report-card report-link">
                  <div className="icon">{item.icon}</div>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
