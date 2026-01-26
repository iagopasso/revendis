'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconBox,
  IconCart,
  IconChart,
  IconDashboard,
  IconDollar,
  IconTag,
  IconUsers
} from './icons';

const navItems = [
  { href: '/', label: 'Painel', icon: IconDashboard },
  { href: '/categorias', label: 'Categoria', icon: IconBox },
  { href: '/vendas', label: 'Vendas', icon: IconTag },
  { href: '/compras', label: 'Compras', icon: IconCart },
  { href: '/clientes', label: 'Clientes', icon: IconUsers },
  { href: '/financeiro', label: 'Financeiro', icon: IconDollar },
  { href: '/relatorios', label: 'Relatorios', icon: IconChart }
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <Link href="/" className="logo" aria-label="Pagina inicial">
        <img src="/logo.png" alt="Revendis" />
      </Link>
      <nav className="nav">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={isActive ? 'active' : ''}
              aria-label={item.label}
              title={item.label}
            >
              <span className="nav-icon">
                <Icon />
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <div className="avatar">IP</div>
      </div>
    </aside>
  );
}
