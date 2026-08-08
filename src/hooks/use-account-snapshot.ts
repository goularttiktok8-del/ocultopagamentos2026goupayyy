'use client';

import { useCallback, useEffect, useState } from 'react';

export type AccountSnapshot = {
  account: {
    id: string;
    display_name: string;
    status: 'pending_profile' | 'pending_kyc' | 'active' | 'restricted' | 'blocked' | 'refused';
    kyc_status: 'not_started' | 'pending' | 'additional_documents_required' | 'approved' | 'denied';
    payout_key_last4: string | null;
    created_at: string;
  };
  available_cents: number;
  pending_cents: number;
  received_this_month_cents: number;
  ledger: Array<{
    id: string;
    direction: 'credit' | 'debit';
    amount_cents: number;
    entry_type: string;
    reference_type: string;
    occurred_at: string;
  }>;
  withdrawals: Array<{
    id: string;
    amount_cents: number;
    fee_cents: number;
    status: string;
    requested_at: string;
    failure_reason: string | null;
  }>;
  payment_requests: Array<{
    id: string;
    label: string;
    amount_cents: number | null;
    status: string;
    created_at: string;
    expires_at: string | null;
    paid_at: string | null;
  }>;
};

export function useAccountSnapshot() {
  const [data, setData] = useState<AccountSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/account', { cache: 'no-store', credentials: 'same-origin' });
      const payload = await response.json() as AccountSnapshot & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar a conta.');
      setData(payload);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a conta.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  return { data, error, loading, refresh };
}

export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function kycLabel(status: AccountSnapshot['account']['kyc_status']) {
  return {
    not_started: 'Verificação necessária',
    pending: 'Verificação em análise',
    additional_documents_required: 'Ação necessária',
    approved: 'Conta verificada',
    denied: 'Verificação recusada',
  }[status];
}

export function ledgerLabel(entryType: string, direction: 'credit' | 'debit') {
  const labels: Record<string, string> = {
    payment_settled: 'Pagamento recebido',
    payment_refunded: 'Pagamento estornado',
    withdrawal_reserved: 'Saque solicitado',
    withdrawal_reversed: 'Saque devolvido',
  };
  return labels[entryType] || (direction === 'credit' ? 'Entrada de saldo' : 'Saída de saldo');
}
