# Oculto Pagamentos

Aplicacao independente de recebimentos via Pix, saldo e saques. Ela compartilha a conta Pagar.me com o gateway existente, mas usa um projeto Supabase proprio e nao altera a aplicacao atual.

## Deploy

1. Crie o projeto `Oculto Pagamentos` na Vercel e conecte-o a este repositorio.
2. Defina `oculto-pagamentos` como **Root Directory**.
3. Adicione o dominio `ocultopagamentos.com.br`.
4. Configure as variaveis listadas em `.env.example`.
5. Aplique a migration em `supabase/migrations/` no novo projeto Supabase.

Nunca envie `SUPABASE_SERVICE_ROLE_KEY` ou `PAGARME_API_KEY` ao navegador nem as versione no Git.
