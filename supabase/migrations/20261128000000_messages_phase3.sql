-- ALE. — Fase 3: messaggi (biglietti) con modifica/eliminazione, ricevute private, invio programmato.
--
-- Scelte:
--  * Chi scrive (Phill) può modificare ed eliminare i propri messaggi, in qualsiasi momento.
--  * Lo stato "letto/archiviato" appartiene a CHI RICEVE e vive in una tabella a parte (message_receipts):
--    il mittente non lo vede, nemmeno via API. Niente conferme di lettura: nessuna pressione su Alessia.
--  * Alessia può nascondere (archiviare) un biglietto dalla propria vista senza toccare la cronologia di Phill.
--  * L'invio programmato è una funzione del database (dispatch_due_scheduled_messages), eseguita ogni minuto da pg_cron
--    quando l'estensione è disponibile. Nessun servizio esterno, nessun costo.

-- ---------------------------------------------------------------------------
-- messages: via read_at, aggiunge edited_at, modifica/eliminazione del mittente
-- ---------------------------------------------------------------------------
drop policy messages_update_read on public.messages;
alter table public.messages drop column read_at;
alter table public.messages add column edited_at timestamptz;
alter table public.messages add constraint messages_id_recipient_unique unique (id, recipient_id);

create policy messages_update_sender on public.messages for update to authenticated
  using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));
create policy messages_delete_sender on public.messages for delete to authenticated
  using (sender_id = (select auth.uid()));
grant update (title, body) on public.messages to authenticated;
grant delete on public.messages to authenticated;

create function public.messages_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end $$;
revoke all on function public.messages_before_update() from public, anon, authenticated;
create trigger messages_before_update before update on public.messages
  for each row execute function public.messages_before_update();

-- Notifica in-app al destinatario quando arriva un messaggio (senza il contenuto: solo "chi").
create function public.messages_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sender_name text;
begin
  select display_name into sender_name from public.profiles where id = new.sender_id;
  insert into public.notifications (user_id, kind, title)
  values (new.recipient_id, 'message', 'Un biglietto da ' || coalesce(sender_name, 'Phill'));
  return new;
end $$;
revoke all on function public.messages_notify() from public, anon, authenticated;
create trigger messages_notify after insert on public.messages
  for each row execute function public.messages_notify();

-- ---------------------------------------------------------------------------
-- message_receipts: lettura/archiviazione, visibili e modificabili SOLO da chi riceve
-- ---------------------------------------------------------------------------
create table public.message_receipts (
  message_id    uuid primary key,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  read_at       timestamptz,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  foreign key (message_id, recipient_id) references public.messages (id, recipient_id) on delete cascade
);
create index message_receipts_recipient on public.message_receipts (recipient_id);
alter table public.message_receipts enable row level security;
alter table public.message_receipts force row level security;

create policy receipts_select on public.message_receipts for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy receipts_insert on public.message_receipts for insert to authenticated
  with check (recipient_id = (select auth.uid()));
create policy receipts_update on public.message_receipts for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
grant select on public.message_receipts to authenticated;
grant insert (message_id, recipient_id, read_at, archived_at) on public.message_receipts to authenticated;
grant update (read_at, archived_at) on public.message_receipts to authenticated;

-- ---------------------------------------------------------------------------
-- scheduled_messages: il mittente modifica, annulla ed elimina finché il messaggio è in attesa
-- ---------------------------------------------------------------------------
drop policy scheduled_cancel on public.scheduled_messages;
create policy scheduled_update on public.scheduled_messages for update to authenticated
  using (sender_id = (select auth.uid()) and status = 'pending')
  with check (sender_id = (select auth.uid())
              and ((status = 'pending' and send_at > now()) or status = 'cancelled'));
create policy scheduled_delete on public.scheduled_messages for delete to authenticated
  using (sender_id = (select auth.uid()));
grant update (title, body, send_at) on public.scheduled_messages to authenticated;
grant delete on public.scheduled_messages to authenticated;

-- ---------------------------------------------------------------------------
-- Invio programmato: sposta in `messages` ciò che è scaduto. Solo server (cron / service role).
-- ---------------------------------------------------------------------------
create function public.dispatch_due_scheduled_messages(p_limit integer default 100) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r public.scheduled_messages%rowtype;
  new_id uuid;
  n integer := 0;
