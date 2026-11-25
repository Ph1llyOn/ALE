-- ALE. — Tappa 1: accesso privato senza email e password.
--
-- Le due identità (Alessia e Phill) sono utenti Supabase Auth reali, creati SOLO dal server (Edge Function `access`)
-- con un indirizzo interno e una password casuale che nessuno conosce. Su un dispositivo nuovo si entra scegliendo
-- il profilo e digitando il PIN: l'Edge Function verifica il PIN (hash PBKDF2 + blocco progressivo), poi emette un
-- token di accesso monouso per quell'utente. La sessione resta salvata sul dispositivo.
-- La registrazione pubblica è disattivata nelle impostazioni di Auth: nessun altro può creare utenti.

-- ---------------------------------------------------------------------------
-- PIN dei profili: nessun accesso dal client (solo service role)
-- ---------------------------------------------------------------------------
create table public.access_pins (
  role             text primary key check (role in ('alessia', 'phill')),
  user_id          uuid not null unique references public.profiles (id) on delete cascade,
  salt             text not null,
  hash             text not null,
  failed_attempts  integer not null default 0,
  lock_level       integer not null default 0,
  locked_until     timestamptz,
  updated_at       timestamptz not null default now()
);
alter table public.access_pins enable row level security;
alter table public.access_pins force row level security;
create policy access_pins_deny_all on public.access_pins for all to authenticated using (false) with check (false);
-- nessun GRANT a anon/authenticated: i default privileges del progetto non concedono nulla.

-- Configurazione interna letta solo dal server e dai job (URL delle funzioni, segreto dei job): nessun accesso client.
create table public.internal_config (
  key    text primary key,
  value  text not null
);
alter table public.internal_config enable row level security;
alter table public.internal_config force row level security;
create policy internal_config_deny_all on public.internal_config for all to authenticated using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Biglietti consegnati: nessuna modifica né cancellazione retroattiva (storico coerente).
-- Restano modificabili/eliminabili solo i messaggi PROGRAMMATI non ancora partiti.
-- ---------------------------------------------------------------------------
drop policy messages_update_sender on public.messages;
drop policy messages_delete_sender on public.messages;
revoke update (title, body) on public.messages from authenticated;
revoke delete on public.messages from authenticated;
drop trigger messages_before_update on public.messages;
drop function public.messages_before_update();
alter table public.messages drop column edited_at;

-- ---------------------------------------------------------------------------
-- delete_my_account: la riautenticazione recente avviene ora con il PIN (token monouso), non più con la password.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account(p_confirm text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  fresh boolean;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  if p_confirm is distinct from 'ELIMINA ACCOUNT' then
    return jsonb_build_object('ok', false, 'error', 'confirmation_required');
  end if;
  select exists (
    select 1 from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) a
     where a ->> 'method' in ('password', 'otp', 'magiclink')
       and (a ->> 'timestamp')::bigint > extract(epoch from now())::bigint - 300
  ) into fresh;
  if not fresh then return jsonb_build_object('ok', false, 'error', 'reauth_required'); end if;
  if exists (select 1 from storage.objects where split_part(name, '/', 1) = uid::text) then
    return jsonb_build_object('ok', false, 'error', 'storage_not_empty');
  end if;
  delete from auth.users where id = uid;
  return jsonb_build_object('ok', true);
end $$;
