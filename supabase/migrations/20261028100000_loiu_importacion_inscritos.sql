-- =============================================================================
-- Loiu 500 Trail 2026: importación de inscritos de UNO, RockTheSport y manuales
-- (28-oct-2026). En Camberas no se abren inscripciones: solo se importan.
--  1. Recorrido nuevo «Marcha Txiki» 5 km, con chip y clasificación, no
--     competitivo, salida prevista y oficial 09:45 (hora de pared, +00).
--     Los triggers del recorrido crean ola, categoría, controles y formulario.
--  2. Campo «De Loiu» (casilla DeLoiu, ya existía en Trail) en Martxa y Txiki.
--  3. 234 inscripciones confirmadas:
--     - RTS 187, external_id rts-loc-<localizador> (el n.º de inscripción de
--       RTS es por pedido y lo comparten varios). La tarifa Martxa Txiki va
--       a Txiki aunque su modalidad diga Andar o Correr.
--     - UNO 39, external_id = ID de UNO. Los 6 «Organizador» (295 a 300) como
--       invitaciones: uno-org-<dorsal>, not_required, importe 0.
--     - Manuales 8 del Club Loiu Mendi Taldea, manual-loiu-<n>, Martxa,
--       dorsales 301 a 308, sin sexo ni nacimiento (no venían).
--     Sexo M y F. Tallas 2XL a XXL y las infantiles como «N Infantil».
--     Población Loiu normalizada a «Loiu». Un teléfono que era un email, fuera.
--     Los dorsales 99 y 100 (Dayana López Pérez, dos inscripciones) se dejan.
--  4. DeLoiu = true para quien tenga población Loiu y los manuales (25).
--
-- Los datos personales NO van en el repositorio: se cargaron a una tabla de
-- paso (importacion.imp_loiu, una línea por inscrito separada por |) desde
-- los ficheros RTS_63363 y UNO_registrants_list del 28-oct y Manuales.txt,
-- y la tabla se borró al terminar. Formato de cada línea:
--   externo|recorrido T/M/X|dorsal|nombre|apellidos|email|teléfono|DNI|
--   nacimiento|sexo|club|población|provincia|comunidad|país|talla|
--   origen e/m|pago p/o (o = invitación)|DeLoiu 1/0
-- Idempotente: no repite recorrido, campos ni inscripciones (por external_id).
-- APLICADA el 28-oct-2026 con la consulta de Lovable.
-- =============================================================================

-- 1. Recorrido Marcha Txiki
INSERT INTO public.race_distances (id, race_id, name, distance_km, price, is_visible, display_order, kind, competitive, chip, start_location, finish_location, cutoff_time)
SELECT '82df7d2c-9eb2-4002-a57a-61d8d75eb044', 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a', 'Marcha Txiki', 5, 10, true, 3, 'marcha', false, true,
       'Plaza de los Jubilados, Loiu', 'Plaza de los Jubilados, Loiu', '08:00:00'
WHERE NOT EXISTS (SELECT 1 FROM public.race_distances WHERE id = '82df7d2c-9eb2-4002-a57a-61d8d75eb044');

UPDATE public.race_waves SET wave_name = 'Txiki', hora_prevista = '2026-11-01 09:45:00+00', start_time = '2026-11-01 09:45:00+00'
WHERE race_distance_id = '82df7d2c-9eb2-4002-a57a-61d8d75eb044';
INSERT INTO public.race_waves (race_id, race_distance_id, wave_name, hora_prevista, start_time)
SELECT 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a', '82df7d2c-9eb2-4002-a57a-61d8d75eb044', 'Txiki', '2026-11-01 09:45:00+00', '2026-11-01 09:45:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.race_waves WHERE race_distance_id = '82df7d2c-9eb2-4002-a57a-61d8d75eb044');

INSERT INTO public.race_categories (race_id, race_distance_id, name, short_name, category_number, display_order, age_dependent)
SELECT 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a', '82df7d2c-9eb2-4002-a57a-61d8d75eb044', 'UNICA', 'UNICA', 1, 1, false
WHERE NOT EXISTS (SELECT 1 FROM public.race_categories WHERE race_distance_id = '82df7d2c-9eb2-4002-a57a-61d8d75eb044');

