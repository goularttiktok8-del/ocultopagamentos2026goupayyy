'use client';

import Link from 'next/link';
import { formatDate, kycLabel, ledgerLabel, money, useAccountSnapshot } from '@/hooks/use-account-snapshot';

export default function DashboardPage() {
  const { data, error, loading } = useAccountSnapshot();
  const account = data?.account;
  const activity = data?.ledger.slice(0, 5) || [];

  return <div className="page-wrap dashboard-page">
    <header className="page-header"><div><p className="eyebrow">CONTA</p><h1>Seu dinheiro, sem ruído.</h1><p className="page-subtitle">Acompanhe o que entrou e decida quando sacar.</p></div>
      {account && <span className={`account-state ${account.kyc_status === 'approved' ? 'verified' : ''}`}><i /> {kycLabel(account.kyc_status)}</span>}
    </header>
    {error && <p className="inline-message error">{error}</p>}
    <section className="balance-panel">
      <div><p className="balance-label">Saldo disponível</p><p className="balance-value">{loading ? '—' : money.format((data?.available_cents || 0) / 100)}</p><p className="balance-note">{account?.kyc_status === 'approved' ? 'Seu saldo é atualizado conforme os pagamentos são confirmados.' : 'Conclua a verificação para receber e sacar.'}</p></div>
      <div className="balance-actions"><Link href="/receber" className="button button-light">Receber <span>↓</span></Link><Link href="/sacar" className="button button-ghost">Sacar <span>↑</span></Link></div>
    </section>
    <section className="metric-grid">
      <article className="metric"><p>Em análise</p><strong>{loading ? '—' : money.format((data?.pending_cents || 0) / 100)}</strong><small>Valores aguardando confirmação</small></article>
      <article className="metric"><p>Recebido este mês</p><strong>{loading ? '—' : money.format((data?.received_this_month_cents || 0) / 100)}</strong><small>Entradas liberadas na conta</small></article>
      <article className="metric"><p>Próxima ação</p><strong>{account?.kyc_status === 'approved' ? 'Receber' : 'Verificar'}</strong><Link href={account?.kyc_status === 'approved' ? '/receber' : '/verificacao'}>{account?.kyc_status === 'approved' ? 'Criar recebimento →' : 'Continuar cadastro →'}</Link></article>
    </section>
    <section className="section-block"><div className="section-heading"><div><h2>Atividade recente</h2><p>Suas movimentações confirmadas aparecem aqui.</p></div><Link href="/movimentacoes">Ver todas →</Link></div><div className="activity-list">
      {loading && <div className="empty-row">Carregando movimentações…</div>}
      {!loading && activity.length === 0 && <div className="empty-row">Ainda não há movimentações na conta.</div>}
      {activity.map((row) => <div className="activity-row" key={row.id}><span className={`activity-icon ${row.direction === 'credit' ? 'in' : 'out'}`}>{row.direction === 'credit' ? '↓' : '↑'}</span><div><strong>{ledgerLabel(row.entry_type, row.direction)}</strong><small>{formatDate(row.occurred_at)}</small></div><b className={row.direction === 'credit' ? 'in' : 'out'}>{row.direction === 'credit' ? '+ ' : '− '}{money.format(Number(row.amount_cents) / 100)}</b></div>)}
    </div></section>
  </div>;
}
