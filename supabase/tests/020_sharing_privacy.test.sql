-- Test pgTAP Fase 2: condivisione selettiva e privacy.
-- Attori: a1 (Alessia), b1 (Phill collegato ad a1), a2 (altra Alessia), b2 (Phill estraneo), anonimo.
begin;
select no_plan();

-- ------------------------------------------------------------------ strumenti di test
create function pg_temp.login(p_user uuid, p_role text default 'authenticated', p_extra jsonb default '{}') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', p_user, 'role', p_role) || p_extra)::text, true);
  execute format('set local role %I', p_role);
end $$;

-- righe di proprietà di Alessia (a1) visibili in una tabella per un attore (-1 = permesso negato)
create function pg_temp.count_as(p_user uuid, p_table text, p_role text default 'authenticated') returns int
language plpgsql as $$
declare n int;
begin
  perform pg_temp.login(p_user, p_role);
  begin
    execute format('select count(*) from public.%I where owner_id = %L', p_table, '00000000-0000-0000-0000-00000000a001') into n;
  exception when insufficient_privilege then n := -1;
  end;
  reset role;
  return n;
end $$;

-- esegue un comando come utente: 'ok:<righe>' | 'denied' | 'error:<sqlstate>'
create function pg_temp.try_sql(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare n int;
begin
  perform pg_temp.login(p_user);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    reset role;
    return 'ok:' || n;
  exception
    when insufficient_privilege then reset role; return 'denied';
    when others then reset role; return 'error:' || sqlstate;
  end;
end $$;

-- esegue una query scalare come utente e restituisce il testo (per le funzioni RPC)
create function pg_temp.q_as(p_user uuid, p_sql text, p_extra jsonb default '{}') returns text
language plpgsql as $$
declare r text;
begin
  perform pg_temp.login(p_user, 'authenticated', p_extra);
  begin
    execute p_sql into r;
  exception when others then r := 'error:' || sqlstate;
  end;
  reset role;
  return r;
end $$;

-- ------------------------------------------------------------------ dati di prova
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a001', 'a1@test.local', '{"role":"alessia","display_name":"Ale Uno"}'),
  ('00000000-0000-0000-0000-00000000a002', 'a2@test.local', '{"role":"alessia","display_name":"Ale Due"}'),
  ('00000000-0000-0000-0000-00000000b001', 'b1@test.local', '{"role":"phill","display_name":"Phill Uno"}'),
  ('00000000-0000-0000-0000-00000000b002', 'b2@test.local', '{"role":"phill","display_name":"Phill Due"}');
insert into public.partnerships (alessia_id, phill_id) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000b001');

-- Una riga per tabella, di proprietà di a1.
insert into public.equipment (owner_id, name) values ('00000000-0000-0000-0000-00000000a001', 'Elastici');
insert into public.workouts (id, owner_id, title) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', 'Scheda A');
insert into public.workout_exercises (workout_id, owner_id, name) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', 'Squat');
insert into public.workout_sessions (id, owner_id, workout_id, title) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', '10000000-0000-0000-0000-000000000001', 'Sessione');
insert into public.session_exercise_progress (session_id, owner_id, name) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', 'Squat');
insert into public.habits (id, owner_id, name) values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', 'Acqua');
insert into public.habit_logs (habit_id, owner_id, day) values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', current_date);
insert into public.progress_records (owner_id, kind, title) values ('00000000-0000-0000-0000-00000000a001', 'small_win', 'Una piccola conquista');
insert into public.wellbeing_logs (id, owner_id, day, mood, energy) values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', current_date, 4, 3);
insert into public.wellbeing_notes (log_id, owner_id, note) values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', 'Nota molto privata');
insert into public.journal_entries (owner_id, title, body, shared_with_partner) values
  ('00000000-0000-0000-0000-00000000a001', 'Condivisa', 'Questa voce è marcata come condivisa', true),
  ('00000000-0000-0000-0000-00000000a001', 'Privata',   'Questa voce resta privata', false);
insert into public.calendar_events (owner_id, created_by, title, category, starts_at) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a001', 'Passeggiata', 'walk', now() + interval '1 day');

-- tabelle condivisibili per categoria (tabella, categoria)
create temp table cat_tables (tbl text, cat text);
insert into cat_tables values
  ('equipment','equipment'), ('workouts','activities'), ('workout_exercises','activities'),
  ('workout_sessions','activities'), ('session_exercise_progress','activities'),
  ('habits','habits'), ('habit_logs','habits'), ('progress_records','progress'), ('wellbeing_logs','wellbeing');

-- ================================================================== FASE 1: tutto privato di default
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a001', tbl), 1, 'DEFAULT: Alessia vede la propria riga in ' || tbl) from cat_tables;
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', tbl), 0, 'DEFAULT: Phill collegato NON vede ' || tbl) from cat_tables;
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b002', tbl), 0, 'DEFAULT: Phill estraneo NON vede ' || tbl) from cat_tables;
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a002', tbl), 0, 'DEFAULT: altra Alessia NON vede ' || tbl) from cat_tables;
select is(pg_temp.count_as(null, tbl, 'anon'), -1, 'DEFAULT: anon senza privilegi su ' || tbl) from cat_tables;

select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'journal_entries'), 0, 'DEFAULT: Phill non vede nessuna voce di diario');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'wellbeing_notes'), 0, 'DEFAULT: Phill non vede note di benessere');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'calendar_events'), 0, 'DEFAULT: Phill non vede il calendario');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'sharing_permissions'), 0, 'DEFAULT: nessun permesso esiste dopo il collegamento');
select is((select count(*)::int from public.sharing_permissions), 0, 'DEFAULT (postgres): la tabella permessi è vuota');

