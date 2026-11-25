-- ALE. — Fase 2 (2/3): tabelle applicative con RLS.
-- Nessuna interfaccia ancora: qui si fissa il modello dei dati e, soprattutto, chi può leggere/scrivere cosa.
--
-- Modello:
--  * Ogni riga ha un proprietario. Il proprietario legge e scrive i propri dati.
--  * Il partner (Phill) legge solo le categorie che il proprietario ha condiviso (can_view) e MAI scrive
--    nei dati altrui, salvo i due canali previsti: proposte (workout_proposals, eventi 'proposed') e messaggi.
--  * Diario e benessere sono privati di default; la nota di benessere non è mai condivisibile.
--  * Le tabelle figlie usano una chiave esterna composta (parent_id, owner_id): un figlio non può appartenere
--    a un proprietario diverso da quello del genitore.

-- ---------------------------------------------------------------------------
-- Funzioni generiche per i trigger
-- ---------------------------------------------------------------------------
create function public.prevent_owner_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if to_jsonb(new) ->> tg_argv[0] is distinct from to_jsonb(old) ->> tg_argv[0] then
    raise exception 'il proprietario di una riga non è modificabile';
  end if;
  return new;
end $$;

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

revoke all on function public.prevent_owner_change() from public, anon, authenticated;
revoke all on function public.touch_updated_at()     from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ATTREZZATURA (categoria: equipment)
-- ---------------------------------------------------------------------------
create table public.equipment (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  notes       text check (char_length(notes) <= 500),
  avoid       boolean not null default false,            -- attrezzatura che non si vuole usare
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ATTIVITÀ (categoria: activities): schede, esercizi, sessioni
-- ---------------------------------------------------------------------------
create table public.workouts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  notes       text check (char_length(notes) <= 2000),
  source      text not null default 'own' check (source in ('own', 'proposal')),
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.workout_exercises (
  id            uuid primary key default gen_random_uuid(),
  workout_id    uuid not null,
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  position      integer not null default 0 check (position >= 0),
  name          text not null check (char_length(btrim(name)) between 1 and 120),
  image_key     text check (image_key ~ '^[A-Za-z0-9._-]{1,120}$'),   -- nome file in assets/exercises (con licenza registrata)
  sets          integer check (sets between 1 and 50),
  reps          text check (char_length(reps) <= 40),
  rest_seconds  integer check (rest_seconds between 0 and 3600),
  notes         text check (char_length(notes) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (workout_id, owner_id) references public.workouts (id, owner_id) on delete cascade
);
create index workout_exercises_workout on public.workout_exercises (workout_id);

create table public.workout_sessions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  workout_id  uuid,                                       -- nullo = allenamento libero
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  status      text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  notes       text check (char_length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint session_end_consistent check ((status = 'completed') = (ended_at is not null)),
  unique (id, owner_id),
  foreign key (workout_id, owner_id) references public.workouts (id, owner_id) on delete set null (workout_id)
);

create table public.session_exercise_progress (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  position    integer not null default 0 check (position >= 0),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  done        boolean not null default false,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (session_id, owner_id) references public.workout_sessions (id, owner_id) on delete cascade
);
create index session_progress_session on public.session_exercise_progress (session_id);

-- Proposte di allenamento: Phill propone, solo Alessia decide.
create table public.workout_proposals (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,      -- Alessia (destinataria)
  proposer_id  uuid not null references public.profiles (id) on delete cascade,      -- Phill
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  notes        text check (char_length(notes) <= 2000),
  exercises    jsonb not null default '[]'
                 check (jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) <= 50
                        and pg_column_size(exercises) <= 32768),
  status       text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected', 'withdrawn')),
  workout_id   uuid,
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint proposal_distinct check (owner_id <> proposer_id),
  foreign key (workout_id, owner_id) references public.workouts (id, owner_id) on delete set null (workout_id)
);
create index workout_proposals_owner on public.workout_proposals (owner_id);
create index workout_proposals_proposer on public.workout_proposals (proposer_id);

-- ---------------------------------------------------------------------------
-- ABITUDINI (categoria: habits)
-- ---------------------------------------------------------------------------
create table public.habits (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  preset_key  text check (preset_key ~ '^[a-z0-9_]{1,40}$'),     -- abitudine predefinita; nullo = personalizzata
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.habit_logs (
  id          uuid primary key default gen_random_uuid(),
  habit_id    uuid not null,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  day         date not null,
  done        boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (habit_id, day),
  foreign key (habit_id, owner_id) references public.habits (id, owner_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- CALENDARIO (categoria: calendar). Phill può solo PROPORRE eventi.
-- ---------------------------------------------------------------------------
create table public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  created_by  uuid references public.profiles (id) on delete set null,   -- se l'autore sparisce, l'evento resta al proprietario
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  category    text not null check (category in ('workout', 'walk', 'personal', 'reminder', 'weekly_goal', 'rest', 'school_work')),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  all_day     boolean not null default false,
  status      text not null default 'confirmed' check (status in ('confirmed', 'proposed', 'declined')),
  completed   boolean not null default false,
  notes       text check (char_length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint event_order check (ends_at is null or ends_at >= starts_at)
);
create index calendar_events_owner_time on public.calendar_events (owner_id, starts_at);

-- ---------------------------------------------------------------------------
-- DIARIO (categoria: journal, + consenso per singola voce)
-- ---------------------------------------------------------------------------
create table public.journal_entries (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references public.profiles (id) on delete cascade,
  title                text check (char_length(title) <= 120),
  body                 text not null check (char_length(btrim(body)) between 1 and 20000),
  mode                 text not null default 'free' check (mode in ('free', 'guided')),
  prompt               text check (char_length(prompt) <= 300),
  shared_with_partner  boolean not null default false,          -- privata di default
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index journal_entries_owner_time on public.journal_entries (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- BENESSERE (categoria: wellbeing = solo umore ed energia). La nota libera NON è condivisibile.
-- ---------------------------------------------------------------------------
create table public.wellbeing_logs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  day         date not null,
  mood        smallint not null check (mood between 1 and 5),
  energy      smallint not null check (energy between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, day),
  unique (id, owner_id)
);

create table public.wellbeing_notes (
  log_id      uuid primary key,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  note        text not null check (char_length(btrim(note)) between 1 and 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (log_id, owner_id) references public.wellbeing_logs (id, owner_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- PROGRESSI (categoria: progress): crescita personale, mai peso/misure, mai classifiche
-- ---------------------------------------------------------------------------
create table public.progress_records (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('habit_streak', 'small_win', 'goal_achieved', 'workout_completed')),
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  achieved_on  date not null default current_date,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- MESSAGGI tra i due partner collegati
-- ---------------------------------------------------------------------------
create table public.messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references public.profiles (id) on delete cascade,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  title         text check (char_length(title) <= 120),
  body          text not null check (char_length(btrim(body)) between 1 and 2000),
  sent_at       timestamptz not null default now(),
  read_at       timestamptz,
  constraint message_distinct check (sender_id <> recipient_id)
);
create index messages_recipient on public.messages (recipient_id, sent_at desc);
create index messages_sender on public.messages (sender_id, sent_at desc);

create table public.scheduled_messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references public.profiles (id) on delete cascade,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  title         text check (char_length(title) <= 120),
  body          text not null check (char_length(btrim(body)) between 1 and 2000),
  send_at       timestamptz not null,
  status        text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempts      integer not null default 0,
  last_error    text,
  message_id    uuid references public.messages (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint scheduled_distinct check (sender_id <> recipient_id)
);
create index scheduled_messages_due on public.scheduled_messages (send_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- NOTIFICHE, PUSH, AI (solo dell'utente stesso)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (char_length(kind) between 1 and 40),
  title       text not null check (char_length(title) <= 120),
  body        text check (char_length(body) <= 500),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index notifications_user on public.notifications (user_id, created_at desc);

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 2000),
  p256dh      text not null check (char_length(p256dh) <= 500),
  auth        text not null check (char_length(auth) <= 500),
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

-- Consenso AI: tutto DISATTIVATO di default; il consenso è esplicito, datato e revocabile.
create table public.ai_preferences (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  ai_enabled         boolean not null default false,
  use_journal        boolean not null default false,    -- Claude può usare le voci di diario (solo se l'utente lo consente)
  use_wellbeing      boolean not null default false,
  use_equipment      boolean not null default false,
  reminders_enabled  boolean not null default false,
  consent_at         timestamptz,
  updated_at         timestamptz not null default now()
);

create function public.ai_preferences_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not new.ai_enabled then
    new.use_journal := false; new.use_wellbeing := false; new.use_equipment := false;
    new.reminders_enabled := false; new.consent_at := null;
  elsif tg_op = 'INSERT' or not old.ai_enabled then
    new.consent_at := now();                       -- il momento del consenso è registrato dal server
  else
    new.consent_at := old.consent_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.ai_preferences_before_write() from public, anon, authenticated;
create trigger ai_preferences_before_write before insert or update on public.ai_preferences
  for each row execute function public.ai_preferences_before_write();

-- Storico delle generazioni AI: scritto SOLO dal server (service role), leggibile dal proprietario.
create table public.ai_generations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (char_length(kind) between 1 and 40),
  status      text not null check (status in ('ok', 'rejected', 'error')),
  output      jsonb,
  created_at  timestamptz not null default now()
);
create index ai_generations_user on public.ai_generations (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS FORZATA su tutte + trigger comuni
-- ---------------------------------------------------------------------------
do $$
declare t text; ownercol text;
begin
  for t, ownercol in
    select * from (values
      ('equipment','owner_id'), ('workouts','owner_id'), ('workout_exercises','owner_id'),
      ('workout_sessions','owner_id'), ('session_exercise_progress','owner_id'), ('workout_proposals','owner_id'),
      ('habits','owner_id'), ('habit_logs','owner_id'), ('calendar_events','owner_id'),
      ('journal_entries','owner_id'), ('wellbeing_logs','owner_id'), ('wellbeing_notes','owner_id'),
      ('progress_records','owner_id'), ('notifications','user_id'), ('push_subscriptions','user_id'),
      ('ai_preferences','user_id'), ('ai_generations','user_id')
    ) v(t, c)
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.prevent_owner_change(%L)',
                   t || '_owner_immutable', t, ownercol);
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'updated_at')
       and t <> 'ai_preferences' then
      execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
                     t || '_touch', t);
    end if;
  end loop;
  alter table public.messages enable row level security;           alter table public.messages force row level security;
  alter table public.scheduled_messages enable row level security; alter table public.scheduled_messages force row level security;
end $$;

-- mittente/destinatario di un messaggio non si cambiano
create trigger messages_sender_immutable before update on public.messages
  for each row execute function public.prevent_owner_change('sender_id');
create trigger messages_recipient_immutable before update on public.messages
  for each row execute function public.prevent_owner_change('recipient_id');
create trigger scheduled_sender_immutable before update on public.scheduled_messages
  for each row execute function public.prevent_owner_change('sender_id');

-- ---------------------------------------------------------------------------
-- POLICY: dati del proprietario, con lettura condivisibile per categoria
-- ---------------------------------------------------------------------------
do $$
declare t text; cat text;
begin
  -- (tabella, categoria condivisibile; null = privata)
  for t, cat in
    select * from (values
      ('equipment', 'equipment'), ('workouts', 'activities'), ('workout_exercises', 'activities'),
      ('workout_sessions', 'activities'), ('session_exercise_progress', 'activities'),
      ('habits', 'habits'), ('habit_logs', 'habits'), ('progress_records', 'progress'),
      ('wellbeing_logs', 'wellbeing'), ('wellbeing_notes', null)
    ) v(t, c)
  loop
    if cat is null then
      execute format($f$create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))$f$, t || '_select', t);
    else
      execute format($f$create policy %I on public.%I for select to authenticated
                        using (owner_id = (select auth.uid()) or public.can_view(owner_id, %L))$f$, t || '_select', t, cat);
    end if;
    execute format($f$create policy %I on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))$f$, t || '_insert', t);
    execute format($f$create policy %I on public.%I for update to authenticated
                      using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))$f$, t || '_update', t);
    execute format($f$create policy %I on public.%I for delete to authenticated using (owner_id = (select auth.uid()))$f$, t || '_delete', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Diario: due chiavi. Phill legge una voce solo se (1) Alessia ha condiviso la categoria `journal`
-- E (2) la voce è stata marcata come condivisa.
create policy journal_entries_select on public.journal_entries for select to authenticated
  using (owner_id = (select auth.uid())
         or (shared_with_partner and public.can_view(owner_id, 'journal')));
create policy journal_entries_insert on public.journal_entries for insert to authenticated with check (owner_id = (select auth.uid()));
create policy journal_entries_update on public.journal_entries for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy journal_entries_delete on public.journal_entries for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.journal_entries to authenticated;

-- Calendario: Phill vede solo eventi CONFERMATI (se condiviso) e le proprie proposte; propone ma non decide.
-- L'autore di una proposta ne vede lo stato finché è 'proposed' o 'declined'; dopo l'approvazione l'evento è
-- di Alessia e Phill lo vede solo se lei condivide il calendario (revoca = effetto immediato).
create policy calendar_events_select on public.calendar_events for select to authenticated
  using (owner_id = (select auth.uid())
         or (created_by = (select auth.uid()) and status in ('proposed', 'declined'))
         or (status = 'confirmed' and public.can_view(owner_id, 'calendar')));
create policy calendar_events_insert on public.calendar_events for insert to authenticated
  with check ((owner_id = (select auth.uid()) and created_by = (select auth.uid()) and status = 'confirmed')
           or (created_by = (select auth.uid()) and status = 'proposed' and owner_id <> (select auth.uid())
               and public.is_partner_of(owner_id)));
create policy calendar_events_update on public.calendar_events for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy calendar_events_delete on public.calendar_events for delete to authenticated
  using (owner_id = (select auth.uid()) or (created_by = (select auth.uid()) and status = 'proposed'));
grant select, insert, update, delete on public.calendar_events to authenticated;
-- L'autore non si cambia verso un'altra persona; può solo diventare NULL (account dell'autore eliminato).
create function public.calendar_events_creator_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.created_by is not null and new.created_by is distinct from old.created_by then
    raise exception 'l''autore di un evento non è modificabile';
  end if;
  return new;
end $$;
revoke all on function public.calendar_events_creator_guard() from public, anon, authenticated;
create trigger calendar_events_creator_immutable before update on public.calendar_events
  for each row execute function public.calendar_events_creator_guard();

-- Proposte di allenamento: le vedono Alessia e chi le ha create. Contenuto immutabile dopo l'invio.
create policy workout_proposals_select on public.workout_proposals for select to authenticated
  using (owner_id = (select auth.uid()) or proposer_id = (select auth.uid()));
create policy workout_proposals_insert on public.workout_proposals for insert to authenticated
  with check (proposer_id = (select auth.uid()) and status = 'proposed' and public.is_partner_of(owner_id));
create policy workout_proposals_update on public.workout_proposals for update to authenticated
  using (owner_id = (select auth.uid()) or proposer_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) or proposer_id = (select auth.uid()));
grant select on public.workout_proposals to authenticated;
grant insert (owner_id, proposer_id, title, notes, exercises) on public.workout_proposals to authenticated;
grant update (status, workout_id) on public.workout_proposals to authenticated;
-- (le colonne decided_at ecc. sono gestite dal trigger; il blocco su owner_id dell'elenco sopra resta attivo)
create trigger workout_proposals_proposer_immutable before update on public.workout_proposals
  for each row execute function public.prevent_owner_change('proposer_id');

create function public.workout_proposals_transition() returns trigger
language plpgsql set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') or uid is null then
    if new.status <> old.status then new.decided_at := coalesce(new.decided_at, now()); end if;
    return new;                                   -- operazioni di sistema (es. fine del collegamento)
  end if;
  if new.status = old.status then
    if new.workout_id is distinct from old.workout_id and uid <> old.owner_id then
      raise exception 'solo la destinataria può collegare la proposta a una scheda';
    end if;
    return new;
  end if;
  if old.status <> 'proposed' then raise exception 'la proposta è già stata decisa'; end if;
  if new.status in ('accepted', 'rejected') and uid = old.owner_id then
    new.decided_at := now();
  elsif new.status = 'withdrawn' and uid = old.proposer_id then
    new.decided_at := now();
  else
    raise exception 'transizione non consentita';
  end if;
  return new;
end $$;
revoke all on function public.workout_proposals_transition() from public, anon, authenticated;
create trigger workout_proposals_transition before update on public.workout_proposals
  for each row execute function public.workout_proposals_transition();

-- Messaggi: li vedono mittente e destinatario; si scrive solo al partner attivo; il destinatario li segna come letti.
create policy messages_select on public.messages for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_partner_of(recipient_id));
create policy messages_update_read on public.messages for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
grant select on public.messages to authenticated;
grant insert (sender_id, recipient_id, title, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

-- Messaggi programmati: il mittente li crea e può annullarli finché sono in attesa; l'invio lo fa il server.
create policy scheduled_select on public.scheduled_messages for select to authenticated
  using (sender_id = (select auth.uid()));
create policy scheduled_insert on public.scheduled_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and status = 'pending' and send_at > now() and public.is_partner_of(recipient_id));
create policy scheduled_cancel on public.scheduled_messages for update to authenticated
  using (sender_id = (select auth.uid()) and status = 'pending')
  with check (sender_id = (select auth.uid()) and status = 'cancelled');
grant select on public.scheduled_messages to authenticated;
grant insert (sender_id, recipient_id, title, body, send_at) on public.scheduled_messages to authenticated;
grant update (status) on public.scheduled_messages to authenticated;

-- Notifiche: le crea solo il server; l'utente le legge, le segna come lette e le cancella.
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Iscrizioni push: dell'utente.
create policy push_select on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_insert on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
grant select, delete on public.push_subscriptions to authenticated;
grant insert (user_id, endpoint, p256dh, auth) on public.push_subscriptions to authenticated;

-- Preferenze AI: dell'utente (consenso esplicito).
create policy ai_prefs_select on public.ai_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy ai_prefs_insert on public.ai_preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy ai_prefs_update on public.ai_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ai_prefs_delete on public.ai_preferences for delete to authenticated using (user_id = (select auth.uid()));
grant select, delete on public.ai_preferences to authenticated;
grant insert (user_id, ai_enabled, use_journal, use_wellbeing, use_equipment, reminders_enabled) on public.ai_preferences to authenticated;
grant update (ai_enabled, use_journal, use_wellbeing, use_equipment, reminders_enabled) on public.ai_preferences to authenticated;

-- Storico AI: sola lettura per il proprietario (scrive il server con la service role).
create policy ai_generations_select on public.ai_generations for select to authenticated using (user_id = (select auth.uid()));
grant select on public.ai_generations to authenticated;
