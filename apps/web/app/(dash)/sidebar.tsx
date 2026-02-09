'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  IconBox,
  IconCart,
  IconChart,
  IconDashboard,
  IconDollar,
  IconLogout,
  IconSettings,
  IconTag,
  IconUser,
  IconUsers
} from './icons';

const navItems = [
  { href: '/', label: 'Painel', icon: IconDashboard },
  { href: '/estoque', label: 'Estoque', icon: IconBox },
  { href: '/vendas', label: 'Vendas', icon: IconTag },
  { href: '/compras', label: 'Compras', icon: IconCart },
  { href: '/clientes', label: 'Clientes', icon: IconUsers },
  { href: '/financeiro', label: 'Financeiro', icon: IconDollar },
  { href: '/relatorios', label: 'Relatorios', icon: IconChart }
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!profileMenuRef.current?.contains(target)) {
        setProfileMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [profileMenuOpen]);

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
        <div className="profile-menu-wrapper" ref={profileMenuRef}>
          {profileMenuOpen ? (
            <div className="profile-menu">
              <Link href="/configuracoes?section=conta" onClick={() => setProfileMenuOpen(false)}>
                <IconUser />
                <span>Minha conta</span>
              </Link>
              <Link href="/configuracoes?section=assinatura" onClick={() => setProfileMenuOpen(false)}>
                <IconDollar />
                <span>Assinatura</span>
              </Link>
              <Link
                href="/configuracoes?section=marcas"
                className={pathname.startsWith('/configuracoes') ? 'active' : ''}
                onClick={() => setProfileMenuOpen(false)}
              >
                <IconSettings />
                <span>Configuracoes</span>
              </Link>
              <div className="profile-menu-divider" />
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen(false);
                  router.push('/');
                }}
              >
                <IconLogout />
                <span>Sair</span>
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="avatar profile-trigger"
            aria-label="Abrir opcoes da conta"
            onClick={() => setProfileMenuOpen((prev) => !prev)}
          >
            IP
          </button>
        </div>
      </div>
    </aside>
  );
}
