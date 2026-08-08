'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/dashboard', label: 'Visão geral', glyph: '◌' },
  { href: '/receber', label: 'Receber', glyph: '↓' },
  { href: '/movimentacoes', label: 'Movimentações', glyph: '↕' },
  { href: '/sacar', label: 'Sacar', glyph: '↑' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="wordmark" aria-label="Oculto Pagamentos">
          <span className="wordmark-mark" />
          <span>oculto</span>
        </Link>
        <nav aria-label="Navegação principal">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={`nav-link ${pathname === link.href ? 'active' : ''}`}>
              <span className="nav-glyph" aria-hidden>{link.glyph}</span>{link.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/verificacao" className={`verification-link ${pathname === '/verificacao' ? 'active' : ''}`}>
            <span className="status-dot" /> Verificação
          </Link>
          <button className="profile-mini" type="button">
            <span>OP</span><span className="profile-mini-copy"><strong>Minha conta</strong><small>Conta pessoal</small></span>
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
