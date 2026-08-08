'use client';

import { FormEvent, useState } from 'react';
import { money, useAccountSnapshot } from '@/hooks/use-account-snapshot';

export default function ReceivePage() {
  const { data, loading, refresh } = useAccountSnapshot();
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [singleUse, setSingleUse] = useState(true);
  const [createdUrl, setCreatedUrl] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setMessage(''); setCreatedUrl('');
    try {
      const response = await fetch('/api/payment-requests', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, amount, singleUse }),
      });
      const payload = await response.json() as { error?: string; public_url?: string };
      if (!response.ok || !payload.public_url) throw new Error(payload.error || 'Não foi possível criar o recebimento.');
      setCreatedUrl(payload.public_url);
      setMessage('Link criado. Copie e envie somente para quem vai pagar.');
      await refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível criar o recebimento.');
    } finally { setSubmitting(false); }
  }

  const isVerified = data?.account.kyc_status === 'approved' && data.account.status === 'active';
  return <div className="page-wrap narrow-page"><header className="page-header"><div><p className="eyebrow">RECEBER</p><h1>Crie um recebimento.</h1><p className="page-subtitle">Defina o valor e gere um link privado para o pagamento.</p></div></header>
    <section className="form-card"><form className="stack-form" onSubmit={submit}><label>Descrição<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} minLength={2} placeholder="Ex.: Acerto de serviço" required /></label><label>Valor <span className="optional">opcional</span><div className="money-input"><span>R$</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0,00" /></div></label><label className="checkline"><input checked={singleUse} onChange={(event) => setSingleUse(event.target.checked)} type="checkbox" /> <span>Encerrar este link após o primeiro pagamento</span></label><button className="button button-dark" type="submit" disabled={submitting || loading || !isVerified}>{submitting ? 'Criando…' : 'Gerar link de recebimento'} <span>→</span></button></form><p className="form-hint">{isVerified ? 'O recebimento é liberado somente para contas verificadas.' : 'Conclua a verificação da conta antes de gerar um link.'}</p>{message && <p className="inline-message">{message}</p>}{createdUrl && <div className="created-link"><a href={createdUrl} target="_blank" rel="noreferrer">{createdUrl}</a><button type="button" className="copy-button" onClick={() => void navigator.clipboard.writeText(createdUrl)}>Copiar</button></div>}</section>
    <section className="quiet-note"><span>◒</span><p>Quem paga vê apenas a cobrança. Seus dados bancários não são exibidos no link.</p></section>
    {!loading && (data?.payment_requests.length || 0) > 0 && <section className="section-block compact-section"><div className="section-heading"><div><h2>Recebimentos recentes</h2><p>Links criados por esta conta.</p></div></div><div className="activity-list">{data?.payment_requests.slice(0, 5).map((request) => <div className="activity-row" key={request.id}><span className="activity-icon in">↓</span><div><strong>{request.label}</strong><small>{request.status === 'paid' ? 'Pago' : 'Aguardando pagamento'}</small></div><b>{request.amount_cents ? money.format(Number(request.amount_cents) / 100) : 'Valor aberto'}</b></div>)}</div></section>}
  </div>;
}
