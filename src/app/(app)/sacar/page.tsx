'use client';

import { FormEvent, useState } from 'react';
import { money, useAccountSnapshot } from '@/hooks/use-account-snapshot';

function withdrawalLabel(status: string) {
  if (status === 'processing') return 'Processando transferência';
  if (status === 'paid') return 'Enviado';
  if (status === 'failed') return 'Não enviado — saldo devolvido';
  return 'Solicitado';
}

export default function WithdrawPage() {
  const { data, loading, refresh } = useAccountSnapshot();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const account = data?.account;
  const eligible = account?.status === 'active' && account.kyc_status === 'approved' && Boolean(account.payout_key_last4);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setMessage('');
    try {
      const response = await fetch('/api/withdrawals', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível solicitar o saque.');
      setAmount('');
      setMessage('Saque enviado. Acompanhe abaixo enquanto o provedor confirma a transferência.');
      await refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível solicitar o saque.');
    } finally { setSubmitting(false); }
  }

  return <div className="page-wrap narrow-page"><header className="page-header"><div><p className="eyebrow">SACAR</p><h1>Envie seu saldo.</h1><p className="page-subtitle">O saque segue para a conta de destino verificada.</p></div></header>
    <section className="withdraw-card"><div className="available-line"><span>Disponível para saque</span><strong>{loading ? '—' : money.format((data?.available_cents || 0) / 100)}</strong></div><form className="stack-form" onSubmit={submit}><label>Quanto deseja sacar?<div className="money-input large"><span>R$</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0,00" /></div></label><div className="key-preview"><span>Conta de destino</span><b>{account?.payout_key_last4 ? `Conta verificada •••• ${account.payout_key_last4}` : 'Cadastre a conta durante a verificação'}</b></div><button type="submit" className="button button-dark" disabled={!eligible || submitting || loading || (data?.available_cents || 0) < 100}>{submitting ? 'Enviando…' : 'Solicitar saque'} <span>↑</span></button></form><p className="form-hint">{eligible ? 'O saque é enviado somente para a conta bancária verificada no seu cadastro.' : 'A verificação da conta é necessária antes de sacar.'}</p>{message && <p className="inline-message">{message}</p>}</section>
    {!loading && (data?.withdrawals.length || 0) > 0 && <section className="section-block compact-section"><div className="section-heading"><div><h2>Saques recentes</h2><p>Acompanhe o estado de cada solicitação.</p></div></div><div className="activity-list">{data?.withdrawals.slice(0, 5).map((withdrawal) => <div className="activity-row" key={withdrawal.id}><span className="activity-icon out">↑</span><div><strong>Saque</strong><small>{withdrawalLabel(withdrawal.status)}</small></div><b className="out">− {money.format(Number(withdrawal.amount_cents) / 100)}</b></div>)}</div></section>}
  </div>;
}
