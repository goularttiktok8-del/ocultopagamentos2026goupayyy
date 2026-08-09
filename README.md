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
- Cada saque reserva o saldo em uma transação atômica antes de criar uma transferência idempotente para a conta bancária validada pelo KYC. Erros definitivos do provedor devolvem o saldo; falhas de rede ficam em processamento para impedir uma transferência duplicada.
- `PLATFORM_PIX_FEE_CENTS` é obrigatória para criar Pix e deve conter a taxa fixa, em centavos (por exemplo, `200` para R$ 2,00). O split credita ao usuário o valor líquido informado pela plataforma, enquanto a conta da plataforma arca com a tarifa de processamento da Pagar.me.
- No webhook Pagar.me, marque `recipient.updated`, `order.paid`, `order.payment_failed`, `order.canceled`, `charge.paid`, `charge.payment_failed`, `charge.refunded` e os eventos de transferência disponibilizados pela sua conta. O endpoint ignora eventos que não usa.

Nunca envie chaves privadas pelo chat nem as versione no Git.
