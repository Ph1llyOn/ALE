-- Test pgTAP Fase 2: esportazione dati, cancellazione account, nessun dato orfano.
begin;
select no_plan();

create function pg_temp.login(p_user uuid, p_role text default 'authenticated', p_extra jsonb default '{}') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', p_user, 'role', p_role) || p_extra)::text, true);
  execute format('set local role %I', p_role);
end $$;

create function pg_temp.q_as(p_user uuid, p_sql text, p_extra jsonb default '{}') returns text
language plpgsql as $$
declare r text;
begin
  perform pg_temp.login(p_user, 'authenticated', p_extra);
  begin execute p_sql into r;
  exception when others then r := 'error:' || sqlstate; end;
  reset role;
  return r;
end $$;

create function pg_temp.fresh_amr() returns jsonb language sql as $$
  select jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)));
$$;

-- Riferimenti a un utente in tutte le tabelle di public, ricavati dal CATALOGO (chiavi esterne verso profiles/auth.users).
-- Così una tabella aggiunta in futuro è coperta automaticamente.
create function pg_temp.refs_to(p_user uuid) returns table (tbl text, col text, n bigint)
language plpgsql as $$
declare r record;
begin
  for r in
    select format('%I.%I', n.nspname, cl.relname) as t, a.attname::text as col
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f'
       and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
       and n.nspname = 'public'
       and array_length(c.conkey, 1) = 1
  loop
    tbl := r.t; col := r.col;
    execute format('select count(*) from %s where %I = $1', r.t, r.col) into n using p_user;
    return next;
  end loop;
  tbl := 'public.profiles'; col := 'id';
  select count(*) into n from public.profiles where id = p_user; return next;
  tbl := 'auth.users'; col := 'id';
  select count(*) into n from auth.users where id = p_user; return next;
  tbl := 'auth.identities'; col := 'user_id';
  select count(*) into n from auth.identities where user_id = p_user; return next;
  tbl := 'storage.objects'; col := 'path-prefix';
  select count(*) into n from storage.objects where split_part(name, '/', 1) = p_user::text; return next;
end $$;

-- ------------------------------------------------------------------ copertura del catalogo
select is((select count(*)::int from information_schema.columns c
            where c.table_schema = 'public'
              and c.column_name in ('owner_id','user_id','sender_id','recipient_id','proposer_id','created_by','grantee_id',
                                    'inviter_id','alessia_id','phill_id','used_by','ended_by')
              and not exists (
                select 1 from pg_constraint k
                 where k.contype = 'f' and k.conrelid = format('public.%I', c.table_name)::regclass
                   and (select attnum from pg_attribute where attrelid = k.conrelid and attname = c.column_name) = any (k.conkey))), 0,
  'ogni colonna che indica una persona ha una chiave esterna verso profiles (nessun riferimento "libero")');
select cmp_ok((select count(*)::int from pg_temp.refs_to('00000000-0000-0000-0000-00000000a003')), '>=', 35, 'il controllo del catalogo copre almeno 35 riferimenti');

-- ------------------------------------------------------------------ dati di prova: due coppie
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a003', 'a3@test.local', '{"role":"alessia","display_name":"Ale Tre"}'),
  ('00000000-0000-0000-0000-00000000b003', 'b3@test.local', '{"role":"phill","display_name":"Phill Tre"}'),
  ('00000000-0000-0000-0000-00000000a004', 'a4@test.local', '{"role":"alessia","display_name":"Ale Quattro"}'),
  ('00000000-0000-0000-0000-00000000b004', 'b4@test.local', '{"role":"phill","display_name":"Phill Quattro"}');
insert into public.partnerships (alessia_id, phill_id) values ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000b003'), ('00000000-0000-0000-0000-00000000a004', '00000000-0000-0000-0000-00000000b004');
insert into public.invitations (inviter_id, code_hash, status, expires_at, used_by, used_at)
  values ('00000000-0000-0000-0000-00000000a003', '\xaa01', 'used', now() + interval '1 day', '00000000-0000-0000-0000-00000000b003', now());

