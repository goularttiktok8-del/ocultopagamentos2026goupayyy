alter table public.payment_requests
  add column if not exists single_use boolean not null default true;

alter table public.payments
  add column if not exists provider_idempotency_key uuid,
  add column if not exists pix_qr_code text,
  add column if not exists pix_qr_code_url text,
  add column if not exists pix_expires_at timestamptz,
  add column if not exists failure_reason text;

create unique index if not exists payments_provider_idempotency_key_idx
  on public.payments(provider_idempotency_key)
  where provider_idempotency_key is not null;

create unique index if not exists payments_one_pending_per_request_idx
  on public.payments(payment_request_id)
  where status = 'pending';

create index if not exists payments_pagarme_order_lookup_idx
  on public.payments(pagarme_order_id)
  where pagarme_order_id is not null;

create index if not exists payments_pagarme_charge_lookup_idx
  on public.payments(pagarme_charge_id)
  where pagarme_charge_id is not null;

create index if not exists withdrawals_pagarme_transfer_lookup_idx
  on public.withdrawals(pagarme_transfer_id)
  where pagarme_transfer_id is not null;

create or replace function public.settle_pagarme_payment(
  p_order_id text,
  p_charge_id text,
  p_provider_event_id text,
  p_paid_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_single_use boolean;
begin
  select p.*
  into v_payment
  from public.payments p
  where (p_order_id is not null and p.pagarme_order_id = p_order_id)
     or (p_charge_id is not null and p.pagarme_charge_id = p_charge_id)
  order by p.created_at desc
  limit 1
  for update of p;

  if not found then return null; end if;
  select single_use into v_single_use
  from public.payment_requests
  where id = v_payment.payment_request_id;
  if v_payment.status in ('paid', 'refunded', 'charged_back') then return v_payment.id; end if;

  update public.payments
  set status = 'paid',
      pagarme_charge_id = coalesce(pagarme_charge_id, p_charge_id),
      paid_at = coalesce(p_paid_at, now()),
      failure_reason = null,
      updated_at = now()
  where id = v_payment.id;

  if v_single_use then
    update public.payment_requests
    set status = 'paid', paid_at = coalesce(p_paid_at, now())
    where id = v_payment.payment_request_id and status = 'active';
  end if;

  insert into public.ledger_entries (
    account_id, direction, amount_cents, entry_type, reference_type, reference_id, provider_event_id, occurred_at
  ) values (
    v_payment.account_id, 'credit', v_payment.net_amount_cents, 'payment_settled', 'payment', v_payment.id,
    p_provider_event_id, coalesce(p_paid_at, now())
  ) on conflict (provider_event_id) do nothing;

  return v_payment.id;
end;
$$;

create or replace function public.fail_pagarme_payment(
  p_order_id text,
  p_charge_id text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_payment public.payments%rowtype;
begin
  select * into v_payment
  from public.payments
  where (p_order_id is not null and pagarme_order_id = p_order_id)
     or (p_charge_id is not null and pagarme_charge_id = p_charge_id)
  order by created_at desc
  limit 1
  for update;

  if not found then return null; end if;
  if v_payment.status = 'pending' then
    update public.payments
    set status = 'failed', failure_reason = left(p_reason, 300), updated_at = now()
    where id = v_payment.id;
  end if;
  return v_payment.id;
end;
$$;

create or replace function public.refund_pagarme_payment(
  p_charge_id text,
  p_provider_event_id text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_payment public.payments%rowtype;
begin
  select * into v_payment
  from public.payments
  where pagarme_charge_id = p_charge_id
  limit 1
  for update;

  if not found then return null; end if;
  if v_payment.status <> 'paid' then return v_payment.id; end if;

  update public.payments
  set status = 'refunded', failure_reason = left(p_reason, 300), updated_at = now()
  where id = v_payment.id;

  insert into public.ledger_entries (
    account_id, direction, amount_cents, entry_type, reference_type, reference_id, provider_event_id
  ) values (
    v_payment.account_id, 'debit', v_payment.net_amount_cents, 'payment_refunded', 'payment', v_payment.id,
    p_provider_event_id
  ) on conflict (provider_event_id) do nothing;

  return v_payment.id;
end;
$$;

create or replace function public.mark_pagarme_withdrawal_processing(
  p_withdrawal_id uuid,
  p_transfer_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_withdrawal public.withdrawals%rowtype;
begin
  select * into v_withdrawal from public.withdrawals where id = p_withdrawal_id for update;
  if not found then raise exception 'WITHDRAWAL_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_withdrawal.status in ('paid', 'failed', 'cancelled') then return v_withdrawal.id; end if;
  if v_withdrawal.pagarme_transfer_id is not null and v_withdrawal.pagarme_transfer_id <> p_transfer_id then
    raise exception 'TRANSFER_ALREADY_ATTACHED' using errcode = 'P0001';
  end if;

  update public.withdrawals
  set status = 'processing', pagarme_transfer_id = p_transfer_id, updated_at = now()
  where id = v_withdrawal.id;
  return v_withdrawal.id;
end;
$$;

create or replace function public.complete_pagarme_withdrawal(
  p_withdrawal_id uuid,
  p_transfer_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_withdrawal public.withdrawals%rowtype;
begin
  select * into v_withdrawal from public.withdrawals where id = p_withdrawal_id for update;
  if not found then return null; end if;
  if v_withdrawal.status = 'paid' then return v_withdrawal.id; end if;
  if v_withdrawal.status in ('failed', 'cancelled') then return v_withdrawal.id; end if;

  update public.withdrawals
  set status = 'paid', pagarme_transfer_id = coalesce(pagarme_transfer_id, p_transfer_id),
      processed_at = now(), updated_at = now()
  where id = v_withdrawal.id;
  return v_withdrawal.id;
end;
$$;

create or replace function public.fail_pagarme_withdrawal(
  p_withdrawal_id uuid,
  p_provider_event_id text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_withdrawal public.withdrawals%rowtype;
begin
  select * into v_withdrawal from public.withdrawals where id = p_withdrawal_id for update;
  if not found then return null; end if;
  if v_withdrawal.status in ('paid', 'failed', 'cancelled') then return v_withdrawal.id; end if;

  update public.withdrawals
  set status = 'failed', failure_reason = left(p_reason, 300), updated_at = now()
  where id = v_withdrawal.id;

  insert into public.ledger_entries (
    account_id, direction, amount_cents, entry_type, reference_type, reference_id, provider_event_id
  ) values (
    v_withdrawal.account_id, 'credit', v_withdrawal.amount_cents, 'withdrawal_reversed', 'withdrawal', v_withdrawal.id,
    p_provider_event_id
  ) on conflict (provider_event_id) do nothing;
  return v_withdrawal.id;
end;
$$;

revoke all on function public.settle_pagarme_payment(text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.fail_pagarme_payment(text, text, text) from public, anon, authenticated;
revoke all on function public.refund_pagarme_payment(text, text, text) from public, anon, authenticated;
revoke all on function public.mark_pagarme_withdrawal_processing(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_pagarme_withdrawal(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_pagarme_withdrawal(uuid, text, text) from public, anon, authenticated;

grant execute on function public.settle_pagarme_payment(text, text, text, timestamptz) to service_role;
grant execute on function public.fail_pagarme_payment(text, text, text) to service_role;
grant execute on function public.refund_pagarme_payment(text, text, text) to service_role;
grant execute on function public.mark_pagarme_withdrawal_processing(uuid, text) to service_role;
grant execute on function public.complete_pagarme_withdrawal(uuid, text) to service_role;
grant execute on function public.fail_pagarme_withdrawal(uuid, text, text) to service_role;
