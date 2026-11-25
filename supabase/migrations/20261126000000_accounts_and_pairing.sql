-- ALE. — Fase 1: profili, inviti, collegamento 1:1, avatar.
-- Principi: RLS attiva e forzata su ogni tabella; privilegi concessi esplicitamente e solo per colonna
-- dove serve; le scritture "sensibili" (inviti, collegamento) passano SOLO da funzioni security definer.

-- ============================================================================
-- PROFILI
-- ============================================================================
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          text not null check (role in ('alessia', 'phill')),
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar_path   text check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_avatar_in_own_folder
    check (avatar_path is null or split_part(avatar_path, '/', 1) = id::text)
);
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- Ruolo e id immutabili (difesa in profondità oltre ai privilegi per colonna).
create function public.profiles_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.role <> old.role then
    raise exception 'id e ruolo del profilo non sono modificabili';
  end if;
  new.display_name := btrim(new.display_name);
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_before_update before update on public.profiles
  for each row execute function public.profiles_before_update();

-- Il profilo nasce da un trigger su auth.users: il client non può inserire profili.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r text := new.raw_user_meta_data ->> 'role';
  n text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
begin
  if r is null or r not in ('alessia', 'phill') then
    raise exception 'ruolo non valido';
  end if;
  n := left(coalesce(n, split_part(coalesce(new.email, ''), '@', 1), 'Utente'), 40);
  if btrim(n) = '' then n := 'Utente'; end if;
  insert into public.profiles (id, role, display_name) values (new.id, r, n);
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- INVITI
-- ============================================================================
create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  inviter_id  uuid not null references public.profiles (id) on delete cascade,
  code_hash   bytea not null unique,                       -- sha256 del codice: il codice in chiaro non è mai salvato
  status      text not null default 'pending' check (status in ('pending', 'used', 'revoked')),
  expires_at  timestamptz not null,
  used_by     uuid references public.profiles (id) on delete set null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
-- Al massimo un invito in attesa per Alessia.
create unique index invitations_one_pending_per_inviter on public.invitations (inviter_id) where status = 'pending';
alter table public.invitations enable row level security;
alter table public.invitations force row level security;

create function public.invitations_check_inviter() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = new.inviter_id and role = 'alessia') then
    raise exception 'solo Alessia può creare inviti';
  end if;
  return new;
end $$;
create trigger invitations_check_inviter before insert on public.invitations
  for each row execute function public.invitations_check_inviter();

-- Tentativi di riscatto (rate limit contro il tentativo di indovinare codici).
create table public.invitation_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  attempted_at  timestamptz not null default now()
);
create index invitation_attempts_user_time on public.invitation_attempts (user_id, attempted_at);
alter table public.invitation_attempts enable row level security;
alter table public.invitation_attempts force row level security;

-- ============================================================================
-- COLLEGAMENTO 1:1
-- ============================================================================
create table public.partnerships (
  id             uuid primary key default gen_random_uuid(),
  alessia_id     uuid not null references public.profiles (id) on delete cascade,
  phill_id       uuid not null references public.profiles (id) on delete cascade,
  status         text not null default 'active' check (status in ('active', 'ended')),
  invitation_id  uuid references public.invitations (id) on delete set null,
  created_at     timestamptz not null default now(),
  ended_at       timestamptz,
  ended_by       uuid references public.profiles (id) on delete set null,
  constraint partnerships_distinct check (alessia_id <> phill_id),
  constraint partnerships_ended_consistent check ((status = 'active') = (ended_at is null))
);
-- 1:1 garantito dal database: un solo collegamento attivo per Alessia e uno per Phill.
create unique index partnerships_one_active_alessia on public.partnerships (alessia_id) where status = 'active';
create unique index partnerships_one_active_phill   on public.partnerships (phill_id)   where status = 'active';
alter table public.partnerships enable row level security;
alter table public.partnerships force row level security;

create function public.partnerships_check_roles() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = new.alessia_id and role = 'alessia')
     or not exists (select 1 from public.profiles where id = new.phill_id and role = 'phill') then
    raise exception 'ruoli non coerenti con il collegamento';
  end if;
  return new;
end $$;
create trigger partnerships_check_roles before insert on public.partnerships
  for each row execute function public.partnerships_check_roles();