-- ================================================================== solo il proprietario concede
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a002', $$select public.set_sharing('habits', true)::text$$)::jsonb ->> 'error', 'not_linked', 'un''Alessia non collegata non può condividere');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a001', $$select public.set_sharing('peso', true)::text$$)::jsonb ->> 'error', 'invalid_category', 'categoria inesistente rifiutata');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a001', $$select public.set_sharing('habits', null)::text$$)::jsonb ->> 'error', 'invalid_value', 'valore nullo rifiutato');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.sharing_permissions (owner_id, grantee_id, category) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','journal')$$),
  'denied', 'Phill non può concedersi permessi da solo (insert diretto)');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$insert into public.sharing_permissions (owner_id, grantee_id, category) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','journal')$$),
  'denied', 'nemmeno Alessia scrive direttamente: serve set_sharing');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.sharing_permissions set revoked_at = null$$), 'denied', 'niente update diretti sui permessi');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$delete from public.sharing_permissions$$), 'denied', 'niente delete diretti sui permessi');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b001', $$select public.set_sharing('journal', true)::text$$)::jsonb ->> 'ok', 'true',
  'Phill può condividere i PROPRI dati (modello simmetrico)…');
select is((select count(*)::int from public.sharing_permissions where owner_id = '00000000-0000-0000-0000-00000000b001'), 1, '…e la riga ha b1 come proprietario');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a001', 'journal_entries'), 2, 'ma Alessia continua a vedere solo le proprie voci (b1 non ne ha)');
select pg_temp.q_as('00000000-0000-0000-0000-00000000b001', $$select public.revoke_all_sharing()::text$$);

-- ================================================================== FASE 2: Alessia condivide tutte le categorie
select pg_temp.q_as('00000000-0000-0000-0000-00000000a001', format($$select public.set_sharing(%L, true)::text$$, c))
  from unnest(array['activities','habits','calendar','progress','equipment','wellbeing','journal']) c;
select is((select count(*)::int from public.sharing_permissions where owner_id = '00000000-0000-0000-0000-00000000a001' and revoked_at is null), 7, 'Alessia ha 7 permessi attivi');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a001', $$select public.set_sharing('habits', true)::text$$)::jsonb ->> 'ok', 'true', 'ricondividere è idempotente');
select is((select count(*)::int from public.sharing_permissions where owner_id = '00000000-0000-0000-0000-00000000a001' and category = 'habits'), 1, 'nessun duplicato attivo');

select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', tbl), 1, 'CONDIVISO: Phill vede ' || tbl) from cat_tables;
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b002', tbl), 0, 'CONDIVISO: l''estraneo NON vede ' || tbl) from cat_tables;
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a002', tbl), 0, 'CONDIVISO: l''altra Alessia NON vede ' || tbl) from cat_tables;
select is(pg_temp.count_as(null, tbl, 'anon'), -1, 'CONDIVISO: anon negato su ' || tbl) from cat_tables;

