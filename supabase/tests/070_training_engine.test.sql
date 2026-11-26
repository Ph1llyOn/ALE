-- Test pgTAP: motore di allenamento — feedback privati, sessioni guidate, piano nel calendario, impostazioni di allenamento.
begin;
select no_plan();

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function pg_temp.count_as(p_user uuid, p_sql text) returns int language plpgsql as $$
declare n int;
begin
  perform pg_temp.login(p_user);
  begin execute 'select count(*) from (' || p_sql || ') q' into n; exception when insufficient_privilege then n := -1; end;
  reset role; return n;
end $$;
create function pg_temp.try_sql(p_user uuid, p_sql text) returns text language plpgsql as $$
declare n int;
begin
  perform pg_temp.login(p_user);
  begin execute p_sql; get diagnostics n = row_count; reset role; return 'ok:' || n;
  exception when insufficient_privilege then reset role; return 'denied';
            when others then reset role; return 'error:' || sqlstate; end;
end $$;
create function pg_temp.q_as(p_user uuid, p_sql text) returns text language plpgsql as $$
declare r text;
begin
  perform pg_temp.login(p_user);
  begin execute p_sql into r; exception when others then r := 'error:' || sqlstate; end;
  reset role; return r;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a009', 'a9@test.local', '{"role":"alessia","display_name":"Ale Nove"}'),
  ('00000000-0000-0000-0000-00000000b009', 'b9@test.local', '{"role":"phill","display_name":"Phill Nove"}'),
  ('00000000-0000-0000-0000-00000000b010', 'b10@test.local', '{"role":"phill","display_name":"Phill Dieci"}');
insert into public.partnerships (alessia_id, phill_id) values ('00000000-0000-0000-0000-00000000a009', '00000000-0000-0000-0000-00000000b009');

-- ================================================================== struttura
select is((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.exercise_feedback'::regclass), true, 'exercise_feedback: RLS attiva e FORZATA');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'exercise_feedback'), 4, 'exercise_feedback: quattro policy (select/insert/update/delete), tutte solo del proprietario');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'exercise_feedback' and qual like '%can_view%'), 0, 'exercise_feedback: nessuna policy usa la condivisione (mai visibile al partner)');
select is((select count(*)::int from information_schema.role_table_grants where table_schema = 'public' and table_name = 'exercise_feedback' and grantee in ('anon', 'public')), 0, 'exercise_feedback: nessun privilegio per anon/public');
select is((select count(*)::int from pg_trigger where tgrelid = 'public.exercise_feedback'::regclass and tgname = 'exercise_feedback_owner_immutable'), 1, 'exercise_feedback: il proprietario non si cambia');
select has_column('public', 'user_settings', 'avoid_flags', 'impostazioni: limitazioni indicate dal professionista');
select has_column('public', 'calendar_events', 'plan_key', 'calendario: chiave del piano');

-- ================================================================== sessione + feedback
insert into public.workout_sessions (id, owner_id, title, plan, run_state)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000a009', 'Forza', '{"items":[]}', '{"v":1}');
insert into public.session_exercise_progress (session_id, owner_id, position, name, exercise_key, sets_total)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000a009', 0, 'Squat', 'squat', 3);

select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$insert into public.exercise_feedback (owner_id, session_id, exercise_key, rating, note) values ('00000000-0000-0000-0000-00000000a009', '00000000-0000-0000-0000-0000000000f1', 'squat', 'pain', 'nota privata')$$), 'ok:1', 'Alessia salva un feedback');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$insert into public.exercise_feedback (owner_id, session_id, exercise_key, rating) values ('00000000-0000-0000-0000-00000000a009', '00000000-0000-0000-0000-0000000000f1', 'squat', 'right')$$), 'error:23505', 'uno solo per esercizio e sessione');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$insert into public.exercise_feedback (owner_id, session_id, exercise_key, rating) values ('00000000-0000-0000-0000-00000000a009', '00000000-0000-0000-0000-0000000000f1', 'plank', 'boh')$$), 'error:23514', 'valutazione non valida rifiutata');
select pg_temp.q_as('00000000-0000-0000-0000-00000000a009', $$select public.set_sharing('activities', true)::text$$);
select pg_temp.q_as('00000000-0000-0000-0000-00000000a009', $$select public.set_sharing('progress', true)::text$$);
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b009', 'select 1 from public.session_exercise_progress'), 1, 'con le attività condivise Phill vede l''avanzamento');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b009', 'select 1 from public.exercise_feedback'), 0, 'PRIVACY: ma non vede MAI i feedback');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b010', 'select 1 from public.exercise_feedback'), 0, 'un estraneo nemmeno');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b009', $$insert into public.exercise_feedback (owner_id, session_id, exercise_key, rating) values ('00000000-0000-0000-0000-00000000a009', '00000000-0000-0000-0000-0000000000f1', 'plank', 'right')$$), 'denied', 'Phill non scrive feedback per Alessia');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b009', $$update public.exercise_feedback set rating = 'right'$$), 'ok:0', 'né li modifica');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b009', $$delete from public.exercise_feedback$$), 'ok:0', 'né li cancella');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$update public.exercise_feedback set owner_id = '00000000-0000-0000-0000-00000000b009'$$), 'error:P0001', 'il proprietario del feedback non cambia');

