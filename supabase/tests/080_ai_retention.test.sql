-- Test pgTAP: conservazione dei dati AI (90 giorni) e privilegi minimi.
begin;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a011', 'a11@test.local', '{"role":"alessia","display_name":"Ale Undici"}');

-- una riga vecchia, una quasi vecchia, una recente; più dati di altre tabelle (vecchi) che NON devono essere toccati
insert into public.ai_generations (user_id, kind, status, output, created_at) values
  ('00000000-0000-0000-0000-00000000a011', 'daily', 'ok', '{"value":{"text":"vecchio"}}', now() - interval '91 days'),
  ('00000000-0000-0000-0000-00000000a011', 'reflection', 'rejected', '{"stage":"semantic"}', now() - interval '120 days'),
  ('00000000-0000-0000-0000-00000000a011', 'daily', 'ok', '{"value":{"text":"quasi"}}', now() - interval '89 days'),
  ('00000000-0000-0000-0000-00000000a011', 'daily', 'ok', '{"value":{"text":"recente"}}', now());
insert into public.journal_entries (owner_id, body, created_at) values ('00000000-0000-0000-0000-00000000a011', 'voce vecchia di diario', now() - interval '400 days');
insert into public.workouts (owner_id, title, created_at) values ('00000000-0000-0000-0000-00000000a011', 'scheda vecchia', now() - interval '400 days');
insert into public.progress_records (owner_id, kind, title, achieved_on) values ('00000000-0000-0000-0000-00000000a011', 'small_win', 'piccola conquista vecchia', current_date - 400);
insert into public.calendar_events (owner_id, created_by, title, category, starts_at) values ('00000000-0000-0000-0000-00000000a011', '00000000-0000-0000-0000-00000000a011', 'evento vecchio', 'personal', now() - interval '400 days');

select is(public.purge_old_ai_generations(), 2, 'cancella solo le 2 righe più vecchie di 90 giorni');
select is((select count(*)::int from public.ai_generations where user_id = '00000000-0000-0000-0000-00000000a011'), 2, 'restano quella di 89 giorni e quella di oggi');
select is((select count(*)::int from public.ai_generations where output::text like '%vecchio%'), 0, 'il contenuto vecchio non esiste più');
select is(public.purge_old_ai_generations(), 0, 'idempotente: una seconda esecuzione non cancella altro');
select is((select count(*)::int from public.journal_entries where owner_id = '00000000-0000-0000-0000-00000000a011'), 1, 'il diario non viene toccato, per quanto vecchio');
select is((select count(*)::int from public.workouts where owner_id = '00000000-0000-0000-0000-00000000a011'), 1, 'le schede non vengono toccate');
select is((select count(*)::int from public.progress_records where owner_id = '00000000-0000-0000-0000-00000000a011'), 1, 'i progressi non vengono toccati');
select is((select count(*)::int from public.calendar_events where owner_id = '00000000-0000-0000-0000-00000000a011'), 1, 'il calendario non viene toccato');

select is(has_function_privilege('authenticated', 'public.purge_old_ai_generations()', 'execute'), false, 'privilegi minimi: un utente non può eseguire la pulizia');
select is(has_function_privilege('anon', 'public.purge_old_ai_generations()', 'execute'), false, 'nemmeno anon');
select is((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.purge_old_ai_generations()'::regprocedure), true, 'security definer con search_path vuoto');
select is((select count(*)::int from cron.job where jobname = 'ale-purge-ai-generations' and schedule = '30 3 * * *'), 1, 'il job automatico è pianificato ogni notte');

select * from finish();
rollback;
