-- ALE. — Tappa 3: invii pianificati lato server. Ogni minuto il database chiama l'Edge Function `push-dispatch`
-- (motivazione del mattino + Web Push), che non dipende dal fatto che un browser sia aperto.
-- URL delle funzioni e segreto dei job stanno in public.internal_config (nessun accesso client); se mancano, il job non fa nulla.

create extension if not exists pg_net;

create function public.call_push_dispatch() returns void
language plpgsql security definer set search_path = '' as $$
declare
  url text;
  secret text;
begin
  select value into url from public.internal_config where key = 'functions_url';
  select value into secret from public.internal_config where key = 'cron_secret';
  if url is null or secret is null then return; end if;     -- non configurato: nessuna azione
  perform net.http_post(
    url := rtrim(url, '/') || '/push-dispatch',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000);
end $$;
revoke all on function public.call_push_dispatch() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'ale-push-dispatch';
    perform cron.schedule('ale-push-dispatch', '* * * * *', 'select public.call_push_dispatch()');
  end if;
end $$;
