-- Durable rate limiting for sensitive routes. Only the server-side service role
-- can call this function; browsers never receive the raw identifiers or counters.
create table if not exists public.api_rate_limits (
  rate_key text primary key check (char_length(rate_key) between 10 and 128),
  request_count integer not null check (request_count > 0),
  window_started_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.api_rate_limits enable row level security;

revoke all on table public.api_rate_limits from public, anon, authenticated;
grant all on table public.api_rate_limits to service_role;

create index if not exists api_rate_limits_expires_at_idx
  on public.api_rate_limits (expires_at);

create or replace function public.check_api_rate_limit(
  p_rate_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_window_started_at timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_rate_key is null or char_length(p_rate_key) not between 10 and 128 then
    raise exception 'Invalid rate limit key';
  end if;
  if p_limit not between 1 and 100000 or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit window';
  end if;

  -- Reclaim a small bounded batch of expired keys without adding a cron dependency.
  delete from public.api_rate_limits
  where ctid in (
    select ctid
    from public.api_rate_limits
    where expires_at < v_now - interval '7 days'
    order by expires_at asc
    limit 100
  );

  insert into public.api_rate_limits as current_window (
    rate_key, request_count, window_started_at, expires_at, updated_at
  ) values (
    p_rate_key, 1, v_now, v_now + make_interval(secs => p_window_seconds), v_now
  )
  on conflict (rate_key) do update
  set
    request_count = case
      when current_window.window_started_at <= v_now - make_interval(secs => p_window_seconds) then 1
      else current_window.request_count + 1
    end,
    window_started_at = case
      when current_window.window_started_at <= v_now - make_interval(secs => p_window_seconds) then v_now
      else current_window.window_started_at
    end,
    expires_at = case
      when current_window.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        then v_now + make_interval(secs => p_window_seconds)
      else current_window.expires_at
    end,
    updated_at = v_now
  returning request_count, window_started_at into v_count, v_window_started_at;

  allowed := v_count <= p_limit;
  retry_after_seconds := greatest(
    1,
    ceil(extract(epoch from (v_window_started_at + make_interval(secs => p_window_seconds) - v_now)))::integer
  );
  return next;
end;
$$;

revoke all on function public.check_api_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_api_rate_limit(text, integer, integer) to service_role;
