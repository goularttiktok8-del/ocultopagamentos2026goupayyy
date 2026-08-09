-- The rate-limit table is an internal server-only implementation detail.
create policy "No direct rate limit access"
on public.api_rate_limits
for all
to authenticated
using (false)
with check (false);
