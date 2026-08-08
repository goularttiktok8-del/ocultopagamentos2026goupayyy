'use client';

import { formatDate, ledgerLabel, money, useAccountSnapshot } from '@/hooks/use-account-snapshot';

export default function MovementsPage() {
  const { data, error, loading } = useAccountSnapshot();
  return <div className="page-wrap"><header className="page-header"><div><p className="eyebrow">MOVIMENTAÇÕES</p><h1>Histórico da conta.</h1><p className="page-subtitle">Entradas, valores liberados e saques, em um só lugar.</p></div><span className="filter-button">Últimas 50</span></header>
    {error && <p className="inline-message error">{error}</p>}
    <section className="table-card"><div className="table-head"><span>Movimentação</span><span>Data</span><span>Valor</span></div>
      {loading && <div className="empty-row">Carregando movimentações…</div>}
      {!loading && data?.ledger.length === 0 && <div className="empty-row">Ainda não há movimentações na conta.</div>}
      {data?.ledger.map((row) => <div className="table-row" key={row.id}><strong>{ledgerLabel(row.entry_type, row.direction)}</strong><span className="muted">{formatDate(row.occurred_at)}</span><b className={row.direction === 'credit' ? 'in' : 'out'}>{row.direction === 'credit' ? '+ ' : '− '}{money.format(Number(row.amount_cents) / 100)}</b></div>)}
    </section>
  </div>;
}
