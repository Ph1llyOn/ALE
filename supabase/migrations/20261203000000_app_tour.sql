-- Tutorial iniziale di ALE. (solo Alessia): stato persistente sull'account, così non riappare
-- dopo aggiornamenti, logout/login o su un altro dispositivo.
--   app_tour_status: null = mai visto · in_progress = uscita a metà (si riprende) · done = completato · skipped = saltato
--   app_tour_step:   a che passo si era arrivati (0-based)
-- Le policy RLS di user_settings non cambiano: si estendono solo i grant di colonna già usati dall'app.

alter table public.user_settings
  add column if not exists app_tour_status text check (app_tour_status in ('in_progress', 'done', 'skipped')),
  add column if not exists app_tour_step   smallint not null default 0 check (app_tour_step between 0 and 10),
  add column if not exists app_tour_at     timestamptz;

grant insert (app_tour_status, app_tour_step, app_tour_at) on public.user_settings to authenticated;
grant update (app_tour_status, app_tour_step, app_tour_at) on public.user_settings to authenticated;
