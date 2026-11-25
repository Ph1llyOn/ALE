-- ALE. — Fase 2 (1/3): condivisione selettiva.
-- Principio: il collegamento tra Alessia e Phill NON dà accesso a nulla. Ogni categoria di dati è privata
-- finché il proprietario non la condivide esplicitamente; la condivisione si revoca in qualsiasi momento
-- con effetto immediato. Nessuna scrittura diretta: si passa dalle funzioni set_sharing / revoke_all_sharing.

create table public.sharing_permissions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,   -- di chi sono i dati
  grantee_id  uuid not null references public.profiles (id) on delete cascade,   -- chi può leggerli
  category    text not null check (category in
                ('activities', 'habits', 'calendar', 'progress', 'equipment', 'wellbeing', 'journal')),
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  constraint sharing_distinct check (owner_id <> grantee_id),
  constraint sharing_revoked_after_grant check (revoked_at is null or revoked_at >= granted_at)
);
-- Al massimo un permesso attivo per (proprietario, destinatario, categoria); le righe revocate restano come storico.
create unique index sharing_one_active on public.sharing_permissions (owner_id, grantee_id, category) where revoked_at is null;
create index sharing_grantee_active on public.sharing_permissions (grantee_id) where revoked_at is null;

alter table public.sharing_permissions enable row level security;
alter table public.sharing_permissions force row level security;

-- Le vedono solo il proprietario e il destinatario (Phill deve sapere cosa gli è condiviso). Nessuna scrittura diretta.
create policy sharing_select_parties on public.sharing_permissions for select to authenticated
  using (owner_id = (select auth.uid()) or grantee_id = (select auth.uid()));
grant select on public.sharing_permissions to authenticated;

-- ---------------------------------------------------------------------------
-- can_view(owner, categoria): l'utente corrente può leggere la categoria di dati di `owner`?
-- Vero solo se (a) esiste un collegamento ATTIVO tra i due e (b) il proprietario ha un permesso non revocato
-- per quella categoria verso l'utente corrente. Il proprietario stesso non passa da qui (usa owner_id = auth.uid()).
-- ---------------------------------------------------------------------------
create function public.can_view(p_owner uuid, p_category text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_owner is not null
     and p_owner <> (select auth.uid())
     and exists (
       select 1
         from public.sharing_permissions sp
         join public.partnerships p
           on p.status = 'active'
          and ((p.alessia_id = sp.owner_id and p.phill_id = sp.grantee_id)
            or (p.phill_id = sp.owner_id and p.alessia_id = sp.grantee_id))
        where sp.owner_id = p_owner
          and sp.grantee_id = (select auth.uid())
          and sp.category = p_category
          and sp.revoked_at is null);
$$;
revoke all on function public.can_view(uuid, text) from public, anon;
grant execute on function public.can_view(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- set_sharing: condivide (true) o revoca (false) UNA categoria verso il partner attivo.
-- ---------------------------------------------------------------------------
create function public.set_sharing(p_category text, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  partner uuid;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  if p_category is null or p_category not in
     ('activities', 'habits', 'calendar', 'progress', 'equipment', 'wellbeing', 'journal') then
    return jsonb_build_object('ok', false, 'error', 'invalid_category');
  end if;
  if p_enabled is null then return jsonb_build_object('ok', false, 'error', 'invalid_value'); end if;

  select case when alessia_id = uid then phill_id else alessia_id end into partner
    from public.partnerships
   where status = 'active' and (alessia_id = uid or phill_id = uid);
  if partner is null then return jsonb_build_object('ok', false, 'error', 'not_linked'); end if;

  if p_enabled then
    insert into public.sharing_permissions (owner_id, grantee_id, category)
    select uid, partner, p_category
     where not exists (select 1 from public.sharing_permissions
                        where owner_id = uid and grantee_id = partner and category = p_category and revoked_at is null);
  else
    update public.sharing_permissions set revoked_at = now()
     where owner_id = uid and grantee_id = partner and category = p_category and revoked_at is null;
  end if;
  return jsonb_build_object('ok', true, 'category', p_category, 'enabled', p_enabled);
end $$;

-- Revoca tutto in un colpo ("interruttore generale").
create function public.revoke_all_sharing() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  n int;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  update public.sharing_permissions set revoked_at = now() where owner_id = uid and revoked_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'revoked', n);
end $$;

revoke all on function public.set_sharing(text, boolean) from public, anon;
revoke all on function public.revoke_all_sharing()       from public, anon;
grant execute on function public.set_sharing(text, boolean) to authenticated;
grant execute on function public.revoke_all_sharing()       to authenticated;
