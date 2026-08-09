import { NextRequest } from 'next/server';
import {
  ApiError,
  apiError,
  assertSmallJsonRequest,
  limitRequest,
  noStoreJson,
  parseAmountToCents,
  requireAuthenticatedUser,
  requireSameOrigin,
  sha256,
} from '@/lib/api-security';
import { createIndividualRecipient, PagarmeError } from '@/lib/pagarme';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

const brazilianStates = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);

function text(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'string') throw new ApiError(`Informe ${label}.`, 400);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < min || normalized.length > max) throw new ApiError(`Informe ${label}.`, 400);
  return normalized;
}

function digits(value: unknown, label: string, min: number, max: number) {
  const normalized = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  if (normalized.length < min || normalized.length > max) throw new ApiError(`Informe ${label}.`, 400);
  return normalized;
}

function optionalDigits(value: unknown, label: string, max: number) {
  const normalized = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  if (!normalized) return undefined;
  if (normalized.length > max) throw new ApiError(`Informe ${label}.`, 400);
  return normalized;
}

function isValidCpf(cpf: string) {
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const checkDigit = (length: number) => {
    const sum = cpf.slice(0, length).split('').reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return checkDigit(9) === Number(cpf[9]) && checkDigit(10) === Number(cpf[10]);
}

function validBirthdate(value: unknown) {
  const birthdate = typeof value === 'string' ? value : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) throw new ApiError('Informe uma data de nascimento válida.', 400);
  const parsed = new Date(`${birthdate}T12:00:00Z`);
  const now = new Date();
  const minimumDate = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
  if (Number.isNaN(parsed.valueOf()) || parsed > minimumDate) throw new ApiError('É necessário ter ao menos 18 anos.', 400);
  return birthdate;
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    assertSmallJsonRequest(request, 16_000);
    limitRequest(request, 'kyc-profile', 3);
    const user = await requireAuthenticatedUser();
    if (!user.email || !user.email_confirmed_at) throw new ApiError('Confirme seu e-mail antes de iniciar a verificação.', 409);
    const body = await request.json() as Record<string, unknown>;

    const document = digits(body.document, 'um CPF válido', 11, 11);
    if (!isValidCpf(document)) throw new ApiError('Informe um CPF válido.', 400);
    const state = text(body.state, 'a UF', 2, 2).toUpperCase();
    if (!brazilianStates.has(state)) throw new ApiError('Informe uma UF válida.', 400);
    const monthlyIncome = parseAmountToCents(typeof body.monthlyIncome === 'string' ? body.monthlyIncome : '');
    if (monthlyIncome === null) throw new ApiError('Informe a renda mensal.', 400);

    const input = {
      name: text(body.name, 'seu nome completo', 3, 120),
      document,
      birthdate: validBirthdate(body.birthdate),
      motherName: text(body.motherName, 'o nome da mãe', 3, 120),
      monthlyIncome,
      occupation: text(body.occupation, 'sua ocupação', 2, 80),
      address: {
        street: text(body.street, 'o logradouro', 2, 100),
        complementary: text(body.complementary, 'o complemento', 1, 80),
        streetNumber: text(body.streetNumber, 'o número do endereço', 1, 20),
        neighborhood: text(body.neighborhood, 'o bairro', 2, 80),
        city: text(body.city, 'a cidade', 2, 80),
        state,
        zipCode: digits(body.zipCode, 'o CEP', 8, 8),
      },
      phone: {
        ddd: digits(body.phoneDdd, 'o DDD', 2, 2),
        number: digits(body.phoneNumber, 'o telefone', 8, 9),
      },
      bankAccount: {
        bank: digits(body.bankCode, 'o código do banco', 3, 3),
        branchNumber: digits(body.branchNumber, 'a agência', 1, 6),
        branchCheckDigit: optionalDigits(body.branchCheckDigit, 'o dígito da agência', 1),
        accountNumber: digits(body.accountNumber, 'a conta', 1, 13),
        accountCheckDigit: digits(body.accountCheckDigit, 'o dígito da conta', 1, 1),
        type: body.accountType === 'savings' ? 'savings' as const : 'checking' as const,
      },
    };

    const admin = createSupabaseAdminClient();
    const { data: account, error: accountError } = await admin.from('accounts')
      .select('id, pagarme_recipient_id, status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (accountError || !account) throw new ApiError('Não foi possível localizar sua conta.', 404);
    if (account.pagarme_recipient_id || account.status !== 'pending_profile') {
      throw new ApiError('Esta conta já possui um processo de verificação em andamento.', 409);
    }

    const recipient = await createIndividualRecipient({
      code: `oculto_${account.id.replaceAll('-', '')}`.slice(0, 52),
      email: user.email,
      ...input,
    });

    const { error: updateError } = await admin.from('accounts').update({
      display_name: input.name,
      document_hash: sha256(input.document),
      document_last4: input.document.slice(-4),
      payout_key_last4: input.bankAccount.accountNumber.slice(-4).padStart(4, '0'),
      pagarme_recipient_id: recipient.id,
      status: recipient.status === 'active' ? 'active' : 'pending_kyc',
      kyc_status: recipient.status === 'active' ? 'approved' : 'pending',
      kyc_status_reason: null,
      updated_at: new Date().toISOString(),
    }).eq('id', account.id);
    if (updateError) throw new ApiError('Não foi possível registrar o processo de verificação.', 500);

    await Promise.all([
      admin.from('kyc_events').insert({
        account_id: account.id,
        status: recipient.status === 'active' ? 'approved' : 'pending',
        provider_event_id: `${recipient.id}:created`,
      }),
      admin.from('audit_events').insert({
        account_id: account.id,
        actor_user_id: user.id,
        event_type: 'kyc.profile_submitted',
        entity_type: 'account',
        entity_id: account.id,
      }),
    ]);

    return noStoreJson({ status: recipient.status === 'active' ? 'approved' : 'pending' }, { status: 201 });
  } catch (error) {
    if (error instanceof PagarmeError) return noStoreJson({ error: error.message }, { status: error.status || 503 });
    return apiError(error);
  }
}
