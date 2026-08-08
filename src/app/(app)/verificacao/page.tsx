'use client';

import { useState } from 'react';
import { KycProfileForm } from '@/components/KycProfileForm';
import { kycLabel, useAccountSnapshot } from '@/hooks/use-account-snapshot';

export default function VerificationPage() {
  const { data, error, loading, refresh } = useAccountSnapshot();
  const [message, setMessage] = useState('');
  const [openingLink, setOpeningLink] = useState(false);
  const account = data?.account;
  const status = account?.kyc_status || 'not_started';
  const isComplete = status === 'approved';

  async function openKycLink() {
    setOpeningLink(true); setMessage('');
    try {
      const response = await fetch('/api/kyc/link', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const payload = await response.json() as { error?: string; url?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || 'Não foi possível abrir a prova de vida.');
      window.location.assign(payload.url);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível abrir a prova de vida.');
      setOpeningLink(false);
    }
  }

  return <div className="page-wrap narrow-page"><header className="page-header"><div><p className="eyebrow">VERIFICAÇÃO</p><h1>Confirme sua identidade.</h1><p className="page-subtitle">Isso mantém sua conta e todos os recebimentos protegidos.</p></div>{account && <span className={`account-state ${isComplete ? 'verified' : ''}`}><i /> {kycLabel(status)}</span>}</header>
    {error && <p className="inline-message error">{error}</p>}
    {loading && <section className="verification-card"><div className="empty-row">Carregando o estado da verificação…</div></section>}
    {!loading && status === 'not_started' && <section className="form-card kyc-card"><KycProfileForm onComplete={refresh} /></section>}
    {!loading && status === 'pending' && <section className="verification-card status-card"><div className="status-card-icon">◌</div><h2>Dados recebidos.</h2><p>Estamos aguardando a análise inicial do provedor. Assim que a prova de vida estiver disponível, esta página mostrará a próxima etapa.</p><button className="button button-ghost-dark" type="button" onClick={() => void refresh()}>Atualizar status</button></section>}
    {!loading && status === 'additional_documents_required' && <section className="verification-card status-card"><div className="status-card-icon">→</div><h2>Continue a prova de vida.</h2><p>O provedor liberou a etapa de biometria. O link é temporário e abre em ambiente seguro.</p><button className="button button-dark" type="button" disabled={openingLink} onClick={() => void openKycLink()}>{openingLink ? 'Abrindo…' : 'Continuar verificação'} <span>→</span></button></section>}
    {!loading && isComplete && <section className="verification-card status-card"><div className="status-card-icon success">✓</div><h2>Conta verificada.</h2><p>Sua conta está apta a criar recebimentos e solicitar saques para a conta de destino informada.</p></section>}
    {!loading && status === 'denied' && <section className="verification-card status-card"><div className="status-card-icon denied">!</div><h2>Não foi possível aprovar esta conta.</h2><p>Por segurança, recebimentos e saques permanecem indisponíveis. Entre em contato com o suporte caso precise de orientação.</p></section>}
    {message && <p className="inline-message">{message}</p>}<p className="legal-copy">A Oculto Pagamentos conhece e valida seus dados. A proposta é reduzir a exposição desnecessária deles a terceiros — não oferecer anonimato.</p>
  </div>;
}
