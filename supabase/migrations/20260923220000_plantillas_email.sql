-- Plantillas de los emails a inscritos, editables por el admin
--
-- Hasta hoy los tres emails de la acción masiva "Enviar email a los
-- seleccionados" (comprobante, tu dorsal, Camberas Track) estaban escritos a
-- mano dentro de la edge function reenviar-comprobantes: cambiar una coma
-- exigía tocar código y redesplegar. El usuario pidió (23-sep-2026) que el
-- admin pueda editarlas y crear otras, desde Inscripciones.
--
-- EL DISEÑO NO SE EDITA, EL TEXTO SÍ. La cabecera, el pie, los colores y los
-- botones los pone la función (HTML de email con estilos en línea, que un
-- editor libre rompería en Outlook). La plantilla guarda texto sencillo:
--   · variables  {nombre} {carrera} {dorsal} {recorrido} {fecha} {lugar}
--   · bloques    [[tarjeta_dorsal]] [[boton_mi_dorsal]] [[resumen_inscripcion]]
--                [[datos_inscripcion]] [[botones_tiendas]] [[boton_activar]]
--                [[mensaje]]  — cada uno en su propia línea
--   · formato    **negrita**, [texto](https://enlace), "## " subtítulo,
--                "> " nota en pequeño, "- " lista, línea en blanco = párrafo
-- Los requisitos de envío salen de lo que usa la plantilla: si usa el dorsal
-- solo va a quien lo tiene; si usa [[boton_activar]], solo a recorridos con
-- GPS y dorsal GPS generado.
--
-- Las tres de siempre se siembran como DE SISTEMA: se editan y se desactivan,
-- pero no se borran ni cambian de clave, y guardan su texto de fábrica
-- (*_original) para el botón "Restaurar". Los mismos textos van en la función
-- como respaldo, por si esta migración aún no se ha aplicado.
--
-- Leen las plantillas el admin y los organizadores (las eligen al enviar);
-- solo el admin crea, edita y borra. La función las lee con service role.

CREATE TABLE IF NOT EXISTS public.plantillas_email (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave            text NOT NULL UNIQUE CHECK (clave ~ '^[a-z0-9][a-z0-9_-]{1,59}$'),
  nombre           text NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 80),
  descripcion      text CHECK (descripcion IS NULL OR length(descripcion) <= 400),
  asunto           text NOT NULL CHECK (length(trim(asunto)) BETWEEN 1 AND 200),
  titulo           text NOT NULL CHECK (length(trim(titulo)) BETWEEN 1 AND 200),
  cuerpo           text NOT NULL CHECK (length(trim(cuerpo)) BETWEEN 1 AND 20000),
  -- Título del recuadro [[mensaje]] y etiqueta del cuadro de texto al enviar
  etiqueta_mensaje text CHECK (etiqueta_mensaje IS NULL OR length(etiqueta_mensaje) <= 80),
  -- No mandarla a las importadas de uno.es salvo que se pida (el comprobante:
  -- uno.es ya les mandó el suyo)
  omitir_uno       boolean NOT NULL DEFAULT false,
  es_sistema       boolean NOT NULL DEFAULT false,
  activa           boolean NOT NULL DEFAULT true,
  orden            integer NOT NULL DEFAULT 100,
  -- Texto de fábrica de las de sistema, para "Restaurar original"
  asunto_original  text,
  titulo_original  text,
  cuerpo_original  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid
);

COMMENT ON TABLE public.plantillas_email IS
  'Plantillas de los emails a inscritos (acción masiva del panel). Texto con variables y bloques; el diseño lo pone la función reenviar-comprobantes.';

-- Las de sistema no se borran ni cambian de clave, nadie se fabrica una de
-- sistema, el texto de fábrica no se toca, y se sella quién y cuándo editó.
CREATE OR REPLACE FUNCTION public.plantillas_email_proteger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.es_sistema THEN
      RAISE EXCEPTION 'Las plantillas de sistema no se borran: se pueden editar o desactivar';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.es_sistema AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Las plantillas de sistema solo las crea una migración';
    END IF;
    NEW.updated_by := auth.uid();
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.es_sistema IS DISTINCT FROM OLD.es_sistema THEN
    RAISE EXCEPTION 'Una plantilla no cambia de sistema a normal ni al revés';
  END IF;
  IF OLD.es_sistema AND NEW.clave IS DISTINCT FROM OLD.clave THEN
    RAISE EXCEPTION 'En una plantilla de sistema no se cambia la clave';
  END IF;
  NEW.asunto_original := OLD.asunto_original;
  NEW.titulo_original := OLD.titulo_original;
  NEW.cuerpo_original := OLD.cuerpo_original;
  NEW.created_at      := OLD.created_at;
  NEW.updated_at      := now();
  NEW.updated_by      := auth.uid();
  RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.plantillas_email_proteger() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trigger_plantillas_email_proteger ON public.plantillas_email;
