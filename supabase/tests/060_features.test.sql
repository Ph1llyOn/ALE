-- Test pgTAP Tappa 2: obiettivi, impostazioni private, preferenze di notifica, proposte, promemoria.
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
  reset role;
  return n;
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
  reset role;
  return r;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a007', 'a7@test.local', '{"role":"alessia","display_name":"Ale Sette"}'),
  ('00000000-0000-0000-0000-00000000b007', 'b7@test.local', '{"role":"phill","display_name":"Phill Sette"}'),
  ('00000000-0000-0000-0000-00000000b008', 'b8@test.local', '{"role":"phill","display_name":"Phill Otto"}');
insert into public.partnerships (alessia_id, phill_id) values ('00000000-0000-0000-0000-00000000a007', '00000000-0000-0000-0000-00000000b007');

-- ================================================================== OBIETTIVI
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a007', $$insert into public.goals (owner_id, title, target_date) values ('00000000-0000-0000-0000-00000000a007', 'Camminare 3 volte a settimana', current_date + 30)$$), 'ok:1', 'Alessia crea un obiettivo');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a007', $$insert into public.goals (owner_id, title) values ('00000000-0000-0000-0000-00000000a007', '')$$), 'error:23514', 'titolo vuoto rifiutato');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a007', $$update public.goals set status = 'done'$$), 'error:23514', 'un obiettivo "fatto" richiede la data di completamento');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a007', $$update public.goals set status = 'done', completed_at = now()$$), 'ok:1', 'obiettivo completato');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b007', 'select 1 from public.goals'), 0, 'PRIVATO di default: Phill non vede gli obiettivi');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b008', 'select 1 from public.goals'), 0, 'un estraneo non vede gli obiettivi');
select pg_temp.q_as('00000000-0000-0000-0000-00000000a007', $$select public.set_sharing('progress', true)::text$$);
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b007', 'select 1 from public.goals'), 1, 'con la categoria "progressi" condivisa Phill li vede');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b007', $$update public.goals set title = 'Hack'$$), 'ok:0', 'ma non li modifica');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b007', $$delete from public.goals$$), 'ok:0', 'né li cancella');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b007', $$insert into public.goals (owner_id, title) values ('00000000-0000-0000-0000-00000000a007','Imposto')$$), 'denied', 'né ne crea per lei');
select pg_temp.q_as('00000000-0000-0000-0000-00000000a007', $$select public.revoke_all_sharing()::text$$);
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b007', 'select 1 from public.goals'), 0, 'revocata la condivisione, spariscono');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a007', $$update public.goals set owner_id = '00000000-0000-0000-0000-00000000b007'$$), 'error:P0001', 'un obiettivo non cambia proprietario');

-- ================================================================== PICCOLE CONQUISTE senza duplicati
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a007', $$insert into public.progress_records (owner_id, kind, title) values ('00000000-0000-0000-0000-00000000a007','small_win','Prima passeggiata')$$), 'ok:1', 'una conquista');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a007', $$insert into public.progress_records (owner_id, kind, title) values ('00000000-0000-0000-0000-00000000a007','small_win','Prima passeggiata')$$), 'error:23505', 'la stessa conquista nello stesso giorno non si duplica');

-- ================================================================== IMPOSTAZIONI PRIVATE
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a007', $$insert into public.user_settings (user_id, spaces, prefers_no_equipment, professional_notes) values ('00000000-0000-0000-0000-00000000a007', 'Salotto e balcone', true, 'Evitare salti: indicazione della fisioterapista')$$), 'ok:1', 'Alessia salva spazi e indicazioni del professionista');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b007', 'select 1 from public.user_settings'), 0, 'Phill (collegato) non vede le impostazioni');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b008', 'select 1 from public.user_settings'), 0, 'un estraneo nemmeno');
select pg_temp.q_as('00000000-0000-0000-0000-00000000a007', $$select public.set_sharing('equipment', true)::text$$);
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b007', 'select 1 from public.user_settings'), 0, 'condividere l''attrezzatura non rivela le impostazioni');
select pg_temp.q_as('00000000-0000-0000-0000-00000000a007', $$select public.revoke_all_sharing()::text$$);
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b007', $$insert into public.user_settings (user_id) values ('00000000-0000-0000-0000-00000000a007')$$), 'denied', 'Phill non crea impostazioni per Alessia');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b007', $$update public.user_settings set spaces = 'x'$$), 'ok:0', 'né le modifica');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a007', $$update public.user_settings set professional_notes = repeat('x', 1001)$$), 'error:23514', 'lunghezza massima rispettata');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a007', $$update public.user_settings set onboarding_steps = '[]'$$), 'error:23514', 'lo stato dell''onboarding è un oggetto');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a007', $$update public.user_settings set onboarding_steps = '{"equipment":"skipped"}', onboarding_done_at = now()$$), 'ok:1', 'onboarding saltabile e salvabile');

