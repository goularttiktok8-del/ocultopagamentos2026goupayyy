create schema if not exists private;
revoke all on schema private from public;

create function private.create_account_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  insert into public.accounts (user_id, display_name)
  values (
    new.id,
    case when char_length(requested_name) between 2 and 120 then requested_name else 'Nova conta' end
  );
  return new;
end;
$$;

revoke all on function private.create_account_for_new_user() from public;

create trigger create_oculto_account_on_signup
  after insert on auth.users
  for each row execute procedure private.create_account_for_new_user();
