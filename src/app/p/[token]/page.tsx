'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

type PaymentView = {
  payment_request: { label: string; amount_cents: number | null; expires_at: string | null };
  payment: { status: string; amount_cents: number; pix_qr_code: string | null; pix_expires_at: string | null } | null;
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PublicPaymentPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const [data, setData] = useState<PaymentView | null>(null);
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`/api/public/payment-requests/${encodeURIComponent(token)}`, { cache: 'no-store' });
      const payload = await response.json() as PaymentView & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Cobrança indisponível.');
      setData(payload);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Cobrança indisponível.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (data?.payment?.status !== 'pending') return;
    const interval = window.setInterval(() => { void load(); }, 10_000);
    return () => window.clearInterval(interval);
  }, [data?.payment?.status, load]);

  const paymentIsPaid = data?.payment?.status === 'paid';
  const displayedAmount = data?.payment?.amount_cents ?? data?.payment_request.amount_cents ?? null;
  const hasPix = Boolean(data?.payment?.pix_qr_code && !paymentIsPaid);
  const fixedAmount = data?.payment_request.amount_cents !== null;
  const expiresLabel = useMemo(() => data?.payment?.pix_expires_at
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.payment.pix_expires_at))
    : '', [data?.payment?.pix_expires_at]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setMessage('');
    try {
      const response = await fetch(`/api/public/payment-requests/${encodeURIComponent(token)}/pix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, payer: { name, email, document, phone } }),
      });
      const payload = await response.json() as { payment?: PaymentView['payment']; error?: string };
      const payment = payload.payment;
      if (!response.ok || !payment) throw new Error(payload.error || 'Não foi possível gerar o Pix.');
      setData((current) => current ? { ...current, payment } : current);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível gerar o Pix.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPix() {
    if (!data?.payment?.pix_qr_code) return;
    await navigator.clipboard.writeText(data.payment.pix_qr_code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  return <main className="public-payment-page"><section className="public-payment-card">
    <a className="public-wordmark" href="/">oculto<span>.</span></a>
    {loading && <p className="public-muted">Carregando cobrança…</p>}
    {!loading && message && !data && <p className="public-error">{message}</p>}
    {data && <>
      <p className="public-kicker">PAGAMENTO PIX</p>
      <h1>{paymentIsPaid ? 'Pagamento confirmado.' : data.payment_request.label}</h1>
      {displayedAmount !== null && <strong className="public-amount">{money.format(displayedAmount / 100)}</strong>}
      {paymentIsPaid ? <p className="public-success">Seu pagamento foi confirmado. Você já pode fechar esta página.</p> : hasPix ? <div className="pix-panel">
        <p>Abra o app do seu banco, escolha Pix Copia e Cola e use o código abaixo.</p>
        <textarea readOnly aria-label="Código Pix" value={data.payment?.pix_qr_code || ''} />
        <button className="public-button" type="button" onClick={() => void copyPix()}>{copied ? 'Código copiado' : 'Copiar código Pix'}</button>
        {expiresLabel && <small>Este Pix expira em {expiresLabel}.</small>}
        <p className="public-muted">A confirmação aparece automaticamente após o pagamento.</p>
      </div> : <form className="public-form" onSubmit={submit}>
        <p className="public-description">Preencha seus dados para gerar um Pix. Os dados bancários de quem recebe não são exibidos.</p>
        {!fixedAmount && <label>Valor <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0,00" required /></label>}
        <label>Seu nome <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>
        <label>Seu e-mail <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required /></label>
        <label>Seu CPF <input value={document} onChange={(event) => setDocument(event.target.value)} inputMode="numeric" autoComplete="off" required /></label>
        <label>Seu celular <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" required /></label>
        <button className="public-button" type="submit" disabled={submitting}>{submitting ? 'Gerando Pix…' : 'Gerar Pix'}</button>
      </form>}
      {message && <p className="public-error">{message}</p>}
    </>}
    <footer>Pagamento processado de forma segura.</footer>
  </section></main>;
}
