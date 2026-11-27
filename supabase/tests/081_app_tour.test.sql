-- Test pgTAP: tutorial iniziale (stato su user_settings): colonne, vincoli, grant di colonna, isolamento tra utenti.
begin;
select no_plan();

create function pg_temp.login(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a081', 'a81@test.local', '{"role":"alessia","display_name":"Ale Tour"}'),
  ('00000000-0000-0000-0000-00000000b081', 'b81@test.local', '{"role":"phill","display_name":"Phill Tour"}');

select has_column('public', 'user_settings', 'app_tour_status', 'colonna stato del tutorial');
select has_column('public', 'user_settings', 'app_tour_step', 'colonna passo del tutorial');
select has_column('public', 'user_settings', 'app_tour_at', 'colonna data del tutorial');

-- stato di partenza: mai visto
insert into public.user_settings (user_id) values ('00000000-0000-0000-0000-00000000a081');
select is((select app_tour_status from public.user_settings where user_id = '00000000-0000-0000-0000-00000000a081'), null, 'il tutorial non risulta visto finché non lo si apre');
select is((select app_tour_step from public.user_settings where user_id = '00000000-0000-0000-0000-00000000a081')::int, 0, 'passo iniziale 0');

-- vincoli sui valori
select throws_ok($$ update public.user_settings set app_tour_status = 'boh' where user_id = '00000000-0000-0000-0000-00000000a081' $$, '23514', null, 'stato non ammesso rifiutato');
select throws_ok($$ update public.user_settings set app_tour_step = 11 where user_id = '00000000-0000-0000-0000-00000000a081' $$, '23514', null, 'passo fuori intervallo rifiutato');

-- Alessia salva il proprio progresso (come utente autenticato, con le sue credenziali)
select pg_temp.login('00000000-0000-0000-0000-00000000a081');
select lives_ok($$ update public.user_settings set app_tour_status = 'in_progress', app_tour_step = 3, app_tour_at = now() where user_id = '00000000-0000-0000-0000-00000000a081' $$, 'Alessia salva il suo passo');
reset role;
select is((select app_tour_step from public.user_settings where user_id = '00000000-0000-0000-0000-00000000a081')::int, 3, 'il passo è salvato nel database');

-- grant di colonna: solo le colonne del tutorial
select is(has_column_privilege('authenticated', 'public.user_settings', 'app_tour_status', 'UPDATE'), true, 'Alessia può aggiornare lo stato del tutorial');
select is(has_column_privilege('authenticated', 'public.user_settings', 'user_id', 'UPDATE'), false, 'nessuno può cambiare il proprietario della riga');
select is(has_table_privilege('anon', 'public.user_settings', 'SELECT'), false, 'anon non legge le impostazioni');

-- isolamento: Phill non vede né modifica il tutorial di Alessia (RLS invariata)
insert into public.user_settings (user_id) values ('00000000-0000-0000-0000-00000000b081');
select pg_temp.login('00000000-0000-0000-0000-00000000b081');
select is((select count(*)::int from public.user_settings where user_id = '00000000-0000-0000-0000-00000000a081'), 0, 'Phill non vede il tutorial di Alessia');
select is((select count(*)::int from public.user_settings where user_id = '00000000-0000-0000-0000-00000000b081'), 1, 'Phill vede solo la sua riga');
reset role;

select * from finish();
rollback;
