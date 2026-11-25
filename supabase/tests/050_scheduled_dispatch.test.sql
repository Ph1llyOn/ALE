-- Test pgTAP Fase 3: invio programmato dei messaggi (infrastruttura server-side).
begin;
select no_plan();

create function pg_temp.login(p_user uuid, p_role text default 'authenticated') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
end $$;

create function pg_temp.count_as(p_user uuid, p_sql text) returns int
language plpgsql as $$
declare n int;
begin
  perform pg_temp.login(p_user);
  begin execute 'select count(*) from (' || p_sql || ') q' into n;
  exception when insufficient_privilege then n := -1; end;
  reset role;
  return n;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a005', 'a5@test.local', '{"role":"alessia","display_name":"Ale Cinque"}'),
  ('00000000-0000-0000-0000-00000000b005', 'b5@test.local', '{"role":"phill","display_name":"Phill Cinque"}'),
  ('00000000-0000-0000-0000-00000000a006', 'a6@test.local', '{"role":"alessia","display_name":"Ale Sei"}'),
  ('00000000-0000-0000-0000-00000000b006', 'b6@test.local', '{"role":"phill","display_name":"Phill Sei"}');
insert into public.partnerships (alessia_id, phill_id) values ('00000000-0000-0000-0000-00000000a005', '00000000-0000-0000-0000-00000000b005');
-- a6 e b6 NON sono collegati.

insert into public.scheduled_messages (id, sender_id, recipient_id, title, body, send_at, status) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000b005', '00000000-0000-0000-0000-00000000a005', 'Buongiorno', 'Ti penso',      now() - interval '1 minute', 'pending'),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000b005', '00000000-0000-0000-0000-00000000a005', 'Domani',     'Non ancora',    now() + interval '1 day',    'pending'),
  ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000b006', '00000000-0000-0000-0000-00000000a006', 'Estranei',   'Non collegati', now() - interval '1 minute', 'pending'),
  ('50000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000b005', '00000000-0000-0000-0000-00000000a005', 'Annullato',  'Già annullato', now() - interval '1 minute', 'cancelled'),
  ('50000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000b005', '00000000-0000-0000-0000-00000000a005', 'Guasto',     'boom',          now() - interval '1 minute', 'pending');

-- un guasto simulato: i messaggi con testo "boom" non si possono inserire
create function public.zz_boom() returns trigger language plpgsql as $$
begin
  if new.body = 'boom' then raise exception 'guasto simulato'; end if;
  return new;
end $$;
create trigger zz_boom before insert on public.messages for each row execute function public.zz_boom();

-- ------------------------------------------------------------------ permessi: solo il server
select pg_temp.login('00000000-0000-0000-0000-00000000a005');
select throws_ok($$select public.dispatch_due_scheduled_messages()$$, '42501', null, 'un utente autenticato non può far partire l''invio');
reset role;
set local role anon;
select throws_ok($$select public.dispatch_due_scheduled_messages()$$, '42501', null, 'anon non può far partire l''invio');
reset role;
select is((select has_function_privilege('public', 'public.dispatch_due_scheduled_messages(integer)', 'execute')), false, 'PUBLIC non ha il privilegio di eseguire la funzione');
select is((select has_function_privilege('service_role', 'public.dispatch_due_scheduled_messages(integer)', 'execute')), true, 'il server (service_role) può eseguirla');

-- ------------------------------------------------------------------ invio
select is(public.dispatch_due_scheduled_messages(0), 0, 'limite 0: non invia nulla');
select is(public.dispatch_due_scheduled_messages(null), 0, 'limite nullo: non invia nulla');
select is((select count(*)::int from public.messages), 0, 'nessun messaggio è partito con limite zero');
select is(public.dispatch_due_scheduled_messages(), 1, 'viene inviato esattamente il messaggio scaduto tra partner collegati');