-- dati di A3 (una riga per tabella) e di B3
insert into public.equipment (owner_id, name) values ('00000000-0000-0000-0000-00000000a003', 'Elastici'), ('00000000-0000-0000-0000-00000000b003', 'Manubri');
insert into public.workouts (id, owner_id, title) values ('10000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000a003', 'Scheda');
insert into public.workout_exercises (workout_id, owner_id, name) values ('10000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000a003', 'Squat');
insert into public.workout_sessions (id, owner_id, workout_id, title) values ('20000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000a003', '10000000-0000-0000-0000-0000000000a3', 'Sessione');
insert into public.session_exercise_progress (session_id, owner_id, name) values ('20000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000a003', 'Squat');
insert into public.habits (id, owner_id, name) values ('30000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000a003', 'Acqua'), ('30000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000000b003', 'Lettura');
insert into public.habit_logs (habit_id, owner_id, day) values ('30000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000a003', current_date), ('30000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000000b003', current_date);
insert into public.progress_records (owner_id, kind, title) values ('00000000-0000-0000-0000-00000000a003', 'small_win', 'Conquista'), ('00000000-0000-0000-0000-00000000b003', 'small_win', 'Conquista di Phill');
insert into public.wellbeing_logs (id, owner_id, day, mood, energy) values ('40000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000a003', current_date, 4, 3);
insert into public.wellbeing_notes (log_id, owner_id, note) values ('40000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000a003', 'Nota privata di Alessia');
insert into public.journal_entries (owner_id, title, body) values ('00000000-0000-0000-0000-00000000a003', 'Diario di Alessia', 'Contenuto privato di Alessia'), ('00000000-0000-0000-0000-00000000b003', 'Diario di Phill', 'Contenuto privato di Phill');
insert into public.calendar_events (owner_id, created_by, title, category, starts_at) values
  ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000a003', 'Evento suo', 'walk', now()),
  ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000b003', 'Proposta di Phill accettata', 'personal', now());
insert into public.workout_proposals (owner_id, proposer_id, title, status) values ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000b003', 'Proposta di Phill', 'accepted');
insert into public.messages (sender_id, recipient_id, body) values ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-00000000a003', 'Da Phill ad Alessia'), ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000b003', 'Da Alessia a Phill');
insert into public.scheduled_messages (sender_id, recipient_id, body, send_at) values ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-00000000a003', 'Programmato', now() + interval '1 day');
insert into public.notifications (user_id, kind, title) values ('00000000-0000-0000-0000-00000000a003', 'message', 'n1'), ('00000000-0000-0000-0000-00000000b003', 'message', 'n2');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-00000000a003', 'https://push.example.test/a3', 'k', 'a'), ('00000000-0000-0000-0000-00000000b003', 'https://push.example.test/b3', 'k', 'a');
insert into public.ai_preferences (user_id, ai_enabled) values ('00000000-0000-0000-0000-00000000a003', true), ('00000000-0000-0000-0000-00000000b003', false);
insert into public.ai_generations (user_id, kind, status) values ('00000000-0000-0000-0000-00000000a003', 'daily', 'ok'), ('00000000-0000-0000-0000-00000000b003', 'daily', 'ok');
insert into public.sharing_permissions (owner_id, grantee_id, category) values ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000b003', 'journal'), ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-00000000a003', 'habits');
insert into storage.objects (bucket_id, name, owner_id) values
  ('avatars', '00000000-0000-0000-0000-00000000a003/foto.jpg', '00000000-0000-0000-0000-00000000a003'), ('avatars', '00000000-0000-0000-0000-00000000b003/foto.jpg', '00000000-0000-0000-0000-00000000b003');
-- dati dell'altra coppia (non devono mai essere toccati)
insert into public.journal_entries (owner_id, body) values ('00000000-0000-0000-0000-00000000a004', 'Diario di A4');
insert into public.messages (sender_id, recipient_id, body) values ('00000000-0000-0000-0000-00000000b004', '00000000-0000-0000-0000-00000000a004', 'Messaggio di B4');

-- ================================================================== ESPORTAZIONE
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select (public.export_my_data()->>'ok')$$), 'true', 'export_my_data funziona per l''utente autenticato');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select jsonb_array_length(public.export_my_data()->'data'->'journal_entries')::text$$), '1', 'ESPORTAZIONE: solo il diario di Phill (non quello di Alessia)');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select (public.export_my_data()->'data'->'journal_entries'->0->>'title')$$), 'Diario di Phill', 'ESPORTAZIONE: contenuto del proprio diario');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select jsonb_array_length(public.export_my_data()->'data'->'messages')::text$$), '2', 'ESPORTAZIONE: i messaggi inviati e ricevuti');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select (public.export_my_data()->'data'->'wellbeing_notes')::text$$), '[]', 'ESPORTAZIONE: nessuna nota di benessere di Alessia');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select (public.export_my_data()::text like '%Contenuto privato di Alessia%')::text$$), 'false', 'ESPORTAZIONE: nessun contenuto privato altrui');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select (public.export_my_data()::text like '%code_hash%')::text$$), 'false', 'ESPORTAZIONE: niente hash dei codici invito');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a003', $$select (public.export_my_data()->'data'->'invitations'->0 ? 'code_hash')::text$$), 'false', 'ESPORTAZIONE: gli inviti non espongono code_hash');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select (public.export_my_data()->'data'->'push_subscriptions'->0 ? 'auth')::text$$), 'false', 'ESPORTAZIONE: le chiavi push non vengono esportate');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select count(*)::text from jsonb_object_keys(public.export_my_data()->'data')$$), '24', 'ESPORTAZIONE: tutte le 24 tabelle personali sono incluse');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select (public.export_my_data()->'data'->'profiles'->0->>'id')$$), '00000000-0000-0000-0000-00000000b003', 'ESPORTAZIONE: il profilo esportato è il proprio');
set local role anon;
select throws_ok($$select public.export_my_data()$$, '42501', null, 'anon non può esportare');
select throws_ok($$select public.delete_my_account('ELIMINA ACCOUNT')$$, '42501', null, 'anon non può eliminare account');
reset role;