-- diario: due chiavi
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'journal_entries'), 1, 'DIARIO: con categoria condivisa Phill vede SOLO la voce marcata condivisa');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$select 1 from public.journal_entries where title = 'Privata'$$), 'ok:0', 'DIARIO: la voce privata resta invisibile anche con la categoria condivisa');
-- benessere: la nota non è mai condivisibile
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'wellbeing_logs'), 1, 'BENESSERE: Phill vede umore/energia condivisi');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'wellbeing_notes'), 0, 'BENESSERE: la nota libera NON è mai visibile a Phill');
-- calendario
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'calendar_events'), 1, 'CALENDARIO: Phill vede gli eventi confermati condivisi');

-- ================================================================== Phill non scrive nei dati di Alessia (con TUTTI i permessi)
create temp table write_probes (tbl text, ins text);
insert into write_probes values
  ('equipment', $$insert into public.equipment (owner_id, name) values ('00000000-0000-0000-0000-00000000a001','x')$$),
  ('workouts', $$insert into public.workouts (owner_id, title) values ('00000000-0000-0000-0000-00000000a001','x')$$),
  ('workout_exercises', $$insert into public.workout_exercises (workout_id, owner_id, name) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000a001','x')$$),
  ('workout_sessions', $$insert into public.workout_sessions (owner_id, title) values ('00000000-0000-0000-0000-00000000a001','x')$$),
  ('session_exercise_progress', $$insert into public.session_exercise_progress (session_id, owner_id, name) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000a001','x')$$),
  ('habits', $$insert into public.habits (owner_id, name) values ('00000000-0000-0000-0000-00000000a001','x')$$),
  ('habit_logs', $$insert into public.habit_logs (habit_id, owner_id, day) values ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000a001', current_date - 1)$$),
  ('progress_records', $$insert into public.progress_records (owner_id, kind, title) values ('00000000-0000-0000-0000-00000000a001','small_win','x')$$),
  ('wellbeing_logs', $$insert into public.wellbeing_logs (owner_id, day, mood, energy) values ('00000000-0000-0000-0000-00000000a001', current_date - 1, 3, 3)$$),
  ('wellbeing_notes', $$insert into public.wellbeing_notes (log_id, owner_id, note) values ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000a001','x')$$),
  ('journal_entries', $$insert into public.journal_entries (owner_id, body) values ('00000000-0000-0000-0000-00000000a001','x')$$),
  ('calendar_events', $$insert into public.calendar_events (owner_id, created_by, title, category, starts_at, status) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','x','walk', now(), 'confirmed')$$);

select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', ins), 'denied', 'SCRITTURA: Phill non può inserire in ' || tbl || ' di Alessia') from write_probes;
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b002', ins), 'denied', 'SCRITTURA: l''estraneo non può inserire in ' || tbl || ' di Alessia') from write_probes;
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', format('update public.%I set owner_id = owner_id', tbl)), 'ok:0', 'SCRITTURA: Phill non modifica righe di Alessia in ' || tbl) from write_probes;
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', format('delete from public.%I', tbl)), 'ok:0', 'SCRITTURA: Phill non cancella righe di Alessia in ' || tbl) from write_probes;
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a002', format('delete from public.%I', tbl)), 'ok:0', 'SCRITTURA: un''altra Alessia non cancella righe di a1 in ' || tbl) from write_probes;
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', format('update public.%I set owner_id = %L', tbl, '00000000-0000-0000-0000-00000000b001')), 'error:P0001', 'il proprietario di una riga non si trasferisce in ' || tbl) from write_probes where tbl not in ('journal_entries', 'calendar_events') or true;

-- Alessia scrive nei propri dati e l'integrità dei figli regge
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$insert into public.equipment (owner_id, name) values ('00000000-0000-0000-0000-00000000a001','Tappetino')$$), 'ok:1', 'Alessia inserisce nei propri dati');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$insert into public.workout_exercises (workout_id, owner_id, name) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000a001','Plank')$$), 'ok:1', 'Alessia aggiunge esercizi alla propria scheda');
delete from public.equipment where name = 'Tappetino';          -- ripristina una riga per tabella
delete from public.workout_exercises where name = 'Plank';
insert into public.workouts (id, owner_id, title) values ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000b001', 'Scheda di Phill');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$insert into public.workout_exercises (workout_id, owner_id, name) values ('10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000a001','Intruso')$$),
  'error:23503', 'integrità: un figlio non può agganciarsi al genitore di un altro proprietario');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$insert into public.equipment (owner_id, name) values ('00000000-0000-0000-0000-00000000a001','')$$), 'error:23514', 'nome vuoto rifiutato');

