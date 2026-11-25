-- Test pgTAP Fase 2: canali di scrittura (proposte, messaggi), tabelle personali, consenso AI.
-- Attori: A1 (Alessia), B1 (Phill collegato ad A1), A2 (altra Alessia), B2 (Phill estraneo).
begin;
select no_plan();

create function pg_temp.login(p_user uuid, p_role text default 'authenticated', p_extra jsonb default '{}') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', p_user, 'role', p_role) || p_extra)::text, true);
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

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a001', 'a1@test.local', '{"role":"alessia","display_name":"Ale Uno"}'),
  ('00000000-0000-0000-0000-00000000a002', 'a2@test.local', '{"role":"alessia","display_name":"Ale Due"}'),
  ('00000000-0000-0000-0000-00000000b001', 'b1@test.local', '{"role":"phill","display_name":"Phill Uno"}'),
  ('00000000-0000-0000-0000-00000000b002', 'b2@test.local', '{"role":"phill","display_name":"Phill Due"}');
insert into public.partnerships (alessia_id, phill_id) values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000b001');

-- ================================================================== CALENDARIO: Phill propone, Alessia decide
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.calendar_events (owner_id, created_by, title, category, starts_at, status) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','Cena insieme','personal', now() + interval '2 days','proposed')$$), 'ok:1', 'Phill propone un evento ad Alessia');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.calendar_events (owner_id, created_by, title, category, starts_at, status) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','Imposto','personal', now(),'confirmed')$$), 'denied', 'Phill non può creare eventi già confermati nel calendario di Alessia');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.calendar_events (owner_id, created_by, title, category, starts_at, status) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000a001','Falso autore','personal', now(),'proposed')$$), 'denied', 'Phill non può falsificare l''autore');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.calendar_events (owner_id, created_by, title, category, starts_at, status) values ('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-00000000b001','Non è la mia','personal', now(),'proposed')$$), 'denied', 'Phill non propone eventi a chi non è il suo partner');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b002', $$insert into public.calendar_events (owner_id, created_by, title, category, starts_at, status) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b002','Estraneo','personal', now(),'proposed')$$), 'denied', 'un estraneo non propone eventi ad Alessia');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.calendar_events (owner_id, created_by, title, category, starts_at, ends_at, status) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','Fine prima','personal', now(), now() - interval '1 hour','proposed')$$), 'error:23514', 'un evento non può finire prima di iniziare');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.calendar_events (owner_id, created_by, title, category, starts_at, status) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','x','sconosciuta', now(),'proposed')$$), 'error:23514', 'categoria di calendario non valida rifiutata');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a001', 'select 1 from public.calendar_events'), 1, 'Alessia vede la proposta');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'select 1 from public.calendar_events'), 1, 'Phill vede la propria proposta senza alcun permesso di calendario');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b002', 'select 1 from public.calendar_events'), 0, 'un estraneo non la vede');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.calendar_events set status = 'confirmed'$$), 'ok:0', 'Phill non può approvare la propria proposta');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.calendar_events set title = 'Cambiato'$$), 'ok:0', 'Phill non può modificare l''evento dopo averlo proposto');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.calendar_events set created_by = '00000000-0000-0000-0000-00000000a001'$$), 'error:P0001', 'l''autore di un evento non si cambia');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.calendar_events set status = 'confirmed'$$), 'ok:1', 'Alessia approva la proposta');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'select 1 from public.calendar_events'), 0, 'approvato e non condiviso: Phill non vede più l''evento (revoca/assenza di permesso rispettata)');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$delete from public.calendar_events$$), 'ok:0', 'Phill non cancella eventi confermati');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.calendar_events (owner_id, created_by, title, category, starts_at, status) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','Da ritirare','walk', now() + interval '3 days','proposed')$$), 'ok:1', 'Phill fa un''altra proposta');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$delete from public.calendar_events where title = 'Da ritirare'$$), 'ok:1', 'Phill ritira la propria proposta ancora in attesa');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.calendar_events (owner_id, created_by, title, category, starts_at, status) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','Rifiutata','walk', now() + interval '3 days','proposed')$$), 'ok:1', 'terza proposta');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.calendar_events set status = 'declined' where title = 'Rifiutata'$$), 'ok:1', 'Alessia rifiuta');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', $$select 1 from public.calendar_events where title = 'Rifiutata'$$), 1, 'Phill vede che è stata rifiutata (stato di approvazione)');

