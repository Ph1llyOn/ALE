-- ALE. — Fase 2 (3/3): ciclo di vita dei dati.
--  * Fine del collegamento: tutto ciò che era condiviso o pendente viene chiuso nella stessa transazione.
--  * export_my_data(): l'utente scarica tutti i propri dati (accesso/portabilità).
--  * delete_my_account(): eliminazione completa, senza dati orfani, con riautenticazione recente.

-- ---------------------------------------------------------------------------
-- Fine del collegamento → revoca permessi, chiude proposte e messaggi in attesa, azzera i consensi per voce
-- ---------------------------------------------------------------------------
create function public.on_partnership_ended() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'ended' and old.status = 'active' then
    update public.sharing_permissions set revoked_at = now()
     where revoked_at is null
       and ((owner_id = new.alessia_id and grantee_id = new.phill_id)
         or (owner_id = new.phill_id and grantee_id = new.alessia_id));
    -- Un futuro partner non deve ereditare i consensi per singola voce.
    update public.journal_entries set shared_with_partner = false
     where owner_id in (new.alessia_id, new.phill_id) and shared_with_partner;
    update public.workout_proposals set status = 'withdrawn', decided_at = now()
     where owner_id = new.alessia_id and proposer_id = new.phill_id and status = 'proposed';
    update public.calendar_events set status = 'declined'
     where owner_id = new.alessia_id and created_by = new.phill_id and status = 'proposed';
    update public.scheduled_messages set status = 'cancelled'
     where status = 'pending'
       and ((sender_id = new.alessia_id and recipient_id = new.phill_id)
         or (sender_id = new.phill_id and recipient_id = new.alessia_id));
  end if;
  return new;
end $$;
revoke all on function public.on_partnership_ended() from public, anon, authenticated;
create trigger on_partnership_ended after update on public.partnerships
  for each row execute function public.on_partnership_ended();

-- ---------------------------------------------------------------------------
-- Esportazione dei propri dati
-- ---------------------------------------------------------------------------
create function public.export_my_data() returns jsonb
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

-- ---------------------------------------------------------------------------
-- Eliminazione dell'account
-- Requisiti: conferma esplicita, riautenticazione con password negli ultimi 5 minuti (letta dal JWT: l'orario
-- di autenticazione sopravvive al rinnovo del token), nessun file rimasto in Storage (si cancellano via API
-- prima: i DELETE diretti su storage.objects sono bloccati). Poi la riga in auth.users sparisce e tutto il resto
-- segue a cascata (profilo, dati, permessi, messaggi, notifiche, iscrizioni push, collegamento, inviti).
-- ---------------------------------------------------------------------------
create function public.delete_my_account(p_confirm text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  fresh boolean;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  if p_confirm is distinct from 'ELIMINA ACCOUNT' then
    return jsonb_build_object('ok', false, 'error', 'confirmation_required');
  end if;
  select exists (
    select 1 from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) a
     where a ->> 'method' = 'password'
       and (a ->> 'timestamp')::bigint > extract(epoch from now())::bigint - 300
  ) into fresh;
  if not fresh then return jsonb_build_object('ok', false, 'error', 'reauth_required'); end if;
  if exists (select 1 from storage.objects where split_part(name, '/', 1) = uid::text) then
    return jsonb_build_object('ok', false, 'error', 'storage_not_empty');
  end if;
  delete from auth.users where id = uid;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.export_my_data()           from public, anon;
revoke all on function public.delete_my_account(text)    from public, anon;
grant execute on function public.export_my_data()        to authenticated;
grant execute on function public.delete_my_account(text) to authenticated;
