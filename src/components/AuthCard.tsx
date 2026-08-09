'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { passwordPolicyError } from '@/lib/password-policy';
import { createSupabaseBrowserClient } from '@/lib/supabase';

export function AuthCard({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const signup = mode === 'signup';
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const supabase = createSupabaseBrowserClient();
      const email = String(form.get('email') || '').trim();
      const password = String(form.get('password') || '');
      if (signup) {
        const passwordError = passwordPolicyError(password);
        if (passwordError) throw new Error(passwordError);
        const displayName = String(form.get('display_name') || '').trim();
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName }, emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard` } });
        if (error) throw error;
        setMessage('Enviamos um link de confirmação para o seu e-mail.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/dashboard');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível continuar.'); }
    finally { setLoading(false); }
  }

  return <main className="auth-page"><Link href="/" className="wordmark auth-mark"><span className="wordmark-mark" />oculto</Link><section className="auth-card"><p className="eyebrow">{signup ? 'CRIAR CONTA' : 'ACESSAR CONTA'}</p><h1>{signup ? 'Comece com calma.' : 'Bom te ver por aqui.'}</h1><p>{signup ? 'Uma conta simples para receber, acompanhar e sacar.' : 'Entre para ver o que está disponível na sua conta.'}</p><form onSubmit={submit}>{signup && <label>Nome<input name="display_name" minLength={2} maxLength={120} required /></label>}<label>E-mail<input name="email" type="email" autoComplete="email" required /></label><label>Senha<input name="password" type="password" minLength={12} autoComplete={signup ? 'new-password' : 'current-password'} required /></label><button className="button button-dark" disabled={loading}>{loading ? 'Aguarde…' : signup ? 'Criar conta →' : 'Entrar →'}</button></form>{message && <p className="auth-message">{message}</p>}<footer>{signup ? <>Já possui uma conta? <Link href="/login">Entrar</Link></> : <>Ainda não possui uma conta? <Link href="/cadastro">Criar conta</Link><br /><Link href="/recuperar-senha">Esqueci minha senha</Link></>}</footer></section></main>;
}
