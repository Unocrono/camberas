-- Cerrar tres funciones que llevaban tiempo abiertas a `anon`
--
-- Viene de la auditoria de las 62 funciones SECURITY DEFINER con EXECUTE para
-- anon. De las 62: 13 son publicas a proposito, 31 validan un token o un rol
-- por dentro y son seguras tal cual, y 17 quedaron acusadas. De esas 17, ocho
-- se cayeron al intentar refutarlas. Sobreviven nueve, y seis ya las cierra
-- 20260825230000_blindar_funciones_frente_a_anon.sql. Estas son las tres que
-- faltaban, y son anteriores a ese trabajo.
--
-- LA REGLA, que este repo ha aprendido por las malas DOS VECES y en sentidos
-- opuestos:
--
--   * 20260820180000_gallos_name_tv.sql:37 hizo REVOKE ... FROM anon. No
--     cerro nada: CREATE FUNCTION concede EXECUTE a PUBLIC y anon hereda por
--     ser miembro de PUBLIC.
--   * 20260825140000_retomar_pago_sin_callejon.sql:94 hizo REVOKE ... FROM
--     PUBLIC. Tampoco cerro nada: el ALTER DEFAULT PRIVILEGES de Supabase le
--     pone a anon un permiso EXPLICITO que ese REVOKE no toca.
--
-- Solo cierra la forma completa:
--     REVOKE EXECUTE ON FUNCTION ... FROM anon, authenticated, PUBLIC;
--     GRANT  EXECUTE ON FUNCTION ... TO <los que si deben entrar>;
--
-- Y despues hay que MIRAR el resultado con has_function_privilege, porque una
-- funcion mal cerrada no da ningun error: simplemente sigue abierta.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) assign_next_bib — quemaba dorsales
--
-- No valida nada: es un UPDATE que incrementa race_distances.next_bib y
-- devuelve el anterior. El id de la distancia es publico (la ficha de carrera
-- lo sirve a cualquiera), asi que con la clave anonima del bundle se podia
-- llamar en bucle hasta agotar el rango. A partir de ahi devuelve NULL y todo
-- inscrito legitimo se queda sin dorsal, cosa que solo se arregla a mano.
--
-- Se conserva `authenticated` porque src/pages/RaceDetail.tsx:594 la llama
-- desde el navegador al inscribirse en una carrera gratuita.
--
-- AVISO HONESTO: esto reduce la superficie, no la elimina. Cualquiera puede
-- crearse una cuenta gratis y pasar a ser `authenticated`. El cierre de
-- verdad es sacar la asignacion de dorsal del navegador (que la haga
-- guest-register o una edge function con service role, dentro del mismo paso
-- que crea la inscripcion) y dejar aqui solo service_role. Queda pendiente.
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.assign_next_bib(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.assign_next_bib(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) purge_gps_antiguos — borraba datos
--
-- La llama pg_cron a las 04:30 (20260803100000_ventana_captura.sql:187) y
-- nadie mas: ni una linea de src/ ni de supabase/functions/. Estaba al
-- alcance de cualquiera con la clave anonima, sin argumentos.
-- pg_cron ejecuta como el dueno del job, no por PostgREST, asi que cerrarla
-- no le afecta.
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.purge_gps_antiguos() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.purge_gps_antiguos() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) tokens_corredores_carrera — repartia los tokens de los QR
--
-- Devuelve la columna `token` de gps_tokens, que es el secreto que va dentro
-- del QR del dorsal (src/components/admin/RegistrationManagement.tsx:171 lo
-- monta como /activar.html?t=<token>). Con el, cualquiera puede vincularse un
-- dorsal ajeno y emitir posiciones GPS en su nombre. Y la tabla gps_tokens
-- esta cerrada a anon a proposito desde 20260716142415:46 — esta RPC era el
-- rodeo.
--
-- Ademas de cerrarla hay que devolverle el filtro que perdio: la version del
-- 5-ago (20260805120000_tokens_corredores_panel.sql:18-20) exigia admin u
-- organizador dueno, y la redefinicion del 20-ago para anadir name_tv se lo
-- dejo por el camino. Se restaura tal cual, conservando las diez columnas de
-- la version vigente.
--
-- NO se restaura la exclusion de race_motos que tambien traia la version del
-- 5-ago (:17): quitarla pudo ser deliberado al montar los gallos de TV, y
-- devolverla cambiaria lo que ve el panel. Queda anotado, no tocado.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tokens_corredores_carrera(p_race_id uuid)
RETURNS TABLE(
  token_row_id uuid, distance_id uuid, evento text, bib text,
  nombre text, token uuid, activo boolean, device_id text,
  intervalo int, name_tv text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT t.id, d.id, d.name, t.bib_number, t.participant_name,
         t.token, t.active, t.device_id, t.send_interval_seconds, t.name_tv
  FROM gps_tokens t
  JOIN race_distances d ON d.id::text = t.event_id::text
  WHERE d.race_id = p_race_id
    -- Recuperado de la version del 5-ago, perdido en la del 20-ago
    AND (has_role(auth.uid(), 'admin'::app_role)
         OR EXISTS (SELECT 1 FROM races r
                    WHERE r.id = p_race_id AND r.organizer_id = auth.uid()))
  ORDER BY d.name, t.bib_number;
$fn$;

REVOKE EXECUTE ON FUNCTION public.tokens_corredores_carrera(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.tokens_corredores_carrera(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Comprobacion. Deberia devolver exactamente esto:
--
--   assign_next_bib               | f | t
--   purge_gps_antiguos            | f | f
--   tokens_corredores_carrera     | f | t
-- ─────────────────────────────────────────────────────────────────────────
SELECT p.proname                                                 AS funcion,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS con_sesion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('assign_next_bib', 'purge_gps_antiguos', 'tokens_corredores_carrera')
ORDER BY p.proname;
