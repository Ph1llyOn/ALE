-- Solo testi: le notifiche sulle proposte usano parole più naturali ("non ha accettato" al posto di "ha declinato").
-- Nessuna modifica a permessi, dati o logica: stesse funzioni, stessi trigger, stesse destinazioni.

create or replace function public.proposals_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who text;
begin
  if tg_op = 'INSERT' then
    select display_name into who from public.profiles where id = new.proposer_id;
    perform public.notify(new.owner_id, 'proposal', coalesce(who, 'Phill') || ' ti ha proposto un allenamento', new.title, '#/attivita');
  elsif new.status is distinct from old.status and new.status in ('accepted', 'rejected') then
    select display_name into who from public.profiles where id = new.owner_id;
    perform public.notify(new.proposer_id, 'proposal',
      coalesce(who, 'Alessia') || case new.status when 'accepted' then ' ha accettato' else ' non ha accettato' end || ' la tua proposta', new.title, '#/home');
  end if;
  return new;
end $$;

create or replace function public.events_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who text;
begin
  if tg_op = 'INSERT' and new.status = 'proposed' and new.created_by is not null then
    select display_name into who from public.profiles where id = new.created_by;
    perform public.notify(new.owner_id, 'proposal', coalesce(who, 'Phill') || ' ti ha proposto un evento', new.title, '#/calendario');
  elsif tg_op = 'UPDATE' and old.status = 'proposed' and new.status in ('confirmed', 'declined') and new.created_by is not null then
    select display_name into who from public.profiles where id = new.owner_id;
    perform public.notify(new.created_by, 'proposal',
      coalesce(who, 'Alessia') || case new.status when 'confirmed' then ' ha accettato' else ' non ha accettato' end || ' il tuo evento', new.title, '#/home');
  end if;
  return new;
end $$;
