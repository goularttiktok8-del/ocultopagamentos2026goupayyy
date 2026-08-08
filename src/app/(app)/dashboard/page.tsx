import Link from 'next/link';

const activity = [
  { title: 'Pagamento recebido', detail: 'Hoje, 14:32', amount: '+ R$ 280,00', kind: 'in' },
  { title: 'Saldo liberado', detail: 'Hoje, 10:18', amount: '+ R$ 94,50', kind: 'in' },
  { title: 'Saque enviado', detail: 'Ontem, 17:46', amount: '− R$ 150,00', kind: 'out' },
];

export default function DashboardPage() {
  return <div className="page-wrap dashboard-page">
    <header className="page-header"><div><p className="eyebrow">CONTA</p><h1>Seu dinheiro, sem ruído.</h1><p className="page-subtitle">Acompanhe o que entrou e decida quando sacar.</p></div><span className="account-state"><i /> Verificação pendente</span></header>
    <section className="balance-panel">
      <div><p className="balance-label">Saldo disponível</p><p className="balance-value">R$ 0,00</p><p className="balance-note">Conclua a verificação para receber e sacar.</p></div>
      <div className="balance-actions"><Link href="/receber" className="button button-light">Receber <span>↓</span></Link><Link href="/sacar" className="button button-ghost">Sacar <span>↑</span></Link></div>
    </section>
    <section className="metric-grid">
      <article className="metric"><p>Em análise</p><strong>R$ 0,00</strong><small>Valores aguardando liberação</small></article>
      <article className="metric"><p>Recebido este mês</p><strong>R$ 0,00</strong><small>Após descontos aplicáveis</small></article>
      <article className="metric"><p>Próxima ação</p><strong>Verificar</strong><Link href="/verificacao">Continuar cadastro →</Link></article>
    </section>
    <section className="section-block"><div className="section-heading"><div><h2>Atividade recente</h2><p>Suas últimas movimentações aparecem aqui.</p></div><Link href="/movimentacoes">Ver todas →</Link></div><div className="activity-list">
      {activity.map((row) => <div className="activity-row" key={row.title}><span className={`activity-icon ${row.kind}`}>{row.kind === 'in' ? '↓' : '↑'}</span><div><strong>{row.title}</strong><small>{row.detail}</small></div><b className={row.kind}>{row.amount}</b></div>)}
    </div></section>
  </div>;
}