-- 2. Campo De Loiu en Martxa y Txiki, como el de Trail
INSERT INTO public.registration_form_fields (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible)
SELECT d.id, 'DeLoiu', 'De Loiu', 'checkbox', 17, false, false, true
FROM (VALUES ('fd206569-c83d-40d7-ba19-159511aae0af'::uuid), ('82df7d2c-9eb2-4002-a57a-61d8d75eb044'::uuid)) AS d(id)
WHERE NOT EXISTS (SELECT 1 FROM public.registration_form_fields f WHERE f.race_distance_id = d.id AND f.field_name = 'DeLoiu');

-- 3. Inscripciones, desde la tabla de paso
CREATE TEMP TABLE imp_loiu AS
SELECT NULLIF(split_part(l,'|',1),'') AS ext,
       CASE split_part(l,'|',2) WHEN 'T' THEN '711aa533-bcde-48f9-bf4f-a029d164e76e'::uuid
                                WHEN 'M' THEN 'fd206569-c83d-40d7-ba19-159511aae0af'::uuid
                                WHEN 'X' THEN '82df7d2c-9eb2-4002-a57a-61d8d75eb044'::uuid END AS dist,
       NULLIF(split_part(l,'|',3),'')::int AS bib,
       NULLIF(split_part(l,'|',4),'') AS fn, NULLIF(split_part(l,'|',5),'') AS ln,
       NULLIF(split_part(l,'|',6),'') AS email, NULLIF(split_part(l,'|',7),'') AS phone,
       NULLIF(split_part(l,'|',8),'') AS dni, NULLIF(split_part(l,'|',9),'')::date AS birth,
       NULLIF(split_part(l,'|',10),'') AS g,
       CASE split_part(l,'|',10) WHEN 'M' THEN 1 WHEN 'F' THEN 2 END AS gid,
       NULLIF(split_part(l,'|',11),'') AS club, NULLIF(split_part(l,'|',12),'') AS city,
       NULLIF(split_part(l,'|',13),'') AS prov, NULLIF(split_part(l,'|',14),'') AS ca,
       NULLIF(split_part(l,'|',15),'') AS country, NULLIF(split_part(l,'|',16),'') AS ts,
       CASE split_part(l,'|',17) WHEN 'm' THEN 'manual' ELSE 'external' END AS src,
       CASE split_part(l,'|',18) WHEN 'o' THEN 'not_required' ELSE 'paid' END AS pay,
       CASE split_part(l,'|',18) WHEN 'o' THEN 0::numeric END AS imp,
       split_part(l,'|',19) = '1' AS loiu
FROM importacion.imp_loiu;

INSERT INTO public.registrations (race_id, race_distance_id, bib_number, first_name, last_name, email, phone, dni_passport, birth_date, gender, gender_id, club, city, province, autonomous_community, country, tshirt_size, source, external_id, status, payment_status, importe_manual)
SELECT 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a', i.dist, i.bib, i.fn, i.ln, i.email, i.phone, i.dni, i.birth, i.g, i.gid, i.club, i.city, i.prov, i.ca, i.country, i.ts, i.src, i.ext, 'confirmed', i.pay, i.imp
FROM imp_loiu i
WHERE NOT EXISTS (SELECT 1 FROM public.registrations r
                  WHERE r.race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a' AND r.external_id = i.ext);

-- 4. De Loiu
INSERT INTO public.registration_responses (registration_id, field_id, field_value)
SELECT r.id, f.id, CASE WHEN i.loiu THEN 'true' ELSE 'false' END
FROM imp_loiu i
JOIN public.registrations r ON r.race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a' AND r.external_id = i.ext
JOIN public.registration_form_fields f ON f.race_distance_id = r.race_distance_id AND f.field_name = 'DeLoiu'
ON CONFLICT (registration_id, field_id) DO NOTHING;

DROP TABLE imp_loiu;