begin
  for r in
    select * from public.scheduled_messages
     where status = 'pending' and send_at <= now()
     order by send_at
     limit greatest(coalesce(p_limit, 0), 0)
       for update skip locked
  loop
    begin
      if not exists (
        select 1 from public.partnerships p
         where p.status = 'active'
           and ((p.alessia_id = r.sender_id and p.phill_id = r.recipient_id)
             or (p.phill_id = r.sender_id and p.alessia_id = r.recipient_id))) then
        update public.scheduled_messages set status = 'cancelled', last_error = 'collegamento non attivo' where id = r.id;
        continue;
      end if;
      insert into public.messages (sender_id, recipient_id, title, body)
        values (r.sender_id, r.recipient_id, r.title, r.body) returning id into new_id;
      update public.scheduled_messages
         set status = 'sent', message_id = new_id, attempts = attempts + 1, last_error = null
       where id = r.id;
      n := n + 1;
    exception when others then
      update public.scheduled_messages
         set attempts = attempts + 1,
             last_error = left(sqlerrm, 200),
             status = case when attempts + 1 >= 5 then 'failed' else 'pending' end
       where id = r.id;
    end;
  end loop;
  return n;
end $$;
revoke all on function public.dispatch_due_scheduled_messages(integer) from public, anon, authenticated;

-- Pianificazione ogni minuto con pg_cron (gratuito, interno al database). Se l'estensione non è disponibile la
-- migrazione prosegue: la funzione resta richiamabile dal server in altro modo.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'ale-dispatch-scheduled-messages';
    perform cron.schedule('ale-dispatch-scheduled-messages', '* * * * *', 'select public.dispatch_due_scheduled_messages()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- export_my_data: aggiunge le ricevute (24 tabelle personali)
-- ---------------------------------------------------------------------------
create or replace function public.export_my_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  result jsonb := '{}'::jsonb;
  t text; w text; proj text; j jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  for t, w, proj in
    select * from (values
      ('profiles',                  'id = $1',                              'to_jsonb(x)'),
      ('partnerships',              'alessia_id = $1 or phill_id = $1',     'to_jsonb(x)'),
      ('invitations',               'inviter_id = $1',                      $p$to_jsonb(x) - 'code_hash'$p$),
      ('sharing_permissions',       'owner_id = $1 or grantee_id = $1',     'to_jsonb(x)'),
      ('equipment',                 'owner_id = $1',                        'to_jsonb(x)'),
      ('workouts',                  'owner_id = $1',                        'to_jsonb(x)'),
      ('workout_exercises',         'owner_id = $1',                        'to_jsonb(x)'),
      ('workout_sessions',          'owner_id = $1',                        'to_jsonb(x)'),
      ('session_exercise_progress', 'owner_id = $1',                        'to_jsonb(x)'),
      ('workout_proposals',         'owner_id = $1 or proposer_id = $1',    'to_jsonb(x)'),
      ('habits',                    'owner_id = $1',                        'to_jsonb(x)'),
      ('habit_logs',                'owner_id = $1',                        'to_jsonb(x)'),
      ('calendar_events',           'owner_id = $1 or created_by = $1',     'to_jsonb(x)'),
      ('journal_entries',           'owner_id = $1',                        'to_jsonb(x)'),
      ('wellbeing_logs',            'owner_id = $1',                        'to_jsonb(x)'),
      ('wellbeing_notes',           'owner_id = $1',                        'to_jsonb(x)'),
      ('progress_records',          'owner_id = $1',                        'to_jsonb(x)'),
      ('messages',                  'sender_id = $1 or recipient_id = $1',  'to_jsonb(x)'),
      ('message_receipts',          'recipient_id = $1',                    'to_jsonb(x)'),
      ('scheduled_messages',        'sender_id = $1',                       'to_jsonb(x)'),
      ('notifications',             'user_id = $1',                         'to_jsonb(x)'),
      ('push_subscriptions',        'user_id = $1',                         $p$to_jsonb(x) - 'auth' - 'p256dh'$p$),
      ('ai_preferences',            'user_id = $1',                         'to_jsonb(x)'),
      ('ai_generations',            'user_id = $1',                         'to_jsonb(x)')
    ) v(tbl, cond, expr)
  loop
    execute format('select coalesce(jsonb_agg(%s), ''[]''::jsonb) from public.%I x where %s', proj, t, w) into j using uid;
    result := result || jsonb_build_object(t, j);
  end loop;
  return jsonb_build_object('ok', true, 'exported_at', now(), 'data', result);
end $$;