CREATE TRIGGER trigger_plantillas_email_proteger
BEFORE INSERT OR UPDATE OR DELETE ON public.plantillas_email
FOR EACH ROW EXECUTE FUNCTION public.plantillas_email_proteger();

-- ─────────────────────────────────────────────────────────────────────────
-- Permisos: leen admin y organizadores; escribe solo el admin
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.plantillas_email ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.plantillas_email FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plantillas_email TO authenticated;
GRANT ALL ON public.plantillas_email TO service_role;

DROP POLICY IF EXISTS "plantillas_email_lectura" ON public.plantillas_email;
CREATE POLICY "plantillas_email_lectura"
  ON public.plantillas_email FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.has_role(auth.uid(), 'organizer'::app_role));

DROP POLICY IF EXISTS "plantillas_email_alta" ON public.plantillas_email;
CREATE POLICY "plantillas_email_alta"
  ON public.plantillas_email FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND NOT es_sistema);

DROP POLICY IF EXISTS "plantillas_email_edicion" ON public.plantillas_email;
CREATE POLICY "plantillas_email_edicion"
  ON public.plantillas_email FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "plantillas_email_borrado" ON public.plantillas_email;
CREATE POLICY "plantillas_email_borrado"
  ON public.plantillas_email FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) AND NOT es_sistema);

-- ─────────────────────────────────────────────────────────────────────────
-- Las tres de siempre, como de sistema (mismos textos que la función)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.plantillas_email
  (clave, nombre, descripcion, asunto, titulo, cuerpo, etiqueta_mensaje, omitir_uno,
   es_sistema, activa, orden, asunto_original, titulo_original, cuerpo_original)
