'use client';

import { useState } from 'react';

export default function ReceivePage() {
  const [amount, setAmount] = useState('');
  return <div className="page-wrap narrow-page"><header className="page-header"><div><p className="eyebrow">RECEBER</p><h1>Crie um recebimento.</h1><p className="page-subtitle">Defina um valor ou deixe o pagamento em aberto.</p></div></header>
    <section className="form-card"><label>Descrição<input maxLength={80} placeholder="Ex.: Acerto de serviço" /></label><label>Valor <span className="optional">opcional</span><div className="money-input"><span>R$</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0,00" /></div></label><label className="checkline"><input type="checkbox" /> <span>Permitir apenas um pagamento</span></label><button className="button button-dark" type="button">Gerar link de recebimento <span>→</span></button><p className="form-hint">O link será criado após a verificação da sua conta.</p></section>
    <section className="quiet-note"><span>◒</span><p>Quem paga vê a cobrança. Seus dados bancários não são exibidos na plataforma.</p></section>
  </div>;
}