-- ================================================================== PROPOSTE DI ALLENAMENTO
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.workout_proposals (owner_id, proposer_id, title, exercises) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','Scheda gambe','[{"name":"Squat","sets":3}]')$$), 'ok:1', 'Phill propone una scheda');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b002', $$insert into public.workout_proposals (owner_id, proposer_id, title) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b002','Estraneo')$$), 'denied', 'un estraneo non propone schede');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.workout_proposals (owner_id, proposer_id, title) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000a001','Falso proponente')$$), 'denied', 'non si può falsificare il proponente');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.workout_proposals (owner_id, proposer_id, title, status) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','Già accettata','accepted')$$), 'denied', 'non si può inserire una proposta già accettata');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$insert into public.workout_proposals (owner_id, proposer_id, title) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000a001','Me la propongo')$$), 'denied', 'nessuna auto-proposta');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.workout_proposals (owner_id, proposer_id, title, exercises) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','Non array','{"a":1}')$$), 'error:23514', 'esercizi: deve essere una lista');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', format($f$insert into public.workout_proposals (owner_id, proposer_id, title, exercises) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','Troppi', %L)$f$, (select jsonb_agg(jsonb_build_object('n', g)) from generate_series(1, 51) g))), 'error:23514', 'esercizi: massimo 50');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a001', 'select 1 from public.workout_proposals'), 1, 'Alessia vede la proposta');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'select 1 from public.workout_proposals'), 1, 'Phill vede le proprie proposte');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b002', 'select 1 from public.workout_proposals'), 0, 'un estraneo non le vede');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a002', 'select 1 from public.workout_proposals'), 0, 'un''altra Alessia non le vede');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.workout_proposals set title = 'Modificata'$$), 'denied', 'il contenuto di una proposta non si modifica dopo l''invio');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.workout_proposals set status = 'accepted'$$), 'error:P0001', 'Phill non può accettare la propria proposta');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.workout_proposals set status = 'withdrawn'$$), 'error:P0001', 'Alessia non può "ritirare" la proposta di Phill');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b002', $$update public.workout_proposals set status = 'withdrawn'$$), 'ok:0', 'un estraneo non può toccarla');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$delete from public.workout_proposals$$), 'denied', 'le proposte non si cancellano');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.workout_proposals set status = 'withdrawn'$$), 'ok:1', 'Phill ritira la proposta');
select isnt((select decided_at from public.workout_proposals where title = 'Scheda gambe'), null, 'il momento della decisione è registrato dal server');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.workout_proposals set status = 'accepted'$$), 'error:P0001', 'una proposta ritirata non si può accettare');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.workout_proposals (owner_id, proposer_id, title) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','Seconda')$$), 'ok:1', 'seconda proposta');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.workout_proposals set status = 'accepted' where title = 'Seconda'$$), 'ok:1', 'Alessia accetta');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.workout_proposals set status = 'withdrawn' where title = 'Seconda'$$), 'error:P0001', 'una proposta decisa non si ritira più');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.workout_proposals set status = 'rejected' where title = 'Seconda'$$), 'error:P0001', 'una decisione non si cambia');

