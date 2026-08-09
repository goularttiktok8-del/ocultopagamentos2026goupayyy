import Image from 'next/image';
import Link from 'next/link';

const features = [
  ['01', 'Receba do seu jeito', 'Crie um link de pagamento Pix com valor fixo ou aberto. Quem paga vê a cobrança — não a sua conta bancária.'],
  ['02', 'Acompanhe seu saldo', 'Veja o que entrou, o que está em análise e o que já está disponível em uma visão direta.'],
  ['03', 'Saque com controle', 'Solicite o saque para a conta verificada no seu cadastro e acompanhe cada etapa da movimentação.'],
];

const steps = [
  ['Cadastro e KYC', 'Confirme seus dados e a conta de destino. A plataforma conhece quem utiliza o serviço.'],
  ['Link de recebimento', 'Defina uma descrição, escolha um valor ou deixe em aberto e compartilhe o link.'],
  ['Saldo e saque', 'Após a confirmação, acompanhe o saldo disponível e solicite a retirada quando precisar.'],
];

export default function HomePage() {
  return <main className="landing-shell">
    <nav className="landing-nav" aria-label="Navegação principal">
      <Link className="landing-brand" href="/"><i aria-hidden="true" />oculto</Link>
      <div className="landing-nav-actions"><Link href="/login" className="landing-login">Entrar</Link><Link href="/cadastro" className="landing-nav-cta">Criar conta <span>↗</span></Link></div>
    </nav>

    <section className="landing-hero">
      <div className="landing-hero-copy">
        <p className="landing-kicker"><span /> RECEBIMENTOS COM MAIS DISCRIÇÃO</p>
        <h1>Receba sem expor o que é seu.</h1>
        <p className="landing-lede">Uma camada simples entre você e o pagamento. Gere um Pix, acompanhe o saldo e saque para a sua conta verificada.</p>
        <div className="landing-hero-actions"><Link href="/cadastro" className="landing-button landing-button-light">Começar agora <span>→</span></Link><a href="#como-funciona" className="landing-text-link">Entenda como funciona <span>↓</span></a></div>
        <div className="landing-hero-meta"><span>PIX</span><span>CADASTRO VERIFICADO</span><span>SAQUES</span></div>
      </div>
      <div className="landing-art-wrap">
        <div className="landing-art-frame"><Image className="landing-art" src="/images/oculto-hero.png" alt="Composição abstrata em preto, branco e grafite" width={1122} height={1402} priority sizes="(max-width: 900px) 92vw, 43vw" /></div>
        <p className="landing-art-caption">Menos exposição.<br />Mais domínio.</p>
      </div>
    </section>

    <section className="landing-marquee" aria-label="Principais recursos"><span>RECEBER</span><i>✦</i><span>VISUALIZAR SALDO</span><i>✦</i><span>SACAR</span><i>✦</i><span>RECEBER</span><i>✦</i><span>VISUALIZAR SALDO</span></section>

    <section className="landing-intro" id="sobre">
      <p className="landing-section-label">A PROPOSTA</p>
      <div><h2>O dinheiro chega até você. Seus dados bancários não precisam chegar junto.</h2><p>Oculto foi feita para quem quer uma experiência objetiva ao receber valores: um link privado, um saldo claro e um caminho seguro para sacar. Sem criar produtos, vitrines ou ferramentas que você não vai usar.</p></div>
    </section>

    <section className="landing-features" aria-label="Recursos da plataforma">
      {features.map(([number, title, description]) => <article key={number}><p>{number}</p><h3>{title}</h3><span>{description}</span><b aria-hidden="true">↘</b></article>)}
    </section>

    <section className="landing-privacy">
      <div className="landing-privacy-graphic" aria-hidden="true"><span /><i /><b /></div>
      <div className="landing-privacy-copy"><p className="landing-section-label">PRIVACIDADE COM RESPONSABILIDADE</p><h2>A privacidade é para quem paga. A segurança é para todos.</h2><p>A Oculto não oferece anonimato: cada conta passa por cadastro, validação de identidade, análise de documentos e verificações de segurança. O objetivo é reduzir a exposição desnecessária — sem abrir mão dos controles que protegem a plataforma.</p><div className="landing-rule"><span>✓</span><p>Dados pessoais e bancários tratados apenas para a operação, conformidade e segurança da conta.</p></div></div>
    </section>

    <section className="landing-steps" id="como-funciona">
      <div className="landing-steps-heading"><p className="landing-section-label">COMO FUNCIONA</p><h2>Três movimentos.<br />Nenhuma distração.</h2></div>
      <ol>{steps.map(([title, description], index) => <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div><i aria-hidden="true">→</i></li>)}</ol>
    </section>

    <section className="landing-notes">
      <p>Para quem recebe pagamentos e prefere manter a vida financeira fora da conversa.</p>
      <div><span>LINK PIX</span><span>•</span><span>SALDO DISPONÍVEL</span><span>•</span><span>SAQUE VERIFICADO</span></div>
    </section>

    <section className="landing-final">
      <p className="landing-kicker"><span /> SUA CONTA, NO SEU RITMO</p><h2>Comece pelo essencial.</h2><p>Crie sua conta, conclua a verificação e deixe a Oculto cuidar da camada entre receber e movimentar.</p><Link href="/cadastro" className="landing-button landing-button-light">Criar conta gratuita <span>→</span></Link>
    </section>

    <footer className="landing-footer"><Link className="landing-brand" href="/"><i aria-hidden="true" />oculto</Link><p>Recebimentos simples, com mais discrição.</p><div><Link href="/login">Entrar</Link><Link href="/cadastro">Criar conta</Link></div></footer>
  </main>;
}