-- ================================================================== PREFERENZE DI NOTIFICA
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a007', 'select 1 from public.notification_preferences'), 0, 'nessuna riga = tutto attivo');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a007', $$insert into public.notification_preferences (user_id, messages) values ('00000000-0000-0000-0000-00000000a007', false)$$), 'ok:1', 'Alessia disattiva le notifiche dei messaggi');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b007', $$update public.notification_preferences set messages = true$$), 'ok:0', 'Phill non cambia le preferenze di Alessia');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b007', 'select 1 from public.notification_preferences'), 0, 'e non le vede');
select lives_ok($$select public.notify('00000000-0000-0000-0000-00000000a007', 'message', 'x')$$, 'notify funziona per il server (postgres)');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a007', $$select public.notify('00000000-0000-0000-0000-00000000a007','message','x')::text$$), 'error:42501', 'un utente non può creare notifiche (nemmeno per sé)');

delete from public.notifications;
insert into public.messages (sender_id, recipient_id, body) values ('00000000-0000-0000-0000-00000000b007', '00000000-0000-0000-0000-00000000a007', 'Con notifiche spente');
select is((select count(*)::int from public.notifications), 0, 'con "messaggi" disattivato nessuna notifica');
update public.notification_preferences set messages = true;
insert into public.messages (sender_id, recipient_id, body) values ('00000000-0000-0000-0000-00000000b007', '00000000-0000-0000-0000-00000000a007', 'Con notifiche accese');
select is((select count(*)::int from public.notifications where kind = 'message'), 1, 'riattivato, la notifica arriva');
select is((select link from public.notifications where kind = 'message'), '#/biglietti', 'con il link alla schermata giusta');

-- ================================================================== PROPOSTE: notifiche + accettazione atomica
delete from public.notifications;
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b007', $$insert into public.workout_proposals (owner_id, proposer_id, title, notes, exercises) values ('00000000-0000-0000-0000-00000000a007','00000000-0000-0000-0000-00000000b007','Scheda gambe','Con calma','[{"name":"Squat","exercise_key":"squat","sets":3,"reps":"10","rest_seconds":60},{"name":"Ponte glutei","exercise_key":"glute-bridge","sets":2,"reps":"12"}]')$$), 'ok:1', 'Phill propone una scheda');
update public.workout_proposals set id = '70000000-0000-0000-0000-000000000001' where title = 'Scheda gambe';
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-00000000a007' and kind = 'proposal'), 1, 'Alessia riceve la notifica della proposta');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b007', $$select (public.accept_workout_proposal('70000000-0000-0000-0000-000000000001') ->> 'error')$$), 'not_found', 'Phill non può accettare la propria proposta');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b008', $$select (public.accept_workout_proposal('70000000-0000-0000-0000-000000000001') ->> 'error')$$), 'not_found', 'un estraneo nemmeno');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a007', $$select (public.accept_workout_proposal('70000000-0000-0000-0000-000000000001', 'Gambe, versione mia', '[{"name":"Squat","sets":2,"reps":"8"},{"name":"Plank"}]'::jsonb) ->> 'ok')$$), 'true', 'Alessia accetta modificando titolo ed esercizi');
select is((select title from public.workouts where owner_id = '00000000-0000-0000-0000-00000000a007' and source = 'proposal'), 'Gambe, versione mia', 'la scheda creata ha il titolo scelto da lei');
select is((select count(*)::int from public.workout_exercises e join public.workouts w on w.id = e.workout_id where w.source = 'proposal'), 2, 'con gli esercizi modificati da lei');
select is((select status from public.workout_proposals where id = '70000000-0000-0000-0000-000000000001'), 'accepted', 'proposta accettata');
select isnt((select workout_id from public.workout_proposals where id = '70000000-0000-0000-0000-000000000001'), null, 'collegata alla scheda');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-00000000b007' and kind = 'proposal'), 1, 'Phill riceve l''esito');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a007', $$select (public.accept_workout_proposal('70000000-0000-0000-0000-000000000001') ->> 'error')$$), 'already_decided', 'una proposta si decide una volta sola');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b007', 'select 1 from public.workouts'), 0, 'Phill non vede la scheda di Alessia (non condivisa)');

insert into public.workout_proposals (id, owner_id, proposer_id, title, exercises) values ('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000a007', '00000000-0000-0000-0000-00000000b007', 'Scheda guasta', '[{"sets":3}]');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a007', $$select (public.accept_workout_proposal('70000000-0000-0000-0000-000000000002') ->> 'error')$$), 'invalid_exercises', 'un esercizio senza nome è rifiutato');
select is((select count(*)::int from public.workouts where title = 'Scheda guasta'), 0, 'e non resta nessuna scheda a metà');
select is((select status from public.workout_proposals where id = '70000000-0000-0000-0000-000000000002'), 'proposed', 'la proposta resta in attesa');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a007', $$select (public.accept_workout_proposal('70000000-0000-0000-0000-000000000002', null, '{"a":1}'::jsonb) ->> 'error')$$), 'invalid_exercises', 'gli esercizi devono essere una lista');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a007', $$update public.workout_proposals set status = 'rejected' where id = '70000000-0000-0000-0000-000000000002'$$), 'ok:1', 'Alessia può anche rifiutare');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-00000000b007' and body = 'Scheda guasta'), 1, 'Phill riceve anche il rifiuto');
set local role anon;
select throws_ok($$select public.accept_workout_proposal(gen_random_uuid())$$, '42501', null, 'anon non può accettare proposte');
reset role;
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a007', $$insert into public.workout_exercises (workout_id, owner_id, name, exercise_key) select id, owner_id, 'x', 'NON VALIDO!' from public.workouts limit 1$$), 'error:23514', 'chiave di catalogo non valida rifiutata');