-- ================================================================== FASE 3: revoca granulare
select pg_temp.q_as('00000000-0000-0000-0000-00000000a001', $$select public.set_sharing('habits', false)::text$$);
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', tbl), case when cat = 'habits' then 0 else 1 end,
  'REVOCA GRANULARE: ' || tbl || ' (' || cat || ')') from cat_tables;
select is((select count(*)::int from public.sharing_permissions where category = 'habits' and owner_id = '00000000-0000-0000-0000-00000000a001' and revoked_at is not null), 1, 'la riga revocata resta come storico');
select pg_temp.q_as('00000000-0000-0000-0000-00000000a001', $$select public.set_sharing('habits', true)::text$$);
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'habits'), 1, 'ri-condividere ripristina la visibilità');
select is((select count(*)::int from public.sharing_permissions where category = 'habits' and owner_id = '00000000-0000-0000-0000-00000000a001'), 2, 'storico: una riga revocata + una attiva');

-- il diario ha una seconda chiave: la categoria revocata nasconde tutto
select pg_temp.q_as('00000000-0000-0000-0000-00000000a001', $$select public.set_sharing('journal', false)::text$$);
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'journal_entries'), 0, 'DIARIO: revocata la categoria, anche la voce marcata condivisa sparisce');
select pg_temp.q_as('00000000-0000-0000-0000-00000000a001', $$select public.set_sharing('journal', true)::text$$);
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'journal_entries'), 1, 'DIARIO: ripristinata la categoria torna visibile solo la voce condivisa');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.journal_entries set shared_with_partner = false where title = 'Condivisa'$$), 'ok:1', 'Alessia ritira il consenso per la singola voce');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'journal_entries'), 0, 'DIARIO: voce ritirata, Phill non vede nulla');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.journal_entries set shared_with_partner = true$$), 'ok:0', 'Phill non può marcare come condivise le voci di Alessia');
update public.journal_entries set shared_with_partner = true where title = 'Condivisa';

-- ================================================================== FASE 4: interruttore generale
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a001', $$select public.revoke_all_sharing()::text$$)::jsonb ->> 'revoked', '7', 'revoke_all_sharing revoca i 7 permessi attivi');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', tbl), 0, 'REVOCA TOTALE: Phill non vede ' || tbl) from cat_tables;
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', t), 0, 'REVOCA TOTALE: Phill non vede ' || t) from unnest(array['journal_entries','calendar_events','wellbeing_notes']) t;

-- ================================================================== FASE 5: fine del collegamento
select pg_temp.q_as('00000000-0000-0000-0000-00000000a001', format($$select public.set_sharing(%L, true)::text$$, c))
  from unnest(array['activities','habits','calendar','progress','equipment','wellbeing','journal']) c;
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'equipment'), 1, 'prima della fine Phill vede l''attrezzatura');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b001', $$select public.end_partnership()::text$$)::jsonb ->> 'ok', 'true', 'Phill termina il collegamento');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', tbl), 0, 'FINE COLLEGAMENTO: Phill non vede ' || tbl) from cat_tables;
select is((select count(*)::int from public.sharing_permissions where revoked_at is null), 0, 'fine collegamento: nessun permesso attivo');
select is((select count(*)::int from public.journal_entries where shared_with_partner), 0, 'fine collegamento: i consensi per voce sono azzerati');

-- nuovo collegamento con un ALTRO Phill: non eredita nulla
insert into public.partnerships (alessia_id, phill_id) values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000b002');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b002', tbl), 0, 'NUOVO PARTNER: non eredita ' || tbl) from cat_tables;
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b002', 'journal_entries'), 0, 'NUOVO PARTNER: non vede voci di diario');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'equipment'), 0, 'il vecchio partner resta escluso');
-- anche ricollegandosi allo stesso Phill, serve una nuova concessione
update public.partnerships set status = 'ended', ended_at = now() where phill_id = '00000000-0000-0000-0000-00000000b002' and status = 'active';
insert into public.partnerships (alessia_id, phill_id) values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000b001');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'equipment'), 0, 'RICOLLEGAMENTO: lo stesso Phill non rivede nulla senza una nuova condivisione');
select pg_temp.q_as('00000000-0000-0000-0000-00000000a001', $$select public.set_sharing('equipment', true)::text$$);
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'equipment'), 1, 'RICOLLEGAMENTO: dopo una nuova concessione vede solo quella categoria');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'workouts'), 0, 'RICOLLEGAMENTO: le altre categorie restano private');

select * from finish();
rollback;
