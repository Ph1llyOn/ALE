-- Test pgTAP: profili, inviti, collegamento 1:1, avatar. Esegue come postgres e simula i ruoli
-- anon/authenticated con JWT claims. Ogni asserzione è un controllo di sicurezza.
begin;
select no_plan();

-- Utenti di prova (il profilo nasce dal trigger su auth.users).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.local', '{"role":"alessia","display_name":"Ale Uno"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@test.local', '{"role":"alessia","display_name":"Ale Due"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.local', '{"role":"phill","display_name":"Phill Uno"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'b2@test.local', '{"role":"phill","display_name":"Phill Due"}');

-- ---------------------------------------------------------------- profili / trigger
select is((select count(*)::int from public.profiles), 4, 'ogni utente ha un profilo creato dal trigger');
select is((select role from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 'phill', 'ruolo letto dai metadati di registrazione');
select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'x@test.local', '{"role":"admin"}')$$,
  'P0001', 'ruolo non valido', 'registrazione con ruolo inventato rifiutata');
select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'y@test.local', '{}')$$,
  'P0001', 'ruolo non valido', 'registrazione senza ruolo rifiutata');
select throws_ok(
  $$update public.profiles set role = 'phill' where id = '00000000-0000-0000-0000-0000000000a1'$$,
  'P0001', null, 'il ruolo non è modificabile nemmeno dal proprietario del database');

-- ---------------------------------------------------------------- anonimo
set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon: niente SELECT su profiles');
select throws_ok($$select * from public.invitations$$, '42501', null, 'anon: niente SELECT su invitations');
select throws_ok($$select * from public.partnerships$$, '42501', null, 'anon: niente SELECT su partnerships');
select throws_ok($$select * from public.invitation_attempts$$, '42501', null, 'anon: niente SELECT su invitation_attempts');
select throws_ok($$select public.create_invitation()$$, '42501', null, 'anon: create_invitation non eseguibile');
select throws_ok($$select public.redeem_invitation('AAAAAAAAAA')$$, '42501', null, 'anon: redeem_invitation non eseguibile');
select throws_ok($$select public.end_partnership()$$, '42501', null, 'anon: end_partnership non eseguibile');
select throws_ok($$select public.is_partner_of('00000000-0000-0000-0000-0000000000a1')$$, '42501', null, 'anon: is_partner_of non eseguibile');
reset role;

-- ---------------------------------------------------------------- Alessia crea un invito
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.code', public.create_invitation() ->> 'code', false);
select is(char_length(current_setting('t.code')), 10, 'Alessia riceve un codice di 10 caratteri');
select is((select count(*)::int from public.invitations), 1, 'Alessia vede il proprio invito');
select throws_ok($$select code_hash from public.invitations$$, '42501', null, 'code_hash non leggibile dal client');
select throws_ok($$insert into public.invitations (inviter_id, code_hash, expires_at) values ('00000000-0000-0000-0000-0000000000a1', '\x00', now() + interval '1 day')$$,
  '42501', null, 'inserimento diretto di inviti vietato');
select throws_ok($$insert into public.partnerships (alessia_id, phill_id) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1')$$,
  '42501', null, 'inserimento diretto di collegamenti vietato');
select throws_ok($$update public.invitations set status = 'used'$$, '42501', null, 'modifica diretta di inviti vietata');
select throws_ok($$delete from public.partnerships$$, '42501', null, 'cancellazione diretta di collegamenti vietata');
select throws_ok($$select * from public.invitation_attempts$$, '42501', null, 'tentativi non accessibili al client');
reset role;
select is((select count(*)::int from public.invitations where code_hash = extensions.digest(current_setting('t.code'), 'sha256')), 1,
  'nel database c''è solo l''hash del codice');
select is((select count(*)::int from public.invitations where code_hash = convert_to(current_setting('t.code'), 'UTF8')), 0,
  'il codice in chiaro non è salvato');

-- ---------------------------------------------------------------- Phill non può creare inviti
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select is(public.create_invitation() ->> 'error', 'not_alessia', 'Phill non può creare inviti');
select is((select count(*)::int from public.invitations), 0, 'Phill non vede gli inviti di Alessia');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 0, 'Phill non collegato non vede il profilo di Alessia');

