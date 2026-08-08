const rows = [
  ['Pagamento recebido', 'Aguardando pagamento', 'R$ 0,00'],
  ['Saldo disponível', 'Nenhuma movimentação', 'R$ 0,00'],
  ['Saque', 'Nenhuma movimentação', 'R$ 0,00'],
];

export default function MovementsPage() {
  return <div className="page-wrap"><header className="page-header"><div><p className="eyebrow">MOVIMENTAÇÕES</p><h1>Histórico da conta.</h1><p className="page-subtitle">Entradas, valores em análise e saques, em um só lugar.</p></div><button className="filter-button">Últimos 30 dias <span>⌄</span></button></header>
    <section className="table-card"><div className="table-head"><span>Movimentação</span><span>Estado</span><span>Valor</span></div>{rows.map((row) => <div className="table-row" key={row[0]}><strong>{row[0]}</strong><span className="muted">{row[1]}</span><b>{row[2]}</b></div>)}</section>
  </div>;
}
