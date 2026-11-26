-- ALE. — Motore di allenamento: preferenze e limiti di Alessia, sessioni guidate salvate passo per passo,
-- feedback privati sugli esercizi, piano settimanale nel calendario.
-- Nessuna modifica a autenticazione, permessi o categorie di condivisione esistenti.

-- ---------------------------------------------------------------------------
-- Impostazioni di allenamento (private di Alessia)
-- ---------------------------------------------------------------------------
alter table public.user_settings
  add column fitness_level   text     not null default 'beginner' check (fitness_level in ('beginner', 'intermediate', 'advanced')),
  add column session_minutes integer  not null default 30 check (session_minutes between 10 and 120),
  add column weekly_sessions integer  not null default 3 check (weekly_sessions between 1 and 6),
  add column available_days  smallint[] not null default '{1,2,3,4,5,6,7}'
    check (cardinality(available_days) between 1 and 7 and available_days <@ array[1,2,3,4,5,6,7]::smallint[]),
  add column avoid_flags     text[]   not null default '{}'
    check (cardinality(avoid_flags) <= 10 and avoid_flags <@ array['lumbar','knees','wrists','shoulders','neck','impact','floor','balance']::text[]),
  add column preferences     jsonb    not null default '{"treadmill":true,"abs":true}'
    check (jsonb_typeof(preferences) = 'object' and pg_column_size(preferences) <= 1024),
  add column auto_plan       boolean  not null default true;

grant insert (fitness_level, session_minutes, weekly_sessions, available_days, avoid_flags, preferences, auto_plan) on public.user_settings to authenticated;
grant update (fitness_level, session_minutes, weekly_sessions, available_days, avoid_flags, preferences, auto_plan) on public.user_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Sessioni guidate: stato salvato a ogni passaggio (si riprende esattamente da dove si era)
-- ---------------------------------------------------------------------------
alter table public.workout_sessions drop constraint session_end_consistent;
alter table public.workout_sessions drop constraint workout_sessions_status_check;
alter table public.workout_sessions
  add column plan      jsonb check (plan is null or (jsonb_typeof(plan) = 'object' and pg_column_size(plan) <= 32768)),
  add column run_state jsonb check (run_state is null or (jsonb_typeof(run_state) = 'object' and pg_column_size(run_state) <= 4096)),
  add column event_id  uuid references public.calendar_events (id) on delete set null,
  add constraint workout_sessions_status_check check (status in ('in_progress', 'completed', 'stopped')),
  add constraint session_end_consistent check ((status in ('completed', 'stopped')) = (ended_at is not null));

alter table public.session_exercise_progress
  add column exercise_key text check (exercise_key ~ '^[a-z0-9-]{1,60}$'),
  add column status       text not null default 'pending' check (status in ('pending', 'active', 'done', 'partial', 'skipped', 'stopped')),
  add column sets_total   integer check (sets_total between 1 and 50),
  add column sets_done    integer not null default 0 check (sets_done between 0 and 50),
  add column sets_skipped integer not null default 0 check (sets_skipped between 0 and 50);
update public.session_exercise_progress set status = case when done then 'done' else 'pending' end;
alter table public.session_exercise_progress
  add constraint progress_done_consistent check (done = (status = 'done'));

-- ---------------------------------------------------------------------------
-- Feedback sugli esercizi: SEMPRE privati (nessuna categoria di condivisione, nessuna lettura per Phill)
-- ---------------------------------------------------------------------------
create table public.exercise_feedback (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  session_id  uuid,
  exercise_key text not null check (exercise_key ~ '^[a-z0-9-]{1,60}$'),
  rating      text not null check (rating in ('too_easy', 'right', 'hard', 'too_hard', 'pain', 'not_completed')),
  note        text check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  foreign key (session_id, owner_id) references public.workout_sessions (id, owner_id) on delete cascade
);
create unique index exercise_feedback_session_exercise on public.exercise_feedback (session_id, exercise_key);
create index exercise_feedback_owner_time on public.exercise_feedback (owner_id, created_at desc);
alter table public.exercise_feedback enable row level security;
alter table public.exercise_feedback force row level security;
create trigger exercise_feedback_owner_immutable before update on public.exercise_feedback for each row execute function public.prevent_owner_change('owner_id');
create policy exercise_feedback_select on public.exercise_feedback for select to authenticated using (owner_id = (select auth.uid()));
create policy exercise_feedback_insert on public.exercise_feedback for insert to authenticated with check (owner_id = (select auth.uid()));
create policy exercise_feedback_update on public.exercise_feedback for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy exercise_feedback_delete on public.exercise_feedback for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.exercise_feedback to authenticated;

-- ---------------------------------------------------------------------------
-- Piano settimanale nel calendario: gli eventi del piano si riconoscono e non si duplicano
-- ---------------------------------------------------------------------------
alter table public.calendar_events
  add column source        text not null default 'manual' check (source in ('manual', 'plan')),
  add column plan_key      text check (plan_key ~ '^[0-9]{4}-W[0-9]{2}:[1-7]:[a-z]{1,12}$'),
  add column plan_data     jsonb check (plan_data is null or (jsonb_typeof(plan_data) = 'object' and pg_column_size(plan_data) <= 2048)),
  add column user_modified boolean not null default false,
  add constraint plan_event_has_key check ((source = 'plan') = (plan_key is not null)),
  add constraint plan_event_by_owner check (source <> 'plan' or created_by = owner_id);   -- il piano lo crea solo Alessia, mai Phill
-- i valori nulli non si considerano uguali: gli eventi manuali non sono toccati, quelli del piano non possono duplicarsi
alter table public.calendar_events add constraint calendar_events_plan_key unique (owner_id, plan_key);

-- ---------------------------------------------------------------------------
-- Esportazione dati: ora 28 tabelle (si aggiunge exercise_feedback)
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
      ('exercise_feedback',         'owner_id = $1',                        'to_jsonb(x)'),
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
