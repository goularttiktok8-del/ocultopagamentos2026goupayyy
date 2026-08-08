drop index if exists public.accounts_user_id_idx;
create index payments_payment_request_id_idx on public.payments(payment_request_id);
create index audit_events_actor_user_id_idx on public.audit_events(actor_user_id);

revoke all on public.audit_events from anon, authenticated;
create policy "No direct audit access" on public.audit_events
  for select to authenticated
  using (false);
