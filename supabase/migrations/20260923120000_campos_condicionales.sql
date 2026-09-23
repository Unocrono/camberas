-- ============================================================
-- CAMPOS CONDICIONALES en el formulario de inscripción (23-sep-2026)
--
-- Un campo puede depender de otro: solo se muestra (y solo cuenta como
-- obligatorio) cuando el campo del que depende tiene un valor concreto.
-- Primer caso: Desafío Sarrio — "¿Unidad de destino?" solo si
-- "¿Eres militar?" = Sí. Vale para todas las carreras.
--
-- Referencia por id, no por field_name: el id no cambia aunque se
-- renombre la etiqueta. Si se borra el campo del que depende, la
-- condición se suelta (ON DELETE SET NULL) y el campo pasa a verse
-- siempre, en vez de desaparecer con él.
--
-- Un campo condicional NO puede llevar importe (suplemento). El precio lo
-- recalcula el servidor a partir de las respuestas guardadas, y no sabe
-- de condiciones: si un campo oculto pudiera llevar importe, alguien que
-- manipulara la petición podría colar el valor de un campo oculto con
-- importe negativo. Prohibiéndolo aquí, las funciones de pago no se
-- tocan y no hay nada que colar.
--
-- Editor SQL de Lovable: sentencias sueltas, sin $$.
-- ============================================================

alter table public.registration_form_fields
  add column if not exists depends_on_field_id uuid
    references public.registration_form_fields(id) on delete set null;

alter table public.registration_form_fields
  add column if not exists depends_on_value text;

alter table public.registration_form_fields
  drop constraint if exists form_fields_no_depende_de_si_mismo;
alter table public.registration_form_fields
  add constraint form_fields_no_depende_de_si_mismo
  check (depends_on_field_id is null or depends_on_field_id <> id);

alter table public.registration_form_fields
  drop constraint if exists form_fields_condicion_con_valor;
alter table public.registration_form_fields
  add constraint form_fields_condicion_con_valor
  check (depends_on_field_id is null or depends_on_value is not null);

-- field_options puede ser un array antiguo (["a","b"]); ->> sobre un array
-- devuelve NULL, que pasa la comprobación sin error.
alter table public.registration_form_fields
  drop constraint if exists form_fields_condicional_sin_importe;
alter table public.registration_form_fields
  add constraint form_fields_condicional_sin_importe
  check (depends_on_field_id is null
         or (field_options ->> 'fee_enabled') is distinct from 'true');

create index if not exists idx_form_fields_depends_on
  on public.registration_form_fields(depends_on_field_id)
  where depends_on_field_id is not null;