-- Rate limit: 5 tentativi sbagliati, poi anche il codice giusto viene rifiutato.
select is(public.redeem_invitation('WRONGCODE1') ->> 'error', 'invalid_code', 'codice errato 1');
select is(public.redeem_invitation('WRONGCODE2') ->> 'error', 'invalid_code', 'codice errato 2');
select is(public.redeem_invitation('WRONGCODE3') ->> 'error', 'invalid_code', 'codice errato 3');
select is(public.redeem_invitation('WRONGCODE4') ->> 'error', 'invalid_code', 'codice errato 4');
select is(public.redeem_invitation('WRONGCODE5') ->> 'error', 'invalid_code', 'codice errato 5');
select is(public.redeem_invitation(current_setting('t.code')) ->> 'error', 'too_many_attempts', 'dopo 5 errori anche il codice giusto è bloccato');
reset role;

-- ---------------------------------------------------------------- invito scaduto / revocato
update public.invitations set expires_at = now() - interval '1 minute' where status = 'pending';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select is(public.redeem_invitation(current_setting('t.code')) ->> 'error', 'invalid_code', 'invito scaduto rifiutato (stesso errore generico)');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.old', current_setting('t.code'), false);
select set_config('t.code', public.create_invitation() ->> 'code', false);
select isnt(current_setting('t.code'), current_setting('t.old'), 'nuovo invito con codice diverso');
select is((select count(*)::int from public.invitations where status = 'pending'), 1, 'un solo invito in attesa per Alessia');
select is((select count(*)::int from public.invitations where status = 'revoked'), 1, 'il vecchio invito è stato revocato');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select is(public.redeem_invitation(current_setting('t.old')) ->> 'error', 'invalid_code', 'invito revocato rifiutato');

-- ---------------------------------------------------------------- riscatto riuscito (con formattazione tollerata)
select is(public.redeem_invitation(substr(lower(current_setting('t.code')), 1, 5) || ' - ' || substr(current_setting('t.code'), 6)) ->> 'ok', 'true',
  'Phill riscatta il codice (maiuscole/trattini ignorati)');
select is((select count(*)::int from public.partnerships), 1, 'Phill vede il collegamento');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 1, 'il partner vede il profilo di Alessia');
select is(public.redeem_invitation(current_setting('t.code')) ->> 'error', 'already_linked', 'Phill già collegato non può riscattare di nuovo');
reset role;

select is((select status from public.invitations where code_hash = extensions.digest(current_setting('t.code'), 'sha256')), 'used', 'invito marcato come usato');

-- ---------------------------------------------------------------- 1:1
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select is(public.create_invitation() ->> 'error', 'already_linked', 'Alessia collegata non può creare altri inviti');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000b2'), 1, 'Alessia vede il profilo del partner');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 0, 'Alessia non vede profili di estranei');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.code2', public.create_invitation() ->> 'code', false);
select is((select count(*)::int from public.partnerships), 0, 'un''altra Alessia non vede collegamenti altrui');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select is(public.redeem_invitation(current_setting('t.code2')) ->> 'error', 'already_linked', 'Phill collegato non può collegarsi a una seconda Alessia');
reset role;

select throws_ok(
  $$insert into public.partnerships (alessia_id, phill_id) values ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000b2')$$,
  '23505', null, 'vincolo del database: un solo collegamento attivo per Phill');
select throws_ok(
  $$insert into public.partnerships (alessia_id, phill_id) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1')$$,
  '23505', null, 'vincolo del database: un solo collegamento attivo per Alessia');
select throws_ok(
  $$insert into public.partnerships (alessia_id, phill_id) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a2')$$,
  'P0001', null, 'ruoli invertiti nel collegamento rifiutati');
select throws_ok(
  $$insert into public.partnerships (alessia_id, phill_id) values ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2')$$,
  'P0001', null, 'collegamento con se stessi rifiutato');
select throws_ok(
  $$insert into public.invitations (inviter_id, code_hash, expires_at) values ('00000000-0000-0000-0000-0000000000b1', '\x01', now() + interval '1 day')$$,
  'P0001', null, 'un invito non può avere Phill come mittente');

