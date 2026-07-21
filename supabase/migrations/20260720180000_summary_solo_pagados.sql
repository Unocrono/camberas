create or replace function public.get_organizer_race_summary(p_race_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
v_uid uuid := auth.uid();
v_ok boolean;
v_res jsonb;
begin
if v_uid is null then raise exception 'No autenticado'; end if;
select exists (select 1 from races r where r.id=p_race_id
and (r.organizer_id=v_uid or public.has_role(v_uid,'admin'::app_role))) into v_ok;
if not v_ok then raise exception 'Sin permiso sobre esta carrera'; end if;
with reg as (
select g.*, (select pi.amount from payment_intents pi
where pi.registration_id=g.id and pi.status='completed' limit 1) as amt,
(select pi.completed_at from payment_intents pi
where pi.registration_id=g.id and pi.status='completed' limit 1) as pat
from registrations g where g.race_id=p_race_id and g.status<>'cancelled'
and g.payment_status in ('paid','not_required'))
select jsonb_build_object(
'total_registrations',(select count(*) from reg),
'paid_registrations',(select count(*) from reg where payment_status='paid'),
'pending_registrations',(select count(*) from registrations g
where g.race_id=p_race_id and g.status<>'cancelled'
and g.payment_status not in ('paid','not_required')),
'revenue_total',(select coalesce(sum(amt),0) from reg),
'registrations_today',(select count(*) from reg where created_at>=date_trunc('day',now())),
'revenue_today',(select coalesce(sum(amt),0) from reg where pat>=date_trunc('day',now())),
'by_distance',(select coalesce(jsonb_agg(jsonb_build_object(
'distance_id',d.id,'name',d.name,'distance_km',d.distance_km,
'max_participants',d.max_participants,
'count',(select count(*) from reg where race_distance_id=d.id),
'paid',(select count(*) from reg where race_distance_id=d.id and payment_status='paid'),
'revenue',(select coalesce(sum(amt),0) from reg where race_distance_id=d.id)
) order by d.distance_km desc nulls last),'[]'::jsonb)
from race_distances d where d.race_id=p_race_id),
'by_source',(select coalesce(jsonb_agg(jsonb_build_object(
'source',src,'count',cnt,'paid',pd,'revenue',rev) order by src),'[]'::jsonb)
from (select coalesce(source,'manual') src,count(*) cnt,
count(*) filter (where payment_status='paid') pd,coalesce(sum(amt),0) rev
from reg group by coalesce(source,'manual')) s),
'last_registrations',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
select r.first_name,r.last_name,r.created_at,r.payment_status,r.bib_number,
r.source,d.name as distance_name,r.amt as amount
from reg r join race_distances d on d.id=r.race_distance_id
order by r.created_at desc limit 15) x)
) into v_res;
return v_res;
end;
$fn$;
