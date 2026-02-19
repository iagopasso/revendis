'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconBox,
  IconBell,
  IconCart,
  IconDashboard,
  IconDollar,
  IconGlobe,
  IconMegaphone,
  IconMessage,
  IconPieChart,
  IconTag,
  IconWhatsapp,
  IconUsers
} from './icons';

const primaryNavItems = [
  { href: '/dashboard', label: 'Painel', icon: IconDashboard },
  { href: '/estoque', label: 'Estoque', icon: IconBox },
  { href: '/vendas', label: 'Vendas', icon: IconTag },
  { href: '/compras', label: 'Compras', icon: IconCart },
  { href: '/clientes', label: 'Clientes', icon: IconUsers },
  { href: '/financeiro', label: 'Financeiro', icon: IconDollar },
  { href: '/', label: 'Loja online', icon: IconGlobe },
  { href: '/relatorios', label: 'Relatórios', icon: IconPieChart },
  { href: '/configuracoes', label: 'Configurações', icon: IconMessage }
];

const utilityNavItems = [
  { label: 'Avisos', icon: IconMegaphone },
  { label: 'WhatsApp', icon: IconWhatsapp },
  { label: 'Notificações', icon: IconBell }
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar sidebar-expected">
      <Link href="/dashboard" className="logo sidebar-expected-logo" aria-label="Painel inicial">
        <img src="/logo.png" alt="Revendis" />
      </Link>

      <div className="sidebar-divider" />

      <nav className="nav sidebar-main-nav" aria-label="Navegação principal">
        {primaryNavItems.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className={isActive ? 'sidebar-icon-link active' : 'sidebar-icon-link'}
              aria-current={isActive ? 'page' : undefined}
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

      <div className="sidebar-main-spacer" />

      <nav className="sidebar-utility-nav" aria-label="Utilitários">
        {utilityNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.label} type="button" className="sidebar-icon-link" aria-label={item.label}>
              <span className="nav-icon">
                <Icon />
              </span>
            </button>
          );
        })}
      </nav>

      <button type="button" className="sidebar-avatar-btn" aria-label="Perfil">
        <span>IP</span>
      </button>
    </aside>
  );
}