-- ---------------------------------------------------------------- modifica profilo
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
update public.profiles set display_name = '  Alessia  ' where id = '00000000-0000-0000-0000-0000000000a1';
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'Alessia', 'modifica del proprio nome (spazi rimossi)');
select throws_ok($$update public.profiles set display_name = '' where id = '00000000-0000-0000-0000-0000000000a1'$$, '23514', null, 'nome vuoto rifiutato');
select throws_ok($$update public.profiles set display_name = repeat('x', 41) where id = '00000000-0000-0000-0000-0000000000a1'$$, '23514', null, 'nome troppo lungo rifiutato');
select throws_ok($$update public.profiles set role = 'phill' where id = '00000000-0000-0000-0000-0000000000a1'$$, '42501', null, 'colonna role non modificabile dal client');
select throws_ok($$update public.profiles set id = gen_random_uuid() where id = '00000000-0000-0000-0000-0000000000a1'$$, '42501', null, 'colonna id non modificabile dal client');
select throws_ok($$update public.profiles set avatar_path = '00000000-0000-0000-0000-0000000000b2/x.jpg' where id = '00000000-0000-0000-0000-0000000000a1'$$, '23514', null, 'avatar nella cartella di un altro rifiutato');
select lives_ok($$update public.profiles set avatar_path = '00000000-0000-0000-0000-0000000000a1/x.jpg' where id = '00000000-0000-0000-0000-0000000000a1'$$, 'avatar nella propria cartella accettato');

with u as (update public.profiles set display_name = 'Hack' where id = '00000000-0000-0000-0000-0000000000b2' returning 1)
select is((select count(*)::int from u), 0, 'non si modifica il profilo del partner (0 righe)');
with u as (update public.profiles set display_name = 'Hack' where id = '00000000-0000-0000-0000-0000000000a2' returning 1)
select is((select count(*)::int from u), 0, 'non si modifica il profilo di un estraneo (0 righe)');
select throws_ok($$insert into public.profiles (id, role, display_name) values (gen_random_uuid(), 'alessia', 'Fake')$$, '42501', null, 'inserimento diretto di profili vietato');
select throws_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'$$, '42501', null, 'cancellazione diretta di profili vietata');
reset role;
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000b2'), 'Phill Due', 'il profilo del partner è rimasto intatto');

-- ---------------------------------------------------------------- storage avatar
insert into storage.objects (bucket_id, name, owner_id) values ('avatars', '00000000-0000-0000-0000-0000000000a1/x.jpg', '00000000-0000-0000-0000-0000000000a1');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 1, 'il partner legge l''avatar di Alessia');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('avatars', '00000000-0000-0000-0000-0000000000b2/p.jpg', '00000000-0000-0000-0000-0000000000b2')$$, 'upload nella propria cartella');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('avatars', '00000000-0000-0000-0000-0000000000a1/evil.jpg', '00000000-0000-0000-0000-0000000000b2')$$, '42501', null, 'upload nella cartella del partner vietato');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('avatars', 'senza-cartella.jpg', '00000000-0000-0000-0000-0000000000b2')$$, '42501', null, 'upload fuori da una cartella utente vietato');
-- (la cancellazione passa solo dalla Storage API, che blocca i DELETE diretti: la verifica è in tests/api)
with u as (update storage.objects set name = '00000000-0000-0000-0000-0000000000b2/stolen.jpg' where name = '00000000-0000-0000-0000-0000000000a1/x.jpg' returning 1)
select is((select count(*)::int from u), 0, 'il partner non può spostare l''avatar di Alessia');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 0, 'un estraneo non legge avatar altrui');
reset role;

set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 0, 'anon non legge avatar');
reset role;

-- ---------------------------------------------------------------- fine del collegamento
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select is(public.end_partnership() ->> 'error', 'no_partnership', 'chi non è collegato non può terminare nulla');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
select is(public.end_partnership() ->> 'ok', 'true', 'Phill termina il collegamento');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 0, 'dopo la fine il profilo di Alessia non è più visibile a Phill');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-0000-0000-0000000000a1/%'), 0, 'dopo la fine l''avatar non è più leggibile');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.code3', public.create_invitation() ->> 'code', false);
select ok(current_setting('t.code3') is not null and char_length(current_setting('t.code3')) = 10, 'Alessia può invitare di nuovo dopo la fine');
reset role;
delete from public.invitation_attempts;   -- azzera il rate limit dei tentativi sbagliati fatti sopra da Phill Uno
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select is(public.redeem_invitation(current_setting('t.code3')) ->> 'ok', 'true', 'un nuovo collegamento richiede un nuovo invito e funziona');
reset role;

-- ---------------------------------------------------------------- igiene delle funzioni
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 0,
  'nessuna funzione in public eseguibile da anon');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 0,
  'ogni funzione in public ha search_path fissato');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef and has_function_privilege('public', p.oid, 'execute')), 0,
  'nessuna funzione security definer eseguibile da PUBLIC');
select is((select public from storage.buckets where id = 'avatars'), false, 'il bucket avatars è privato');

select * from finish();
rollback;