VALUES
  ($t$comprobante$t$, $t$Comprobante de inscripción$t$, $t$Sus datos, su dorsal (si lo tiene), el importe pagado y el enlace «Ver mi dorsal». No se manda a las importadas de uno.es salvo que se pida.$t$, $t$Comprobante de inscripción: {carrera}$t$, $t$Comprobante de inscripción$t$, $t$Hola {nombre},

Te reenviamos, a petición de la organización, el comprobante de tu inscripción en **{carrera}**.

[[resumen_inscripcion]]

[[boton_mi_dorsal]]
> Es tu código para la **recogida de dorsales**: enséñalo en el móvil.

[[datos_inscripcion]]

> Si algún dato no es correcto, ponte en contacto con la organización de la carrera.$t$, NULL, true, true, true, 10, $t$Comprobante de inscripción: {carrera}$t$, $t$Comprobante de inscripción$t$, $t$Hola {nombre},

Te reenviamos, a petición de la organización, el comprobante de tu inscripción en **{carrera}**.

[[resumen_inscripcion]]

[[boton_mi_dorsal]]
> Es tu código para la **recogida de dorsales**: enséñalo en el móvil.

[[datos_inscripcion]]

> Si algún dato no es correcto, ponte en contacto con la organización de la carrera.$t$),
  ($t$dorsal$t$, $t$Tu dorsal y QR para la recogida$t$, $t$El dorsal en grande y el enlace «Ver mi dorsal» con el QR que se escanea en la mesa de recogida. Solo a inscritos con dorsal.$t$, $t$Tu dorsal {dorsal} para {carrera}$t$, $t$Tu dorsal para la carrera$t$, $t$Hola {nombre},

Ya tienes dorsal para **{carrera}**.

[[tarjeta_dorsal]]

[[boton_mi_dorsal]]
> Al pulsar verás tu dorsal y un **código QR**. Enséñalo en el móvil en la **mesa de recogida de dorsales** y te atienden en segundos. Guarda este correo.

[[mensaje]]

> Si algún dato no es correcto, ponte en contacto con la organización de la carrera.$t$, $t$Recogida de dorsales$t$, false, true, true, 20, $t$Tu dorsal {dorsal} para {carrera}$t$, $t$Tu dorsal para la carrera$t$, $t$Hola {nombre},

Ya tienes dorsal para **{carrera}**.

[[tarjeta_dorsal]]

[[boton_mi_dorsal]]
> Al pulsar verás tu dorsal y un **código QR**. Enséñalo en el móvil en la **mesa de recogida de dorsales** y te atienden en segundos. Guarda este correo.

[[mensaje]]

> Si algún dato no es correcto, ponte en contacto con la organización de la carrera.$t$),
  ($t$track$t$, $t$Camberas Track: instalar y activar el dorsal$t$, $t$Enlaces a las tiendas y el botón personal que vincula el dorsal al móvil. Solo recorridos con seguimiento GPS y dorsales GPS generados.$t$, $t$Sigue {carrera} en directo con Camberas Track$t$, $t$Sigue la carrera en directo$t$, $t$Hola {nombre},

En **{carrera}** usamos **Camberas Track**: la organización sabe dónde estás durante la prueba y tu gente puede seguirte en el mapa en directo. Solo hay que hacer tres cosas:

## 1. Instala Camberas Track en tu móvil
Es gratis y no pide registro.
[[botones_tiendas]]

## 2. Activa tu dorsal {dorsal}
Con la app ya instalada, pulsa este botón **desde ese mismo móvil**: tu dorsal queda vinculado a él. Este enlace es personal, no lo compartas.
[[boton_activar]]

## 3. El día de la carrera
Abre la app antes de la salida, comprueba que aparece tu dorsal y lleva el móvil contigo. Nada más: la app envía tu posición sola, también con la pantalla apagada.

> Sin registro ni datos personales: solo tu dorsal y tu posición durante la carrera.

[[mensaje]]$t$, $t$De la organización$t$, false, true, true, 30, $t$Sigue {carrera} en directo con Camberas Track$t$, $t$Sigue la carrera en directo$t$, $t$Hola {nombre},

En **{carrera}** usamos **Camberas Track**: la organización sabe dónde estás durante la prueba y tu gente puede seguirte en el mapa en directo. Solo hay que hacer tres cosas:

## 1. Instala Camberas Track en tu móvil
Es gratis y no pide registro.
[[botones_tiendas]]

## 2. Activa tu dorsal {dorsal}
Con la app ya instalada, pulsa este botón **desde ese mismo móvil**: tu dorsal queda vinculado a él. Este enlace es personal, no lo compartas.
[[boton_activar]]

## 3. El día de la carrera
Abre la app antes de la salida, comprueba que aparece tu dorsal y lleva el móvil contigo. Nada más: la app envía tu posición sola, también con la pantalla apagada.

> Sin registro ni datos personales: solo tu dorsal y tu posición durante la carrera.

[[mensaje]]$t$)
ON CONFLICT (clave) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- Entrada de menú: Inscripciones > Plantillas de email, solo en el de admin.
-- El grupo (con emoji) se copia de la fila vecina: el SQL queda sin emojis.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.menu_items
  (menu_type, title, icon, route, view_name, parent_id, group_label, display_order, is_visible, requires_auth)
SELECT 'admin', 'Plantillas de email', 'Mail', NULL, 'plantillas-email', NULL,
       (SELECT m.group_label FROM public.menu_items m
        WHERE m.menu_type = 'admin' AND m.view_name = 'registrations' LIMIT 1),
       365, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items m
  WHERE m.menu_type = 'admin' AND m.view_name = 'plantillas-email'
);

-- ─────────────────────────────────────────────────────────────────────────
-- Comprobación. Deben salir las 3 plantillas de sistema, 4 políticas y la
-- entrada de menú en el grupo de Inscripciones.
-- ─────────────────────────────────────────────────────────────────────────
SELECT 'plantilla' AS que, clave AS detalle, es_sistema::text AS sistema, activa::text AS activa
FROM public.plantillas_email
UNION ALL
SELECT 'politica', policyname, cmd, NULL
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'plantillas_email'
UNION ALL
SELECT 'menu', group_label || ' > ' || title, display_order::text, NULL
FROM public.menu_items WHERE view_name = 'plantillas-email'
ORDER BY 1, 2;
