-- ============================================================
-- Camberas Org (PWA del Organizador): resumen en vivo de carrera
-- ============================================================
-- RPC SECURITY DEFINER: el control de acceso va dentro (organizador
-- de la carrera o admin), sin depender de politicas RLS sobre
-- payment_intents. Idempotente: se puede ejecutar varias veces.

create or replace function public.get_organizer_race_summary(p_race_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_allowed boolean;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select exists (
    select 1 from races r
    where r.id = p_race_id
      and (r.organizer_id = v_uid or public.has_role(v_uid, 'admin'::app_role))
  ) into v_allowed;

  if not v_allowed then
    raise exception 'Sin permiso sobre esta carrera';
  end if;

  select jsonb_build_object(
    'total_registrations', (
      select count(*) from registrations g
      where g.race_id = p_race_id and g.status <> 'cancelled'
    ),
    'paid_registrations', (
      select count(*) from registrations g
      where g.race_id = p_race_id and g.payment_status = 'paid'
    ),
    'revenue_total', coalesce((
      select sum(pi.amount) from payment_intents pi
      join registrations g on g.id = pi.registration_id
      where g.race_id = p_race_id and pi.status = 'completed'
    ), 0),
    'registrations_today', (
      select count(*) from registrations g
      where g.race_id = p_race_id and g.status <> 'cancelled'
        and g.created_at >= date_trunc('day', now())
    ),
    'revenue_today', coalesce((
      select sum(pi.amount) from payment_intents pi
      join registrations g on g.id = pi.registration_id
      where g.race_id = p_race_id and pi.status = 'completed'
        and pi.completed_at >= date_trunc('day', now())
    ), 0),
    'by_distance', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'distance_id', d.id,
        'name', d.name,
        'distance_km', d.distance_km,
        'max_participants', d.max_participants,
        'count', (
          select count(*) from registrations g
          where g.race_distance_id = d.id and g.status <> 'cancelled'
        ),
        'paid', (
          select count(*) from registrations g
          where g.race_distance_id = d.id and g.payment_status = 'paid'
        ),
        'revenue', coalesce((
          select sum(pi.amount) from payment_intents pi
          join registrations g on g.id = pi.registration_id
          where g.race_distance_id = d.id and pi.status = 'completed'
        ), 0)
      ) order by d.distance_km desc nulls last), '[]'::jsonb)
      from race_distances d
      where d.race_id = p_race_id
    ),
    'last_registrations', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select
          g.first_name,
          g.last_name,
          g.created_at,
          g.payment_status,
          g.bib_number,
          d.name as distance_name,
          (
            select pi.amount from payment_intents pi
            where pi.registration_id = g.id and pi.status = 'completed'
            limit 1
          ) as amount
        from registrations g
        join race_distances d on d.id = g.race_distance_id
        where g.race_id = p_race_id and g.status <> 'cancelled'
        order by g.created_at desc
        limit 15
      ) x
    )
  ) into v_result;

  return v_result;
end;
$fn$;

grant execute on function public.get_organizer_race_summary(uuid) to authenticated;
revoke execute on function public.get_organizer_race_summary(uuid) from anon;

-- Realtime para el "clinc": registrations en la publicacion realtime
-- (los eventos llegan filtrados por las politicas RLS del suscriptor)
do $pub$
begin
  alter publication supabase_realtime add table public.registrations;
exception when duplicate_object then
  null;
end $pub$;
