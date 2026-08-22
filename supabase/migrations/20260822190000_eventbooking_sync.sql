-- Sincronización con EventBooking (uno.es):
-- external_id guarda el ID del inscrito en EventBooking. Es la clave que
-- hace idempotente el import diario: el mismo fichero/endpoint puede
-- procesarse mil veces y solo entran los nuevos (el DNI NO servía de
-- clave: en el export real de Ademco 2025 había 6 DNIs repetidos).

alter table public.registrations add column if not exists external_id text;

create unique index if not exists registrations_external_id_uniq
  on public.registrations (race_id, external_id)
  where external_id is not null;

-- Nuevo origen 'external' para que la facturación distinga estas altas
-- de las de pasarela y de las manuales del organizador.
alter table public.registrations drop constraint if exists registrations_source_check;
alter table public.registrations add constraint registrations_source_check
  check (source is null or source in ('gateway', 'manual', 'free', 'external'));

-- Configuración por carrera: qué evento de EventBooking le corresponde y
-- cómo se traduce cada Modalidad a un recorrido de Camberas. El mapeo es
-- EXPLÍCITO a propósito: una modalidad sin mapear se reporta como error,
-- nunca se deduce.
create table if not exists public.eventbooking_sync (
  race_id uuid primary key references public.races(id) on delete cascade,
  event_id integer not null,
  distance_map jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  last_sync_at timestamptz,
  last_result jsonb
);

alter table public.eventbooking_sync enable row level security;

drop policy if exists "eventbooking_sync_select" on public.eventbooking_sync;
create policy "eventbooking_sync_select" on public.eventbooking_sync
  for select using (
    has_role(auth.uid(), 'admin'::app_role)
    or exists (
      select 1 from public.races r
      where r.id = eventbooking_sync.race_id and r.organizer_id = auth.uid()
    )
  );
-- Sin políticas de escritura: la configuración se crea por SQL y solo la
-- edge function (service role) actualiza last_sync_at/last_result.
