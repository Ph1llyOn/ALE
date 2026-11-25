-- ALE. — Tappa 2: obiettivi, impostazioni personali, preferenze di notifica, proposte, promemoria server-side.

-- ---------------------------------------------------------------------------
-- Obiettivi personali (categoria condivisibile: progress)
-- ---------------------------------------------------------------------------
create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  title         text not null check (char_length(btrim(title)) between 1 and 120),
  notes         text check (char_length(notes) <= 500),
  target_date   date,
  status        text not null default 'active' check (status in ('active', 'done', 'dropped')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint goal_done_consistent check ((status = 'done') = (completed_at is not null))
);
create index goals_owner on public.goals (owner_id, status);
alter table public.goals enable row level security;
alter table public.goals force row level security;
create trigger goals_owner_immutable before update on public.goals for each row execute function public.prevent_owner_change('owner_id');
create trigger goals_touch before update on public.goals for each row execute function public.touch_updated_at();
create policy goals_select on public.goals for select to authenticated
  using (owner_id = (select auth.uid()) or public.can_view(owner_id, 'progress'));
create policy goals_insert on public.goals for insert to authenticated with check (owner_id = (select auth.uid()));
create policy goals_update on public.goals for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy goals_delete on public.goals for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.goals to authenticated;

-- Le piccole conquiste non si duplicano (stesso tipo, titolo e giorno).
create unique index progress_records_no_dupes on public.progress_records (owner_id, kind, title, achieved_on);

-- ---------------------------------------------------------------------------
-- Impostazioni personali (private): onboarding, spazi, preferenze, indicazioni del professionista
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id                uuid primary key references public.profiles (id) on delete cascade,
  onboarding_steps       jsonb not null default '{}' check (jsonb_typeof(onboarding_steps) = 'object' and pg_column_size(onboarding_steps) <= 2048),
  onboarding_done_at     timestamptz,
  spaces                 text check (char_length(spaces) <= 500),             -- spazio disponibile per muoversi
  prefers_no_equipment   boolean not null default false,                      -- preferenza per attività senza attrezzi
  limitations            text check (char_length(limitations) <= 500),        -- limitazioni pratiche
  professional_notes     text check (char_length(professional_notes) <= 1000),-- indicazioni ricevute dal professionista
  morning_time           time not null default '08:00',
  updated_at             timestamptz not null default now()
);
alter table public.user_settings enable row level security;
alter table public.user_settings force row level security;
create trigger user_settings_touch before update on public.user_settings for each row execute function public.touch_updated_at();
create trigger user_settings_owner_immutable before update on public.user_settings for each row execute function public.prevent_owner_change('user_id');
create policy user_settings_select on public.user_settings for select to authenticated using (user_id = (select auth.uid()));
create policy user_settings_insert on public.user_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_settings_update on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_settings_delete on public.user_settings for delete to authenticated using (user_id = (select auth.uid()));
grant select, delete on public.user_settings to authenticated;
grant insert (user_id, onboarding_steps, onboarding_done_at, spaces, prefers_no_equipment, limitations, professional_notes, morning_time)
  on public.user_settings to authenticated;
grant update (onboarding_steps, onboarding_done_at, spaces, prefers_no_equipment, limitations, professional_notes, morning_time)
  on public.user_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Preferenze di notifica (assenza di riga = tutto attivo)
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  messages          boolean not null default true,
  daily_motivation  boolean not null default true,
  proposals         boolean not null default true,
  reminders         boolean not null default true,
  updated_at        timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;
create trigger notification_preferences_touch before update on public.notification_preferences for each row execute function public.touch_updated_at();
create trigger notification_preferences_owner_immutable before update on public.notification_preferences for each row execute function public.prevent_owner_change('user_id');
create policy notif_prefs_select on public.notification_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy notif_prefs_insert on public.notification_preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy notif_prefs_update on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.notification_preferences to authenticated;
grant insert (user_id, messages, daily_motivation, proposals, reminders) on public.notification_preferences to authenticated;
grant update (messages, daily_motivation, proposals, reminders) on public.notification_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- Notifiche: destinazione, stato di invio push, dispositivi
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column link text check (link is null or link ~ '^#/[a-z0-9/_?=&.-]{0,100}$'),
  add column pushed_at timestamptz,
  add column push_error text;
