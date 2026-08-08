-- This function is deliberately callable only by the server's service-role key.
-- It reserves a balance and creates the withdrawal record in one database transaction.
create or replace function public.reserve_withdrawal(
  p_account_id uuid,
  p_amount_cents bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_available_cents bigint;
  v_withdrawal_id uuid;
begin
  if p_amount_cents is null or p_amount_cents < 100 or p_amount_cents > 100000000 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  -- Locks this account row until the debit has been written, preventing concurrent
  -- requests from checking and spending the same ledger balance.
  perform 1
  from public.accounts
  where id = p_account_id
    and status = 'active'
    and kyc_status = 'approved'
    and payout_key_last4 is not null
  for update;

  if not found then
    raise exception 'ACCOUNT_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  select coalesce(sum(
    case when direction = 'credit' then amount_cents else -amount_cents end
  ), 0)
  into v_available_cents
  from public.ledger_entries
  where account_id = p_account_id;

  if v_available_cents < p_amount_cents then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  insert into public.withdrawals (account_id, amount_cents, status)
  values (p_account_id, p_amount_cents, 'pending_review')
  returning id into v_withdrawal_id;

  insert into public.ledger_entries (
    account_id,
    direction,
    amount_cents,
    entry_type,
    reference_type,
    reference_id
  ) values (
    p_account_id,
    'debit',
    p_amount_cents,
    'withdrawal_reserved',
    'withdrawal',
    v_withdrawal_id
  );

  return v_withdrawal_id;
end;
$$;

revoke all on function public.reserve_withdrawal(uuid, bigint) from public, anon, authenticated;
grant execute on function public.reserve_withdrawal(uuid, bigint) to service_role;
