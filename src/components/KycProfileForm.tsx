'use client';

import { FormEvent, useState } from 'react';

export function KycProfileForm({ onComplete }: { onComplete: () => Promise<void> }) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setMessage('');
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      const response = await fetch('/api/kyc/profile', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar seus dados.');
      setMessage('Dados enviados. Acompanhe o andamento desta verificação nesta tela.');
      await onComplete();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível enviar seus dados.');
    } finally { setSubmitting(false); }
  }

  return <form className="kyc-form" onSubmit={submit}>
    <div className="kyc-section"><h2>Dados pessoais</h2><p>Usados exclusivamente para identificar a sua conta junto ao provedor regulado.</p><div className="field-grid"><label className="field-span-2">Nome completo<input name="name" minLength={3} maxLength={120} autoComplete="name" required /></label><label>CPF<input name="document" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" required /></label><label>Data de nascimento<input name="birthdate" type="date" autoComplete="bday" required /></label><label className="field-span-2">Nome completo da mãe<input name="motherName" minLength={3} maxLength={120} autoComplete="off" required /></label><label>Renda mensal aproximada<div className="money-input"><span>R$</span><input name="monthlyIncome" inputMode="decimal" placeholder="0,00" required /></div></label><label>Ocupação<input name="occupation" minLength={2} maxLength={80} required /></label><label>DDD<input name="phoneDdd" inputMode="numeric" placeholder="11" required /></label><label>Celular<input name="phoneNumber" inputMode="numeric" placeholder="999999999" autoComplete="tel-national" required /></label></div></div>
    <div className="kyc-section"><h2>Endereço</h2><div className="field-grid"><label>CEP<input name="zipCode" inputMode="numeric" autoComplete="postal-code" required /></label><label>UF<select name="state" defaultValue=""><option value="" disabled>Selecione</option>{['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map((state) => <option key={state}>{state}</option>)}</select></label><label className="field-span-2">Logradouro<input name="street" minLength={2} maxLength={100} autoComplete="street-address" required /></label><label>Número<input name="streetNumber" maxLength={20} required /></label><label>Complemento<input name="complementary" maxLength={80} placeholder="Ex.: apto 12" required /></label><label>Bairro<input name="neighborhood" minLength={2} maxLength={80} required /></label><label>Cidade<input name="city" minLength={2} maxLength={80} autoComplete="address-level2" required /></label><label className="field-span-2">Ponto de referência<input name="referencePoint" minLength={2} maxLength={100} placeholder="Ex.: Próximo à praça central" required /></label></div></div>
    <div className="kyc-section"><h2>Conta de destino</h2><p>Os dados são enviados diretamente ao provedor de pagamentos. A Oculto armazena apenas os últimos quatro dígitos para sua referência.</p><div className="field-grid"><label>Código do banco<input name="bankCode" inputMode="numeric" placeholder="341" required /></label><label>Tipo de conta<select name="accountType" defaultValue="checking"><option value="checking">Corrente</option><option value="savings">Poupança</option></select></label><label>Agência<input name="branchNumber" inputMode="numeric" required /></label><label>Dígito da agência <span className="optional">se houver</span><input name="branchCheckDigit" inputMode="numeric" maxLength={1} placeholder="Opcional" /></label><label>Conta<input name="accountNumber" inputMode="numeric" required /></label><label>Dígito da conta<input name="accountCheckDigit" inputMode="numeric" maxLength={1} required /></label></div></div>
    <label className="consent-line"><input type="checkbox" required /> <span>Confirmo que os dados são verdadeiros e autorizo a validação de identidade e conta para uso da plataforma.</span></label><button className="button button-dark" disabled={submitting}>{submitting ? 'Enviando com segurança…' : 'Enviar para verificação'} <span>→</span></button>{message && <p className="inline-message">{message}</p>}
  </form>;
}