-- ================================================================== ELIMINAZIONE: requisiti di sicurezza
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select (public.delete_my_account('') ->> 'error')$$, pg_temp.fresh_amr()), 'confirmation_required', 'serve la conferma esplicita');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select (public.delete_my_account('elimina account') ->> 'error')$$, pg_temp.fresh_amr()), 'confirmation_required', 'la conferma deve essere esatta');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select (public.delete_my_account('ELIMINA ACCOUNT') ->> 'error')$$), 'reauth_required', 'senza riautenticazione recente è rifiutata');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select (public.delete_my_account('ELIMINA ACCOUNT') ->> 'error')$$,
  jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint - 3600)))), 'reauth_required', 'una riautenticazione di un''ora fa non basta');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select (public.delete_my_account('ELIMINA ACCOUNT') ->> 'error')$$,
  jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'sso', 'timestamp', extract(epoch from now())::bigint)))), 'reauth_required', 'serve un accesso con PIN (o password): altri metodi non bastano');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select (public.delete_my_account('ELIMINA ACCOUNT') ->> 'error')$$, pg_temp.fresh_amr()), 'storage_not_empty', 'con file ancora in Storage l''eliminazione è rifiutata (niente file orfani)');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-00000000b003'), 1, 'finora l''account esiste ancora');

-- i file si cancellano via Storage API; qui si simula con il permesso interno del trigger di protezione
set local storage.allow_delete_query = 'true';
delete from storage.objects where split_part(name, '/', 1) = '00000000-0000-0000-0000-00000000b003';
reset storage.allow_delete_query;

-- ================================================================== ELIMINAZIONE di Phill (B3)
create temp table before_a3 as
  select 'equipment' t, count(*) n from public.equipment where owner_id = '00000000-0000-0000-0000-00000000a003'
  union all select 'workouts', count(*) from public.workouts where owner_id = '00000000-0000-0000-0000-00000000a003'
  union all select 'habits', count(*) from public.habits where owner_id = '00000000-0000-0000-0000-00000000a003'
  union all select 'journal', count(*) from public.journal_entries where owner_id = '00000000-0000-0000-0000-00000000a003'
  union all select 'wellbeing_notes', count(*) from public.wellbeing_notes where owner_id = '00000000-0000-0000-0000-00000000a003'
  union all select 'events', count(*) from public.calendar_events where owner_id = '00000000-0000-0000-0000-00000000a003';