create index notifications_to_push on public.notifications (created_at) where pushed_at is null;

alter table public.push_subscriptions add column label text check (char_length(label) <= 60);
grant insert (label) on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- Esercizi: chiave del catalogo; una sola generazione AI "del giorno" per tipo
-- ---------------------------------------------------------------------------
alter table public.workout_exercises add column exercise_key text check (exercise_key ~ '^[a-z0-9-]{1,60}$');
alter table public.ai_generations add column for_day date;
create unique index ai_generations_one_per_day on public.ai_generations (user_id, kind, for_day) where for_day is not null and status = 'ok';

-- Promemoria già notificati
alter table public.calendar_events add column notified_at timestamptz;

-- ---------------------------------------------------------------------------
-- notify(): unico punto in cui si creano notifiche, nel rispetto delle preferenze dell'utente
-- ---------------------------------------------------------------------------
create function public.notify(p_user uuid, p_kind text, p_title text, p_body text default null, p_link text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  allowed boolean := true;
  nid uuid;
begin
  select case p_kind
           when 'message' then messages
           when 'proposal' then proposals
           when 'daily' then daily_motivation
           when 'reminder' then reminders
           else true end
    into allowed from public.notification_preferences where user_id = p_user;
  if coalesce(allowed, true) is false then return null; end if;
  insert into public.notifications (user_id, kind, title, body, link)
  values (p_user, p_kind, left(p_title, 120), left(p_body, 500), p_link) returning id into nid;
  return nid;
end $$;
revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

-- I messaggi notificano tramite notify() (preferenze rispettate, link alla Home)
create or replace function public.messages_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sender_name text;
begin
  select display_name into sender_name from public.profiles where id = new.sender_id;
  perform public.notify(new.recipient_id, 'message', 'Un biglietto da ' || coalesce(sender_name, 'Phill'), null, '#/biglietti');
  return new;
end $$;

-- Proposte di allenamento: notifica alla destinataria e, a decisione presa, a chi ha proposto
create function public.proposals_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who text;
begin
  if tg_op = 'INSERT' then
    select display_name into who from public.profiles where id = new.proposer_id;
    perform public.notify(new.owner_id, 'proposal', coalesce(who, 'Phill') || ' ti ha proposto una scheda', new.title, '#/attivita');
  elsif new.status is distinct from old.status and new.status in ('accepted', 'rejected') then
    select display_name into who from public.profiles where id = new.owner_id;
    perform public.notify(new.proposer_id, 'proposal',
      coalesce(who, 'Alessia') || case new.status when 'accepted' then ' ha accettato' else ' ha declinato' end || ' la tua proposta', new.title, '#/home');
  end if;
  return new;
end $$;
revoke all on function public.proposals_notify() from public, anon, authenticated;
create trigger proposals_notify after insert or update on public.workout_proposals for each row execute function public.proposals_notify();

-- Eventi proposti da Phill: notifica ad Alessia; decisione: notifica a Phill
create function public.events_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who text;
begin
  if tg_op = 'INSERT' and new.status = 'proposed' and new.created_by is not null then
    select display_name into who from public.profiles where id = new.created_by;
    perform public.notify(new.owner_id, 'proposal', coalesce(who, 'Phill') || ' ti ha proposto un evento', new.title, '#/calendario');
  elsif tg_op = 'UPDATE' and old.status = 'proposed' and new.status in ('confirmed', 'declined') and new.created_by is not null then
    select display_name into who from public.profiles where id = new.owner_id;
    perform public.notify(new.created_by, 'proposal',
      coalesce(who, 'Alessia') || case new.status when 'confirmed' then ' ha accettato' else ' ha declinato' end || ' il tuo evento', new.title, '#/home');
  end if;
  return new;
end $$;
revoke all on function public.events_notify() from public, anon, authenticated;
create trigger events_notify after insert or update on public.calendar_events for each row execute function public.events_notify();

-- ---------------------------------------------------------------------------
-- Accettazione atomica di una proposta (con eventuali modifiche di Alessia): crea scheda + esercizi
-- ---------------------------------------------------------------------------
create function public.accept_workout_proposal(p_id uuid, p_title text default null, p_exercises jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  pr public.workout_proposals%rowtype;
  wid uuid;
  ex jsonb;
  i integer := 0;
  list jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  select * into pr from public.workout_proposals where id = p_id and owner_id = uid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if pr.status <> 'proposed' then return jsonb_build_object('ok', false, 'error', 'already_decided'); end if;
  list := coalesce(p_exercises, pr.exercises);
  if jsonb_typeof(list) <> 'array' or jsonb_array_length(list) > 50 then
    return jsonb_build_object('ok', false, 'error', 'invalid_exercises');
  end if;
  begin
    insert into public.workouts (owner_id, title, notes, source)
      values (uid, left(btrim(coalesce(nullif(btrim(p_title), ''), pr.title)), 120), pr.notes, 'proposal') returning id into wid;
    for ex in select * from jsonb_array_elements(list) loop
      insert into public.workout_exercises (workout_id, owner_id, position, name, exercise_key, sets, reps, rest_seconds, notes)
      values (wid, uid, i, left(btrim(ex ->> 'name'), 120), nullif(ex ->> 'exercise_key', ''), nullif(ex ->> 'sets', '')::int,
              left(nullif(ex ->> 'reps', ''), 40), nullif(ex ->> 'rest_seconds', '')::int, left(nullif(ex ->> 'notes', ''), 500));
      i := i + 1;
    end loop;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid_exercises');
  end;
  update public.workout_proposals set status = 'accepted', workout_id = wid, decided_at = now() where id = pr.id;
  return jsonb_build_object('ok', true, 'workout_id', wid);
end $$;
revoke all on function public.accept_workout_proposal(uuid, text, jsonb) from public, anon;
grant execute on function public.accept_workout_proposal(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Promemoria: ogni minuto il server crea la notifica per i promemoria arrivati a scadenza
-- ---------------------------------------------------------------------------
create function public.generate_due_notifications() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in
    select id, owner_id, title from public.calendar_events
     where category = 'reminder' and status = 'confirmed' and not completed
       and notified_at is null and starts_at <= now() and starts_at > now() - interval '12 hours'
     order by starts_at limit 200 for update skip locked
  loop
    perform public.notify(r.owner_id, 'reminder', r.title, null, '#/calendario');
    update public.calendar_events set notified_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.generate_due_notifications() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'ale-due-notifications';
    perform cron.schedule('ale-due-notifications', '* * * * *', 'select public.generate_due_notifications()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- export_my_data: 27 tabelle personali
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
      ('goals',                     'owner_id = $1',                        'to_jsonb(x)'),
      ('calendar_events',           'owner_id = $1 or created_by = $1',     'to_jsonb(x)'),
      ('journal_entries',           'owner_id = $1',                        'to_jsonb(x)'),
      ('wellbeing_logs',            'owner_id = $1',                        'to_jsonb(x)'),
      ('wellbeing_notes',           'owner_id = $1',                        'to_jsonb(x)'),
      ('progress_records',          'owner_id = $1',                        'to_jsonb(x)'),
      ('messages',                  'sender_id = $1 or recipient_id = $1',  'to_jsonb(x)'),
      ('message_receipts',          'recipient_id = $1',                    'to_jsonb(x)'),
      ('scheduled_messages',        'sender_id = $1',                       'to_jsonb(x)'),
      ('notifications',             'user_id = $1',                         'to_jsonb(x)'),
      ('notification_preferences',  'user_id = $1',                         'to_jsonb(x)'),
      ('user_settings',             'user_id = $1',                         'to_jsonb(x)'),
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
