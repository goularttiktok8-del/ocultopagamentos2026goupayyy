# Oculto Pagamentos

Aplicação independente para cadastro/KYC, recebimentos, saldo e saques. Ela pode usar a mesma conta Pagar.me do gateway existente, mas usa banco, repositório, deploy e domínio próprios. O gateway atual não é alterado.

## Deploy inicial

1. Na Vercel, conecte este repositório e deixe **Root Directory** vazio.
2. Mantenha o preset **Next.js** e não defina `Output Directory` manualmente.
3. Use `https://www.ocultopagamentos.com.br` como URL canônica da aplicação.
4. No Supabase Auth, defina a Site URL como `https://www.ocultopagamentos.com.br` e inclua estes Redirect URLs:
   - `https://www.ocultopagamentos.com.br/auth/confirm`
   - `https://ocultopagamentos.com.br/auth/confirm`
5. Cadastre na Vercel as variáveis de `.env.example`. Variáveis sem `NEXT_PUBLIC_` são exclusivas do servidor.

## Segurança operacional

- `SUPABASE_SECRET_KEY` (ou, temporariamente, `SUPABASE_SERVICE_ROLE_KEY`) nunca vai para o navegador ou Git.
- Configure o webhook Pagar.me em `https://www.ocultopagamentos.com.br/api/webhooks/pagarme` com assinatura HMAC ou Basic Auth. Sem uma dessas proteções, o endpoint rejeita o evento.
- O fluxo de KYC cria o recebedor Pagar.me no servidor, sem persistir CPF, endereço ou dados bancários brutos na base do app.
- Saques são reservados em uma transação atômica e entram em `pending_review`; o envio bancário só deve ser ativado depois de definir a operação administrativa e a regra de tarifas.
- `PAYMENT_COLLECTIONS_ENABLED` começa como `false`. Não habilite recebimentos reais até definir o split/quem arca com a tarifa do Pix e concluir o endpoint de checkout e seus webhooks.

Nunca envie chaves privadas pelo chat nem as versione no Git.
