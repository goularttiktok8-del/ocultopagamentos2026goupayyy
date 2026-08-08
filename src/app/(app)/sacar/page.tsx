export default function WithdrawPage() {
  return <div className="page-wrap narrow-page"><header className="page-header"><div><p className="eyebrow">SACAR</p><h1>Envie seu saldo.</h1><p className="page-subtitle">O saque é enviado para a chave Pix verificada da sua conta.</p></div></header>
    <section className="withdraw-card"><div className="available-line"><span>Disponível para saque</span><strong>R$ 0,00</strong></div><label>Quanto deseja sacar?<div className="money-input large"><span>R$</span><input inputMode="decimal" placeholder="0,00" /></div></label><div className="key-preview"><span>Chave Pix</span><b>Cadastre sua chave após a verificação</b></div><button type="button" className="button button-dark" disabled>Solicitar saque <span>↑</span></button><p className="form-hint">A solicitação passa por validação de segurança antes do envio.</p></section>
  </div>;
}
