create extension if not exists pgcrypto;

create type public.account_status as enum ('pending_profile', 'pending_kyc', 'active', 'restricted', 'blocked', 'refused');
create type public.kyc_status as enum ('not_started', 'pending', 'additional_documents_required', 'approved', 'denied');
create type public.payment_request_status as enum ('active', 'paid', 'expired', 'cancelled');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'charged_back');
create type public.withdrawal_status as enum ('pending_review', 'processing', 'paid', 'failed', 'cancelled');
create type public.ledger_direction as enum ('credit', 'debit');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 2 and 120),
  document_hash text unique,
  document_last4 char(4),
  pagarme_recipient_id text unique,
  status public.account_status not null default 'pending_profile',
  kyc_status public.kyc_status not null default 'not_started',
  kyc_status_reason text,
  payout_key_last4 char(4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  public_token_hash text not null unique,
  label text not null default 'Recebimento' check (char_length(label) <= 80),
  amount_cents bigint check (amount_cents is null or amount_cents >= 100),
  status public.payment_request_status not null default 'active',
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  payment_request_id uuid references public.payment_requests(id) on delete set null,
  amount_cents bigint not null check (amount_cents >= 100),
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  net_amount_cents bigint not null check (net_amount_cents >= 0),
  status public.payment_status not null default 'pending',
  pagarme_order_id text unique,
  pagarme_charge_id text unique,
  payer_name text,
  payer_document_hash text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (net_amount_cents = amount_cents - fee_cents)
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  direction public.ledger_direction not null,
  amount_cents bigint not null check (amount_cents > 0),
  entry_type text not null check (char_length(entry_type) <= 48),
  reference_type text not null check (char_length(reference_type) <= 48),
  reference_id uuid,
  provider_event_id text unique,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  amount_cents bigint not null check (amount_cents >= 100),
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  status public.withdrawal_status not null default 'pending_review',
  pagarme_transfer_id text unique,
  failure_reason text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.kyc_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  status public.kyc_status not null,
  provider_event_id text unique,
  reason text,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (char_length(event_type) <= 80),
  entity_type text not null check (char_length(entity_type) <= 48),
  entity_id uuid,
  request_id text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index accounts_user_id_idx on public.accounts(user_id);
create index payment_requests_account_created_idx on public.payment_requests(account_id, created_at desc);
create index payments_account_created_idx on public.payments(account_id, created_at desc);
create index payments_account_paid_idx on public.payments(account_id, paid_at desc) where status = 'paid';
create index ledger_entries_account_occurred_idx on public.ledger_entries(account_id, occurred_at desc);
create index withdrawals_account_requested_idx on public.withdrawals(account_id, requested_at desc);
create index withdrawals_pending_idx on public.withdrawals(status, requested_at) where status in ('pending_review', 'processing');
create index kyc_events_account_created_idx on public.kyc_events(account_id, created_at desc);
create index audit_events_account_created_idx on public.audit_events(account_id, created_at desc);

alter table public.accounts enable row level security;
alter table public.payment_requests enable row level security;
alter table public.payments enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.withdrawals enable row level security;
alter table public.kyc_events enable row level security;
alter table public.audit_events enable row level security;

grant select on public.accounts, public.payment_requests, public.payments, public.ledger_entries, public.withdrawals, public.kyc_events to authenticated;

create policy "Users read their account" on public.accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users read their payment requests" on public.payment_requests for select to authenticated using (account_id in (select id from public.accounts where user_id = (select auth.uid())));
create policy "Users read their payments" on public.payments for select to authenticated using (account_id in (select id from public.accounts where user_id = (select auth.uid())));
create policy "Users read their ledger" on public.ledger_entries for select to authenticated using (account_id in (select id from public.accounts where user_id = (select auth.uid())));
create policy "Users read their withdrawals" on public.withdrawals for select to authenticated using (account_id in (select id from public.accounts where user_id = (select auth.uid())));
create policy "Users read their KYC events" on public.kyc_events for select to authenticated using (account_id in (select id from public.accounts where user_id = (select auth.uid())));

-- Escritas financeiras acontecem somente no servidor, usando a chave service_role.
