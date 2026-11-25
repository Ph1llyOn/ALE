-- Test di sistema (pgTAP): ogni tabella in `public` deve avere RLS attiva e FORZATA
-- per il proprietario, e almeno una policy. Fallisce se una futura migrazione dimentica la RLS.
-- Esecuzione: `supabase test db` (richiede Docker + Supabase CLI).
begin;
select plan(3);

select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0,
  'Nessuna tabella in public senza RLS attiva'
);

select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relforcerowsecurity),
  0,
  'Nessuna tabella in public senza FORCE ROW LEVEL SECURITY'
);

select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)),
  0,
  'Ogni tabella in public ha almeno una policy esplicita'
);

select * from finish();
rollback;
