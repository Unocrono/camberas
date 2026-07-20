-- ============================================================
-- Origen de la inscripcion (facturacion): pasarela / manual / gratuita
-- ============================================================
-- Hasta ahora el origen se deducia de payment_intents. Esta columna lo
-- deja explicito para poder facturar con un simple group by.
-- Idempotente: se puede ejecutar varias veces.

alter table public.registrations add column if not exists source text;

-- Relleno retroactivo de lo que ya existe, con la deduccion antigua:
-- si paso por Redsys tiene payment_intent; si es gratuita, 'free';
-- el resto lo metio el organizador a mano.
update public.registrations g
set source = case
  when exists (
    select 1 from public.payment_intents p where p.registration_id = g.id
  ) then 'gateway'
  when g.payment_status = 'not_required' then 'free'
  else 'manual'
end
where g.source is null;

-- Por defecto 'manual': cualquier alta que no diga lo contrario es a mano
alter table public.registrations alter column source set default 'manual';

do $chk$
begin
  alter table public.registrations
    add constraint registrations_source_check
    check (source is null or source in ('gateway', 'manual', 'free'));
exception when duplicate_object then
  null;
end $chk$;

create index if not exists registrations_source_idx on public.registrations (source);

-- ============================================================
-- Informe del organizador: se le anade el desglose por origen
-- ============================================================
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
    'by_source', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'source', s.src,
        'count', s.cnt,
        'paid', s.paid,
        'revenue', s.revenue
      ) order by s.src), '[]'::jsonb)
      from (
        select
          coalesce(g.source, 'manual') as src,
          count(*) as cnt,
          count(*) filter (where g.payment_status = 'paid') as paid,
          coalesce(sum((
            select pi.amount from payment_intents pi
            where pi.registration_id = g.id and pi.status = 'completed'
            limit 1
          )), 0) as revenue
        from registrations g
        where g.race_id = p_race_id and g.status <> 'cancelled'
        group by coalesce(g.source, 'manual')
      ) s
    ),
    'last_registrations', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select
          g.first_name,
          g.last_name,
          g.created_at,
          g.payment_status,
          g.bib_number,
          g.source,
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