select is((select status from public.scheduled_messages where id = '50000000-0000-0000-0000-000000000001'), 'sent', 'il messaggio scaduto risulta inviato');
select isnt((select message_id from public.scheduled_messages where id = '50000000-0000-0000-0000-000000000001'), null, 'collegato al messaggio creato');
select is((select count(*)::int from public.messages where sender_id = '00000000-0000-0000-0000-00000000b005' and recipient_id = '00000000-0000-0000-0000-00000000a005' and title = 'Buongiorno' and body = 'Ti penso'), 1, 'il messaggio creato ha mittente, destinataria, titolo e testo corretti');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-00000000a005' and kind = 'message'), 1, 'la destinataria riceve una notifica in-app');
select is((select body from public.notifications where user_id = '00000000-0000-0000-0000-00000000a005' and kind = 'message'), null, 'la notifica non contiene il testo');
select is((select status from public.scheduled_messages where id = '50000000-0000-0000-0000-000000000002'), 'pending', 'un messaggio futuro resta in attesa');
select is((select status from public.scheduled_messages where id = '50000000-0000-0000-0000-000000000003'), 'cancelled', 'senza collegamento attivo il messaggio viene annullato, non inviato');
select is((select last_error from public.scheduled_messages where id = '50000000-0000-0000-0000-000000000003'), 'collegamento non attivo', 'con il motivo registrato');
select is((select count(*)::int from public.messages where sender_id = '00000000-0000-0000-0000-00000000b006'), 0, 'nessun messaggio tra non collegati');
select is((select status from public.scheduled_messages where id = '50000000-0000-0000-0000-000000000004'), 'cancelled', 'un messaggio annullato non viene mai inviato');

-- ------------------------------------------------------------------ errori e ritentativi
select is((select status from public.scheduled_messages where id = '50000000-0000-0000-0000-000000000005'), 'pending', 'un invio guasto resta in attesa per riprovare');
select is((select attempts from public.scheduled_messages where id = '50000000-0000-0000-0000-000000000005'), 1, 'il tentativo è contato');
select ok((select last_error from public.scheduled_messages where id = '50000000-0000-0000-0000-000000000005') like '%guasto simulato%', 'e l''errore è registrato');
select is((select count(*)::int from public.messages where body = 'boom'), 0, 'nessun messaggio parziale dopo il guasto');
select public.dispatch_due_scheduled_messages();
select public.dispatch_due_scheduled_messages();
select public.dispatch_due_scheduled_messages();
select public.dispatch_due_scheduled_messages();
select is((select status from public.scheduled_messages where id = '50000000-0000-0000-0000-000000000005'), 'failed', 'dopo 5 tentativi falliti lo stato è "failed"');
select is((select attempts from public.scheduled_messages where id = '50000000-0000-0000-0000-000000000005'), 5, 'esattamente 5 tentativi');
select is(public.dispatch_due_scheduled_messages(), 0, 'un invio fallito definitivamente non viene più ritentato');

-- ------------------------------------------------------------------ idempotenza e visibilità
select is((select count(*)::int from public.messages where title = 'Buongiorno'), 1, 'nessun doppio invio dopo più esecuzioni');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a005', 'select 1 from public.messages'), 1, 'la destinataria vede il messaggio arrivato');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b005', 'select 1 from public.messages'), 1, 'il mittente lo vede nella cronologia');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a006', 'select 1 from public.messages'), 0, 'un''altra persona non lo vede');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a005', 'select 1 from public.scheduled_messages'), 0, 'la destinataria non vede mai i programmati');

-- il server (service_role) può eseguire la funzione
insert into public.scheduled_messages (sender_id, recipient_id, body, send_at) values ('00000000-0000-0000-0000-00000000b005', '00000000-0000-0000-0000-00000000a005', 'Da service role', now() - interval '1 second');
set local role service_role;
select is(public.dispatch_due_scheduled_messages(), 1, 'la service role esegue l''invio');
reset role;

-- ------------------------------------------------------------------ pianificazione
select ok(
  not exists (select 1 from pg_available_extensions where name = 'pg_cron')
  or exists (select 1 from cron.job where jobname = 'ale-dispatch-scheduled-messages' and schedule = '* * * * *'
              and command = 'select public.dispatch_due_scheduled_messages()'),
  'se pg_cron è disponibile, l''invio è pianificato ogni minuto');

select * from finish();
rollback;
