'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { passwordPolicyError } from '@/lib/password-policy';
import { createSupabaseBrowserClient } from '@/lib/supabase';

export function PasswordRecoveryForm() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage('');
    try {
      const email = String(new FormData(event.currentTarget).get('email') || '').trim();
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/confirm?next=/redefinir-senha` });
      if (error) throw error;
      setMessage('Se o e-mail estiver cadastrado, enviaremos um link seguro para redefinir a senha.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível continuar.'); }
    finally { setLoading(false); }
  }

  return <main className="auth-page"><Link href="/" className="wordmark auth-mark"><span className="wordmark-mark" />oculto</Link><section className="auth-card"><p className="eyebrow">ACESSO À CONTA</p><h1>Redefina sua senha.</h1><p>Enviaremos um link temporário para o seu e-mail.</p><form onSubmit={submit}><label>E-mail<input name="email" type="email" autoComplete="email" required /></label><button className="button button-dark" disabled={loading}>{loading ? 'Enviando…' : 'Enviar link →'}</button></form>{message && <p className="auth-message">{message}</p>}<footer><Link href="/login">Voltar para entrar</Link></footer></section></main>;
}

export function PasswordUpdateForm() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage('');
    try {
      const form = new FormData(event.currentTarget);
      const password = String(form.get('password') || '');
      const confirm = String(form.get('confirm') || '');
      const passwordError = passwordPolicyError(password);
      if (passwordError) throw new Error(passwordError);
      if (password !== confirm) throw new Error('As senhas não coincidem.');
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage('Senha atualizada. Você já pode continuar usando sua conta.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível atualizar a senha.'); }
    finally { setLoading(false); }
  }

  return <div className="page-wrap narrow-page"><header className="page-header"><div><p className="eyebrow">SEGURANÇA</p><h1>Crie uma nova senha.</h1><p className="page-subtitle">Escolha uma senha forte, exclusiva desta conta.</p></div></header><section className="form-card"><form className="stack-form" onSubmit={submit}><label>Nova senha<input name="password" type="password" minLength={12} autoComplete="new-password" required /></label><label>Repita a nova senha<input name="confirm" type="password" minLength={12} autoComplete="new-password" required /></label><button className="button button-dark" disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar senha →'}</button></form>{message && <p className="inline-message">{message}</p>}</section></div>;
}