-- ================================================================== coerenza di stato
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$update public.session_exercise_progress set status = 'skipped', done = true$$), 'error:23514', 'un esercizio saltato non può essere "fatto"');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$update public.session_exercise_progress set status = 'done', done = true, sets_done = 3$$), 'ok:1', 'un esercizio fatto lo è davvero');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$update public.workout_sessions set status = 'stopped'$$), 'error:23514', 'interrotta senza data di fine: rifiutata');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$update public.workout_sessions set status = 'stopped', ended_at = now()$$), 'ok:1', 'sessione interrotta correttamente');

-- ================================================================== piano nel calendario
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$insert into public.calendar_events (owner_id, created_by, title, category, starts_at, source, plan_key) values ('00000000-0000-0000-0000-00000000a009', '00000000-0000-0000-0000-00000000a009', 'Forza', 'workout', now(), 'plan', '2030-W02:1:plan')$$), 'ok:1', 'evento del piano creato da Alessia');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$insert into public.calendar_events (owner_id, created_by, title, category, starts_at, source, plan_key) values ('00000000-0000-0000-0000-00000000a009', '00000000-0000-0000-0000-00000000a009', 'Forza bis', 'workout', now(), 'plan', '2030-W02:1:plan')$$), 'error:23505', 'NESSUN duplicato: stessa chiave rifiutata');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$insert into public.calendar_events (owner_id, created_by, title, category, starts_at, source) values ('00000000-0000-0000-0000-00000000a009', '00000000-0000-0000-0000-00000000a009', 'Cena', 'personal', now(), 'plan')$$), 'error:23514', 'evento del piano senza chiave rifiutato');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b009', $$insert into public.calendar_events (owner_id, created_by, title, category, starts_at, source, plan_key, status) values ('00000000-0000-0000-0000-00000000a009', '00000000-0000-0000-0000-00000000b009', 'Finto piano', 'workout', now(), 'plan', '2030-W02:2:plan', 'proposed')$$), 'error:23514', 'il piano lo crea solo Alessia, non Phill');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$insert into public.calendar_events (owner_id, created_by, title, category, starts_at) values ('00000000-0000-0000-0000-00000000a009', '00000000-0000-0000-0000-00000000a009', 'Dentista', 'personal', now())$$), 'ok:1', 'gli eventi personali restano senza chiave');

-- ================================================================== impostazioni di allenamento (private)
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$insert into public.user_settings (user_id, fitness_level, available_days, avoid_flags) values ('00000000-0000-0000-0000-00000000a009', 'intermediate', '{1,3,5}', '{lumbar}')$$), 'ok:1', 'impostazioni di allenamento salvate');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$update public.user_settings set avoid_flags = '{inventato}'$$), 'error:23514', 'limitazione sconosciuta rifiutata');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$update public.user_settings set available_days = '{}'$$), 'error:23514', 'serve almeno un giorno disponibile');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a009', $$update public.user_settings set session_minutes = 3$$), 'error:23514', 'durata fuori misura rifiutata');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b009', 'select 1 from public.user_settings'), 0, 'PRIVATE: Phill non vede le impostazioni (limitazioni incluse)');

select * from finish();
rollback;