-- ============================================================================
-- FUNZIONI DI SUPPORTO PER LE POLICY
-- ============================================================================
create function public.is_partner_of(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select other is not null and exists (
    select 1 from public.partnerships p
    where p.status = 'active'
      and ((p.alessia_id = (select auth.uid()) and p.phill_id = other)
        or (p.phill_id = (select auth.uid()) and p.alessia_id = other))
  );
$$;
revoke all on function public.is_partner_of(uuid) from public, anon;
grant execute on function public.is_partner_of(uuid) to authenticated;

-- Proprietario di un oggetto avatar dal path "uuid/nomefile" (null se il path non è valido).
create function public.storage_owner(object_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(object_name, '/', 1)::uuid end;
$$;
revoke all on function public.storage_owner(text) from public, anon;
grant execute on function public.storage_owner(text) to authenticated;

-- ============================================================================
-- RLS + PRIVILEGI
-- ============================================================================
-- profiles: leggi il tuo e quello del partner attivo; modifichi solo nome e avatar del tuo.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_partner_of(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;

-- invitations: solo chi invita vede i propri inviti, e mai l'hash del codice.
create policy invitations_select_own on public.invitations for select to authenticated
  using (inviter_id = (select auth.uid()));
grant select (id, inviter_id, status, expires_at, used_at, created_at) on public.invitations to authenticated;

-- partnerships: la leggono solo i due partecipanti; nessuna scrittura diretta.
create policy partnerships_select_participants on public.partnerships for select to authenticated
  using (alessia_id = (select auth.uid()) or phill_id = (select auth.uid()));
grant select on public.partnerships to authenticated;

-- invitation_attempts: nessun accesso dal client (policy esplicita "nega tutto").
create policy invitation_attempts_deny_all on public.invitation_attempts for all to authenticated
  using (false) with check (false);

-- ============================================================================
-- FUNZIONI TRANSAZIONALI (uniche vie di scrittura per inviti e collegamento)
-- ============================================================================
create function public.create_invitation() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  alphabet constant text := 'ABCDEFGHJKMNPQRSTVWXYZ23456789';   -- 30 simboli, niente caratteri ambigui
  code text := '';
  b int;
  exp timestamptz := now() + interval '48 hours';
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  if not exists (select 1 from public.profiles where id = uid and role = 'alessia') then
    return jsonb_build_object('ok', false, 'error', 'not_alessia');
  end if;
  if exists (select 1 from public.partnerships where alessia_id = uid and status = 'active') then
    return jsonb_build_object('ok', false, 'error', 'already_linked');
  end if;
  -- campionamento con scarto per evitare bias: 10 simboli ≈ 49 bit
  while char_length(code) < 10 loop
    b := get_byte(extensions.gen_random_bytes(1), 0);
    if b < 240 then code := code || substr(alphabet, 1 + (b % 30), 1); end if;
  end loop;
  update public.invitations set status = 'revoked' where inviter_id = uid and status = 'pending';
  insert into public.invitations (inviter_id, code_hash, expires_at)
    values (uid, extensions.digest(code, 'sha256'), exp);
  return jsonb_build_object('ok', true, 'code', code, 'expires_at', exp);
end $$;

create function public.revoke_invitation() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  update public.invitations set status = 'revoked' where inviter_id = uid and status = 'pending';
  return jsonb_build_object('ok', true);
end $$;

create function public.redeem_invitation(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  norm text;
  inv public.invitations%rowtype;
  new_id uuid;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  if not exists (select 1 from public.profiles where id = uid and role = 'phill') then
    return jsonb_build_object('ok', false, 'error', 'not_phill');
  end if;
  if exists (select 1 from public.partnerships where phill_id = uid and status = 'active') then
    return jsonb_build_object('ok', false, 'error', 'already_linked');
  end if;
  -- rate limit: massimo 5 tentativi falliti in 15 minuti
  if (select count(*) from public.invitation_attempts
       where user_id = uid and attempted_at > now() - interval '15 minutes') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  norm := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  -- blocca la riga dell'invito: due riscatti concorrenti dello stesso codice si serializzano
  select * into inv from public.invitations
   where code_hash = extensions.digest(norm, 'sha256') for update;

  if not found or inv.status <> 'pending' or inv.expires_at <= now() then
    insert into public.invitation_attempts (user_id) values (uid);
    return jsonb_build_object('ok', false, 'error', 'invalid_code');   -- stesso errore per ogni causa: nessun oracolo
  end if;

  begin
    insert into public.partnerships (alessia_id, phill_id, invitation_id)
      values (inv.inviter_id, uid, inv.id) returning id into new_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_linked');
  end;

  update public.invitations set status = 'used', used_by = uid, used_at = now() where id = inv.id;
  return jsonb_build_object('ok', true, 'partnership_id', new_id);
end $$;

create function public.end_partnership() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  n int;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  update public.partnerships set status = 'ended', ended_at = now(), ended_by = uid
   where status = 'active' and (alessia_id = uid or phill_id = uid);
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'no_partnership'); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.create_invitation()      from public, anon;
revoke all on function public.revoke_invitation()      from public, anon;
revoke all on function public.redeem_invitation(text)  from public, anon;
revoke all on function public.end_partnership()        from public, anon;
grant execute on function public.create_invitation()     to authenticated;
grant execute on function public.revoke_invitation()     to authenticated;
grant execute on function public.redeem_invitation(text) to authenticated;
grant execute on function public.end_partnership()       to authenticated;

-- ============================================================================
-- STORAGE: bucket avatar privato
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Lettura: la propria cartella e quella del partner attivo. Scrittura: solo la propria.
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars'
         and (public.storage_owner(name) = (select auth.uid()) or public.is_partner_of(public.storage_owner(name))));
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars'
              and public.storage_owner(name) = (select auth.uid())
              and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$');
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.storage_owner(name) = (select auth.uid()))
  with check (bucket_id = 'avatars' and public.storage_owner(name) = (select auth.uid()));
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.storage_owner(name) = (select auth.uid()));

-- Funzioni trigger: non devono essere eseguibili da nessun ruolo client.
revoke all on function public.profiles_before_update()    from public, anon, authenticated;
revoke all on function public.invitations_check_inviter() from public, anon, authenticated;
revoke all on function public.partnerships_check_roles()  from public, anon, authenticated;
