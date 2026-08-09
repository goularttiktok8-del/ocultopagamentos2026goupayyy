type PagarmeRecipient = { id: string; status?: string; kyc_details?: { status?: string; status_reason?: string } };
type PagarmeKycLink = { url: string; expiration_date?: string };

export type PagarmePixOrder = {
  id: string;
  status?: string;
  charges?: Array<{
    id?: string;
    status?: string;
    last_transaction?: {
      qr_code?: string;
      qr_code_url?: string;
      expires_at?: string;
    };
  }>;
};

export type PagarmeTransfer = { id: string; status?: string };

export type PagarmeIndividualRecipientInput = {
  code: string;
  name: string;
  email: string;
  document: string;
  birthdate: string;
  motherName: string;
  monthlyIncome: number;
  occupation: string;
  address: {
    street: string;
    complementary: string;
    streetNumber: string;
    neighborhood: string;
    city: string;
    referencePoint: string;
    state: string;
    zipCode: string;
  };
  phone: { ddd: string; number: string };
  bankAccount: {
    bank: string;
    branchNumber: string;
    branchCheckDigit?: string;
    accountNumber: string;
    accountCheckDigit: string;
    type: 'checking' | 'savings';
  };
};

export class PagarmeError extends Error {
  constructor(message = 'Não foi possível falar com o provedor de pagamentos.', public readonly status?: number) {
    super(message);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeProviderMessage(value: unknown) {
  if (typeof value !== 'string') return undefined;
  return value
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[redacted-email]')
    .replace(/\b(?:sk|pk)_[a-z0-9_-]+\b/gi, '[redacted-key]')
    .replace(/(?:\d[ .-]?){8,}\d/g, '[redacted-number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300) || undefined;
}

function providerErrorSummary(value: unknown) {
  const body = asRecord(value);
  const errors = asRecord(body?.errors);
  const message = body?.message ?? body?.error ?? body?.error_message ?? value;

  return {
    provider_code: typeof body?.code === 'string' ? body.code : undefined,
    provider_type: typeof body?.type === 'string' ? body.type : undefined,
    provider_message: safeProviderMessage(message),
    // Field names help identify an invalid payload without storing personal or bank data in logs.
    error_fields: errors ? Object.keys(errors).slice(0, 20) : [],
  };
}

function apiKey() {
  const key = process.env.PAGARME_API_KEY?.trim();
  if (!key) throw new PagarmeError('O provedor de pagamentos ainda não foi configurado.');
  return key;
}

function formatBirthdateForPagarme(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

async function pagarmeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const credentials = Buffer.from(`${apiKey()}:`).toString('base64');
  const response = await fetch(`https://api.pagar.me/core/v5${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${credentials}`,
      'User-Agent': 'OcultoPagamentos/1.0',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    const rawProviderBody = await response.text();
    let providerBody: unknown = rawProviderBody;
    try {
      providerBody = JSON.parse(rawProviderBody) as unknown;
    } catch {
      // Some provider errors use plain text rather than JSON.
    }
    console.error('[pagarme] request rejected', {
      endpoint: path.startsWith('/recipients/') ? '/recipients/:id/kyc_link' : path,
      status: response.status,
      content_type: response.headers.get('content-type')?.split(';')[0],
      ...providerErrorSummary(providerBody),
    });
    throw new PagarmeError('O provedor não aceitou esta solicitação.', response.status);
  }
  return response.json() as Promise<T>;
}

export async function createPixOrder(input: {
  code: string;
  amountCents: number;
  label: string;
  payer: { name: string; email: string; document: string; phone: { ddd: string; number: string } };
  recipientId: string;
  platformRecipientId: string;
  platformFeeCents: number;
  idempotencyKey: string;
  paymentId: string;
  paymentRequestId: string;
}) {
  if (input.platformFeeCents < 0 || input.platformFeeCents >= input.amountCents) {
    throw new PagarmeError('A taxa configurada para o recebimento é inválida.');
  }
  if (!input.recipientId || !input.platformRecipientId || input.recipientId === input.platformRecipientId) {
    throw new PagarmeError('A configuração de recebimento da plataforma está incompleta.');
  }

  const recipientAmount = input.amountCents - input.platformFeeCents;
  return pagarmeRequest<PagarmePixOrder>('/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': input.idempotencyKey },
    body: JSON.stringify({
      code: input.code,
      items: [{ amount: input.amountCents, description: input.label.slice(0, 256), quantity: 1, code: input.code }],
      customer: {
        name: input.payer.name,
        email: input.payer.email,
        document: input.payer.document,
        type: 'individual',
        phones: {
          mobile_phone: {
            country_code: '55',
            area_code: input.payer.phone.ddd,
            number: input.payer.phone.number,
          },
        },
      },
      payments: [{
        payment_method: 'pix',
        pix: { expires_in: 86_400 },
        split: [
          {
            amount: recipientAmount,
            recipient_id: input.recipientId,
            type: 'flat',
            options: { charge_processing_fee: false, liable: false, charge_remainder_fee: false },
          },
          {
            amount: input.platformFeeCents,
            recipient_id: input.platformRecipientId,
            type: 'flat',
            // The platform bears processor fees so the ledger can credit the recipient's stated net amount.
            options: { charge_processing_fee: true, liable: true, charge_remainder_fee: true },
          },
        ],
      }],
      metadata: {
        application: 'oculto_pagamentos',
        payment_id: input.paymentId,
        payment_request_id: input.paymentRequestId,
      },
    }),
  });
}

export async function createTransfer(input: {
  amountCents: number;
  recipientId: string;
  withdrawalId: string;
  idempotencyKey: string;
}) {
  return pagarmeRequest<PagarmeTransfer>('/transfers', {
    method: 'POST',
    headers: { 'Idempotency-Key': input.idempotencyKey },
    body: JSON.stringify({
      amount: input.amountCents,
      recipient_id: input.recipientId,
      metadata: { application: 'oculto_pagamentos', withdrawal_id: input.withdrawalId },
    }),
  });
}

export async function createIndividualRecipient(input: PagarmeIndividualRecipientInput) {
  return pagarmeRequest<PagarmeRecipient>('/recipients', {
    method: 'POST',
    body: JSON.stringify({
      code: input.code,
      register_information: {
        name: input.name,
        email: input.email,
        document: input.document,
        type: 'individual',
        site_url: process.env.NEXT_PUBLIC_APP_URL || 'https://www.ocultopagamentos.com.br',
        mother_name: input.motherName,
        birthdate: formatBirthdateForPagarme(input.birthdate),
        monthly_income: input.monthlyIncome,
        professional_occupation: input.occupation,
        address: {
          street: input.address.street,
          complementary: input.address.complementary,
          street_number: input.address.streetNumber,
          neighborhood: input.address.neighborhood,
          city: input.address.city,
          reference_point: input.address.referencePoint,
          state: input.address.state,
          zip_code: input.address.zipCode,
        },
        phone_numbers: [{ ddd: input.phone.ddd, number: input.phone.number, type: 'mobile' }],
      },
      default_bank_account: {
        holder_name: input.name.slice(0, 30),
        holder_type: 'individual',
        holder_document: input.document,
        bank: input.bankAccount.bank,
        branch_number: input.bankAccount.branchNumber,
        ...(input.bankAccount.branchCheckDigit ? { branch_check_digit: input.bankAccount.branchCheckDigit } : {}),
        account_number: input.bankAccount.accountNumber,
        account_check_digit: input.bankAccount.accountCheckDigit,
        type: input.bankAccount.type,
      },
      transfer_settings: { transfer_enabled: false, transfer_interval: 'daily', transfer_day: 0 },
      automatic_anticipation_settings: { enabled: false },
      metadata: { application: 'oculto_pagamentos' },
    }),
  });
}

export async function createKycLink(recipientId: string) {
  return pagarmeRequest<PagarmeKycLink>(`/recipients/${encodeURIComponent(recipientId)}/kyc_link`, { method: 'POST', body: '{}' });
}