-- ================================================================== MESSAGGI
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.messages (sender_id, recipient_id, title, body) values ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-00000000a001','Biglietto','Buongiorno')$$), 'ok:1', 'Phill scrive ad Alessia');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b002', $$insert into public.messages (sender_id, recipient_id, body) values ('00000000-0000-0000-0000-00000000b002','00000000-0000-0000-0000-00000000a001','Spam')$$), 'denied', 'un estraneo non scrive ad Alessia');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.messages (sender_id, recipient_id, body) values ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-00000000b002','Non partner')$$), 'denied', 'si scrive solo al partner');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.messages (sender_id, recipient_id, body) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','Falso mittente')$$), 'denied', 'il mittente non si falsifica');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.messages (sender_id, recipient_id, body) values ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-00000000a001','   ')$$), 'error:23514', 'messaggio vuoto rifiutato');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', format($f$insert into public.messages (sender_id, recipient_id, body) values ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-00000000a001', %L)$f$, repeat('x', 2001))), 'error:23514', 'messaggio troppo lungo rifiutato');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.messages (sender_id, recipient_id, body, read_at) values ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-00000000a001','Letto?', now())$$), 'error:42703', 'i messaggi non hanno più uno stato di lettura visibile al mittente');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$select read_at from public.messages$$), 'error:42703', 'Phill non può nemmeno chiedere lo stato di lettura via API');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.messages (sender_id, recipient_id, body, edited_at) values ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-00000000a001','Modificato?', now())$$), 'error:42703', 'i biglietti consegnati non hanno più un campo di modifica');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a001', 'select 1 from public.messages'), 1, 'Alessia riceve il messaggio');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'select 1 from public.messages'), 1, 'Phill vede il messaggio inviato');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b002', 'select 1 from public.messages'), 0, 'un estraneo non vede messaggi');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a002', 'select 1 from public.messages'), 0, 'un''altra Alessia non vede messaggi');
-- ricevute: privacy di chi riceve
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.message_receipts (message_id, recipient_id, read_at) select id, '00000000-0000-0000-0000-00000000b001', now() from public.messages where sender_id = '00000000-0000-0000-0000-00000000b001'$$), 'error:23503', 'non si crea una ricevuta per un messaggio non indirizzato a sé');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.message_receipts (message_id, recipient_id, read_at) select id, '00000000-0000-0000-0000-00000000a001', now() from public.messages where sender_id = '00000000-0000-0000-0000-00000000b001'$$), 'denied', 'né a nome della destinataria');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$insert into public.message_receipts (message_id, recipient_id, read_at) select id, '00000000-0000-0000-0000-00000000a001', now() from public.messages where recipient_id = '00000000-0000-0000-0000-00000000a001'$$), 'ok:1', 'la destinataria segna come letto (ricevuta propria)');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a001', 'select 1 from public.message_receipts'), 1, 'la destinataria vede la propria ricevuta');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'select 1 from public.message_receipts'), 0, 'il mittente NON vede se e quando il messaggio è stato letto');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b002', 'select 1 from public.message_receipts'), 0, 'un estraneo non vede ricevute');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.message_receipts set archived_at = now()$$), 'ok:0', 'il mittente non archivia al posto della destinataria');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.message_receipts set archived_at = now()$$), 'ok:1', 'la destinataria nasconde il biglietto dalla propria vista');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'select 1 from public.messages'), 1, 'la cronologia del mittente resta intatta dopo che la destinataria ha archiviato');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.message_receipts set message_id = gen_random_uuid()$$), 'denied', 'una ricevuta non si sposta su un altro messaggio');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$delete from public.message_receipts$$), 'denied', 'le ricevute non si cancellano dal client');
-- modifica/eliminazione da parte di chi scrive
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.messages set body = 'Riscritto' where recipient_id = '00000000-0000-0000-0000-00000000a001'$$), 'denied', 'la destinataria non modifica il testo di un biglietto');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.messages set sender_id = '00000000-0000-0000-0000-00000000a001'$$), 'denied', 'il mittente non si modifica');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$delete from public.messages where recipient_id = '00000000-0000-0000-0000-00000000a001'$$), 'denied', 'la destinataria non elimina i biglietti di Phill');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.messages set body = 'Testo corretto' where body = 'Buongiorno'$$), 'denied', 'STORICO COERENTE: nemmeno Phill modifica un biglietto già consegnato');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.messages set title = 'Altro titolo'$$), 'denied', 'né il titolo');
select is((select body from public.messages where recipient_id = '00000000-0000-0000-0000-00000000a001'), 'Buongiorno', 'il testo consegnato è rimasto identico');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b002', $$update public.messages set body = 'Hack'$$), 'denied', 'un estraneo non modifica biglietti altrui');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b002', $$delete from public.messages$$), 'denied', 'né li elimina');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$insert into public.messages (sender_id, recipient_id, body) values ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000b001','Grazie')$$), 'ok:1', 'Alessia risponde');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$delete from public.messages where body = 'Buongiorno'$$), 'denied', 'STORICO COERENTE: nemmeno Phill elimina un biglietto già consegnato');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a001', 'select 1 from public.message_receipts'), 1, 'la ricevuta di Alessia (nascosto) resta, e il biglietto con lei');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a001', 'select 1 from public.messages where recipient_id = ''00000000-0000-0000-0000-00000000a001'''), 1, 'il biglietto consegnato resta nello storico di Alessia');
select is((select count(*)::int from public.notifications where kind = 'message' and user_id = '00000000-0000-0000-0000-00000000a001'), 1, 'il messaggio ha generato una notifica in-app per la destinataria');
select is((select body from public.notifications where kind = 'message' and user_id = '00000000-0000-0000-0000-00000000a001'), null, 'la notifica non contiene il testo del biglietto');

-- messaggi programmati
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.scheduled_messages (sender_id, recipient_id, title, body, send_at) values ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-00000000a001','Domani','Ti penso', now() + interval '1 day')$$), 'ok:1', 'Phill programma un messaggio');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.scheduled_messages (sender_id, recipient_id, body, send_at) values ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-00000000a001','Passato', now() - interval '1 hour')$$), 'denied', 'non si programma nel passato');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.scheduled_messages (sender_id, recipient_id, body, send_at) values ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-00000000b002','Non partner', now() + interval '1 day')$$), 'denied', 'si programma solo verso il partner');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.scheduled_messages (sender_id, recipient_id, body, send_at, status) values ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-00000000a001','Già inviato', now() + interval '1 day', 'sent')$$), 'denied', 'lo stato non si imposta dal client');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a001', 'select 1 from public.scheduled_messages'), 0, 'la destinataria NON vede i messaggi programmati (resta una sorpresa)');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'select 1 from public.scheduled_messages'), 1, 'il mittente li vede');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.scheduled_messages set status = 'sent'$$), 'denied', 'non si può marcare come inviato dal client');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.scheduled_messages set body = 'Cambiato', send_at = now() + interval '2 days'$$), 'ok:1', 'il mittente modifica testo e orario finché è in attesa');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.scheduled_messages set send_at = now() - interval '1 hour'$$), 'denied', 'non si sposta nel passato');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.scheduled_messages set attempts = 0, last_error = null$$), 'denied', 'i campi tecnici sono del server');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.scheduled_messages set status = 'cancelled'$$), 'ok:0', 'la destinataria non può annullarli');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.scheduled_messages set status = 'cancelled'$$), 'ok:1', 'il mittente annulla un messaggio in attesa');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.scheduled_messages set status = 'cancelled'$$), 'ok:0', 'un messaggio già annullato non cambia più');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$delete from public.scheduled_messages$$), 'ok:0', 'la destinataria non elimina i messaggi programmati');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$delete from public.scheduled_messages$$), 'ok:1', 'il mittente elimina un messaggio programmato');

-- ================================================================== NOTIFICHE
delete from public.notifications;   -- ripulisce quelle generate dai messaggi di prova
insert into public.notifications (user_id, kind, title) values ('00000000-0000-0000-0000-00000000a001', 'message', 'Nuovo biglietto'), ('00000000-0000-0000-0000-00000000b001', 'proposal', 'Proposta decisa');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a001', 'select 1 from public.notifications'), 1, 'ognuno vede solo le proprie notifiche');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b002', 'select 1 from public.notifications'), 0, 'un estraneo non vede notifiche');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$insert into public.notifications (user_id, kind, title) values ('00000000-0000-0000-0000-00000000a001','x','Finta')$$), 'denied', 'le notifiche le crea solo il server');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$insert into public.notifications (user_id, kind, title) values ('00000000-0000-0000-0000-00000000b001','x','Finta')$$), 'denied', 'né per sé né per altri');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.notifications set read_at = now()$$), 'ok:1', 'si segna come letta solo la propria');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.notifications set title = 'Riscritta'$$), 'denied', 'il testo non si modifica');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$delete from public.notifications$$), 'ok:1', 'si cancellano solo le proprie');
select is((select count(*)::int from public.notifications), 1, 'quella di Phill è intatta');

-- ================================================================== ISCRIZIONI PUSH
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-00000000a001','https://push.example.test/abc','k1','a1')$$), 'ok:1', 'Alessia registra il proprio dispositivo');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-00000000b001','https://push.example.test/zzz','k','a')$$), 'denied', 'non si registrano dispositivi per altri');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-00000000a001','http://push.example.test/insicuro','k','a')$$), 'error:23514', 'solo endpoint https');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-00000000b001','https://push.example.test/abc','k','a')$$), 'error:23505', 'un endpoint non si può rubare a un altro utente');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'select 1 from public.push_subscriptions'), 0, 'Phill non vede i dispositivi di Alessia');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$delete from public.push_subscriptions$$), 'ok:0', 'né li cancella');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.push_subscriptions set auth = 'nuova'$$), 'denied', 'le chiavi non si modificano (si reiscrive)');

-- ================================================================== CONSENSO AI
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$insert into public.ai_preferences (user_id) values ('00000000-0000-0000-0000-00000000a001')$$), 'ok:1', 'Alessia crea le preferenze AI');
select is((select ai_enabled or use_journal or use_wellbeing or use_equipment or reminders_enabled from public.ai_preferences where user_id = '00000000-0000-0000-0000-00000000a001'), false, 'AI: tutto DISATTIVATO di default');
select is((select consent_at from public.ai_preferences where user_id = '00000000-0000-0000-0000-00000000a001'), null, 'AI: nessun consenso registrato di default');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.ai_preferences set use_journal = true where user_id = '00000000-0000-0000-0000-00000000a001'$$), 'ok:1', 'si prova ad attivare il diario senza AI attiva…');
select is((select use_journal from public.ai_preferences where user_id = '00000000-0000-0000-0000-00000000a001'), false, '…ma senza consenso generale non si attiva nulla');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.ai_preferences set ai_enabled = true, use_journal = true where user_id = '00000000-0000-0000-0000-00000000a001'$$), 'ok:1', 'Alessia dà il consenso esplicito');
select isnt((select consent_at from public.ai_preferences where user_id = '00000000-0000-0000-0000-00000000a001'), null, 'il momento del consenso è registrato dal server');
select is((select use_journal from public.ai_preferences where user_id = '00000000-0000-0000-0000-00000000a001'), true, 'il diario è utilizzabile dall''AI solo dopo consenso esplicito');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.ai_preferences set consent_at = now() - interval '1 year'$$), 'denied', 'la data del consenso non si falsifica');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$update public.ai_preferences set ai_enabled = false where user_id = '00000000-0000-0000-0000-00000000a001'$$), 'ok:1', 'Alessia disattiva l''AI');
select is((select use_journal or use_wellbeing or use_equipment or reminders_enabled from public.ai_preferences where user_id = '00000000-0000-0000-0000-00000000a001'), false, 'disattivando l''AI tutti i consensi specifici cadono');
select is((select consent_at from public.ai_preferences where user_id = '00000000-0000-0000-0000-00000000a001'), null, 'e il consenso risulta revocato');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'select 1 from public.ai_preferences'), 0, 'Phill non vede le preferenze AI di Alessia');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$update public.ai_preferences set ai_enabled = true$$), 'ok:0', 'Phill non attiva l''AI al posto di Alessia');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000b001', $$insert into public.ai_preferences (user_id, ai_enabled) values ('00000000-0000-0000-0000-00000000a001', true)$$), 'denied', 'né crea preferenze per lei');
insert into public.ai_generations (user_id, kind, status, output) values ('00000000-0000-0000-0000-00000000a001', 'daily', 'ok', '{"text":"ciao"}');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000a001', 'select 1 from public.ai_generations'), 1, 'Alessia vede il proprio storico AI');
select is(pg_temp.count_as('00000000-0000-0000-0000-00000000b001', 'select 1 from public.ai_generations'), 0, 'Phill non lo vede');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$insert into public.ai_generations (user_id, kind, status) values ('00000000-0000-0000-0000-00000000a001','daily','ok')$$), 'denied', 'lo storico AI lo scrive solo il server');
select is(pg_temp.try_sql('00000000-0000-0000-0000-00000000a001', $$delete from public.ai_generations$$), 'denied', 'né si cancella dal client (si elimina con l''account)');

-- ================================================================== STATO DEI PRIVILEGI (catalogo)
select is((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))), 0, 'nessuna tabella di public è accessibile ad anon');
select is((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and has_table_privilege('authenticated', c.oid, 'truncate')), 0, 'nessuno può fare TRUNCATE dal client');
select is((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and has_table_privilege('authenticated', c.oid, 'references')), 0, 'nessun privilegio REFERENCES ai client');
select is((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and has_table_privilege('authenticated', c.oid, 'trigger')), 0, 'nessun privilegio TRIGGER ai client');

select * from finish();
rollback;
