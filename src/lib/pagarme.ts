type PagarmeRecipient = { id: string; status?: string; kyc_details?: { status?: string; status_reason?: string } };
type PagarmeKycLink = { url: string; expiration_date?: string };

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
    state: string;
    zipCode: string;
  };
  phone: { ddd: string; number: string };
  bankAccount: {
    bank: string;
    branchNumber: string;
    branchCheckDigit: string;
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

function apiKey() {
  const key = process.env.PAGARME_API_KEY?.trim();
  if (!key) throw new PagarmeError('O provedor de pagamentos ainda não foi configurado.');
  return key;
}

async function pagarmeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const credentials = Buffer.from(`${apiKey()}:`).toString('base64');
  const response = await fetch(`https://api.pagar.me/core/v5${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${credentials}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new PagarmeError('O provedor não aceitou esta solicitação.', response.status);
  }
  return response.json() as Promise<T>;
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
        birthdate: `${input.birthdate}T00:00:00`,
        monthly_income: input.monthlyIncome,
        professional_occupation: input.occupation,
        address: {
          street: input.address.street,
          complementary: input.address.complementary,
          street_number: input.address.streetNumber,
          neighborhood: input.address.neighborhood,
          city: input.address.city,
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
        branch_check_digit: input.bankAccount.branchCheckDigit,
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
