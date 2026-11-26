-- ALE. — Conservazione dei dati dell'assistente AI: i testi generati si conservano al massimo 90 giorni.
-- Servono solo a: tenere un solo pensiero al giorno (oggi), contare il limite giornaliero (24 ore) ed evitare di ripetere i messaggi recenti.
-- Nulla di ciò che è più vecchio di 90 giorni è necessario a queste funzioni. Cancella SOLO public.ai_generations: mai attività,
-- calendario, diario, progressi, benessere o altro.

create function public.purge_old_ai_generations() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.ai_generations where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.purge_old_ai_generations() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'ale-purge-ai-generations';
    perform cron.schedule('ale-purge-ai-generations', '30 3 * * *', 'select public.purge_old_ai_generations()');
  end if;
end $$;