select is(pg_temp.q_as('00000000-0000-0000-0000-00000000b003', $$select (public.delete_my_account('ELIMINA ACCOUNT') ->> 'ok')$$, pg_temp.fresh_amr()), 'true', 'Phill elimina il proprio account');
select is((select coalesce(sum(n), 0)::int from pg_temp.refs_to('00000000-0000-0000-0000-00000000b003')), 0, 'NESSUN DATO ORFANO di Phill in nessuna tabella (catalogo, auth e storage)');
select is((select string_agg(tbl || '.' || col || '=' || n, ', ') from pg_temp.refs_to('00000000-0000-0000-0000-00000000b003') where n > 0), null, 'nessuna tabella contiene ancora riferimenti a Phill');
select is((select count(*)::int from public.partnerships where phill_id = '00000000-0000-0000-0000-00000000b003' or alessia_id = '00000000-0000-0000-0000-00000000a003'), 0, 'il collegamento è sparito');
select is((select count(*)::int from public.messages where sender_id = '00000000-0000-0000-0000-00000000a003' or recipient_id = '00000000-0000-0000-0000-00000000a003'), 0, 'la conversazione con Phill è eliminata per entrambi');
select is((select count(*)::int from public.sharing_permissions where owner_id = '00000000-0000-0000-0000-00000000a003' or grantee_id = '00000000-0000-0000-0000-00000000a003'), 0, 'i permessi tra i due sono eliminati');
select is((select count(*)::int from public.scheduled_messages where recipient_id = '00000000-0000-0000-0000-00000000a003'), 0, 'i messaggi programmati di Phill sono eliminati');
select is((select count(*)::int from public.workout_proposals where owner_id = '00000000-0000-0000-0000-00000000a003'), 0, 'le proposte di Phill sono eliminate');
select is((select count(*)::int from public.invitations where inviter_id = '00000000-0000-0000-0000-00000000a003' and used_by is null and status = 'used'), 1, 'l''invito di Alessia resta, senza più il riferimento a Phill (used_by nullo)');
select is((select created_by from public.calendar_events where title = 'Proposta di Phill accettata'), null, 'l''evento accettato resta ad Alessia, con autore nullo');
-- i dati di Alessia sono intatti
select is((select n::int from before_a3 where t = 'equipment'), (select count(*)::int from public.equipment where owner_id = '00000000-0000-0000-0000-00000000a003'), 'i dati di Alessia (attrezzatura) sono intatti');
select is((select n::int from before_a3 where t = 'journal'), (select count(*)::int from public.journal_entries where owner_id = '00000000-0000-0000-0000-00000000a003'), 'i dati di Alessia (diario) sono intatti');
select is((select n::int from before_a3 where t = 'wellbeing_notes'), (select count(*)::int from public.wellbeing_notes where owner_id = '00000000-0000-0000-0000-00000000a003'), 'i dati di Alessia (note) sono intatti');
select is((select n::int from before_a3 where t = 'events'), (select count(*)::int from public.calendar_events where owner_id = '00000000-0000-0000-0000-00000000a003'), 'i dati di Alessia (eventi) sono intatti');
select is((select count(*)::int from storage.objects where split_part(name, '/', 1) = '00000000-0000-0000-0000-00000000a003'), 1, 'l''avatar di Alessia è intatto');
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a003', $$select (public.create_invitation() ->> 'ok')$$), 'true', 'Alessia, ora scollegata, può invitare di nuovo');
-- l'altra coppia non è stata toccata
select is((select count(*)::int from public.journal_entries where owner_id = '00000000-0000-0000-0000-00000000a004'), 1, 'altra coppia: diario intatto');
select is((select count(*)::int from public.messages where sender_id = '00000000-0000-0000-0000-00000000b004'), 1, 'altra coppia: messaggi intatti');
select is((select count(*)::int from public.partnerships where alessia_id = '00000000-0000-0000-0000-00000000a004' and status = 'active'), 1, 'altra coppia: collegamento intatto');

-- ================================================================== ELIMINAZIONE di Alessia (A3): tutto sparisce
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a003', $$select (public.delete_my_account('ELIMINA ACCOUNT') ->> 'error')$$, pg_temp.fresh_amr()), 'storage_not_empty', 'Alessia: prima va cancellato l''avatar');
set local storage.allow_delete_query = 'true';
delete from storage.objects where split_part(name, '/', 1) = '00000000-0000-0000-0000-00000000a003';
reset storage.allow_delete_query;
select is(pg_temp.q_as('00000000-0000-0000-0000-00000000a003', $$select (public.delete_my_account('ELIMINA ACCOUNT') ->> 'ok')$$, pg_temp.fresh_amr()), 'true', 'Alessia elimina il proprio account');
select is((select coalesce(sum(n), 0)::int from pg_temp.refs_to('00000000-0000-0000-0000-00000000a003')), 0, 'NESSUN DATO ORFANO di Alessia in nessuna tabella (catalogo, auth e storage)');
select is((select string_agg(tbl || '.' || col || '=' || n, ', ') from pg_temp.refs_to('00000000-0000-0000-0000-00000000a003') where n > 0), null, 'nessuna tabella contiene ancora riferimenti ad Alessia');
select is((select count(*)::int from public.journal_entries where body like '%privato di Alessia%'), 0, 'il diario di Alessia non esiste più');
select is((select count(*)::int from public.wellbeing_notes where note like '%privata di Alessia%'), 0, 'le note di benessere non esistono più');
select is((select count(*)::int from public.invitations where inviter_id = '00000000-0000-0000-0000-00000000a003'), 0, 'gli inviti di Alessia sono eliminati');
select is((select count(*)::int from public.workouts w where not exists (select 1 from public.profiles p where p.id = w.owner_id)), 0, 'nessuna scheda senza proprietario');
-- scansione globale: nessuna riga in public punta a un utente inesistente
select is((select count(*)::int from public.journal_entries j where not exists (select 1 from public.profiles p where p.id = j.owner_id)), 0, 'nessun diario senza proprietario');
select is((select count(*)::int from public.messages m where not exists (select 1 from public.profiles p where p.id = m.sender_id) or not exists (select 1 from public.profiles p where p.id = m.recipient_id)), 0, 'nessun messaggio con mittente o destinatario inesistente');
select is((select count(*)::int from storage.objects o where bucket_id = 'avatars' and not exists (select 1 from public.profiles p where p.id::text = split_part(o.name, '/', 1))), 0, 'nessun file avatar senza proprietario');

select * from finish();
rollback;