-- ================================================================== EVENTI PROPOSTI: notifiche
delete from public.notifications;
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b007', $$insert into public.calendar_events (id, owner_id, created_by, title, category, starts_at, status) values ('80000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000a007','00000000-0000-0000-0000-00000000b007','Cena','personal', now() + interval '1 day', 'proposed')$$), 'ok:1', 'Phill propone un evento');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-00000000a007' and kind = 'proposal'), 1, 'Alessia riceve la notifica');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a007', $$update public.calendar_events set status = 'confirmed' where id = '80000000-0000-0000-0000-000000000001'$$), 'ok:1', 'Alessia accetta');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-00000000b007' and kind = 'proposal'), 1, 'Phill riceve l''esito');

-- ================================================================== PROMEMORIA SERVER-SIDE
delete from public.notifications;
insert into public.calendar_events (id, owner_id, created_by, title, category, starts_at) values
  ('90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a007', '00000000-0000-0000-0000-00000000a007', 'Bere un bicchiere d''acqua', 'reminder', now() - interval '1 minute'),
  ('90000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000a007', '00000000-0000-0000-0000-00000000a007', 'Tra un''ora', 'reminder', now() + interval '1 hour'),
  ('90000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000a007', '00000000-0000-0000-0000-00000000a007', 'Passeggiata (non promemoria)', 'walk', now() - interval '1 minute'),
  ('90000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000a007', '00000000-0000-0000-0000-00000000a007', 'Già fatto', 'reminder', now() - interval '2 minutes');
update public.calendar_events set completed = true where id = '90000000-0000-0000-0000-000000000004';
select is(public.generate_due_notifications(), 1, 'solo il promemoria scaduto e non completato genera una notifica');
select is((select title from public.notifications where kind = 'reminder'), 'Bere un bicchiere d''acqua', 'con il testo del promemoria');
select is(public.generate_due_notifications(), 0, 'nessuna doppia notifica');
select isnt((select notified_at from public.calendar_events where id = '90000000-0000-0000-0000-000000000001'), null, 'il promemoria risulta notificato');
select is((select count(*)::int from public.notifications where body is not null and kind = 'reminder'), 0, 'nessun dettaglio extra');
update public.notification_preferences set reminders = false;
update public.calendar_events set starts_at = now() - interval '1 minute', notified_at = null where id = '90000000-0000-0000-0000-000000000001';
select is(public.generate_due_notifications(), 1, 'processato anche con le preferenze spente…');
select is((select count(*)::int from public.notifications where kind = 'reminder'), 1, '…ma senza creare una seconda notifica');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a007', $$select public.generate_due_notifications()::text$$), 'error:42501', 'solo il server può eseguire la generazione');
select ok(not exists (select 1 from pg_available_extensions where name = 'pg_cron') or exists (select 1 from cron.job where jobname = 'ale-due-notifications' and schedule = '* * * * *'), 'se pg_cron c''è, i promemoria sono pianificati ogni minuto');

-- ================================================================== AI: una generazione "del giorno" per tipo
insert into public.ai_generations (user_id, kind, status, for_day) values ('00000000-0000-0000-0000-00000000a007', 'daily', 'ok', current_date);
select throws_ok($$insert into public.ai_generations (user_id, kind, status, for_day) values ('00000000-0000-0000-0000-00000000a007', 'daily', 'ok', current_date)$$, '23505', null, 'una sola motivazione del giorno per persona');
select lives_ok($$insert into public.ai_generations (user_id, kind, status, for_day) values ('00000000-0000-0000-0000-00000000a007', 'daily', 'rejected', current_date)$$, 'i tentativi scartati si registrano comunque');
select lives_ok($$insert into public.ai_generations (user_id, kind, status, for_day) values ('00000000-0000-0000-0000-00000000a007', 'daily', 'ok', current_date + 1)$$, 'un altro giorno è un''altra generazione');

-- ================================================================== NOTIFICHE: link e invio push
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a007', $$select count(*)::text from public.notifications$$), (select count(*)::text from public.notifications where user_id = '00000000-0000-0000-0000-00000000a007'), 'ognuno vede solo le proprie notifiche');
select throws_ok($$insert into public.notifications (user_id, kind, title, link) values ('00000000-0000-0000-0000-00000000a007','x','y','https://sito-esterno.example')$$, '23514', null, 'il link di una notifica è sempre interno all''app');

select * from finish();
rollback;
