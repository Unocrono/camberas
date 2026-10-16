-- La plantilla «Tu dorsal y QR para la recogida» lleva el QR DENTRO del
-- correo (bloque [[qr_dorsal]], imagen de la edge function qr-dorsal) en vez
-- del botón «Ver mi dorsal» que había que pulsar para verlo (16-oct-2026).
--
-- Se cambian el texto vigente y el original (el de «restaurar»), pero el
-- vigente solo si nadie lo ha retocado: si el admin lo editó, se respeta y
-- el bloque nuevo queda a su alcance en el editor.
--
-- El trigger plantillas_email_proteger blinda los *_original frente a
-- cualquier UPDATE (para que el panel no pueda tocarlos): se apaga solo
-- dentro de esta transacción, para este cambio de fábrica.

BEGIN;

ALTER TABLE public.plantillas_email DISABLE TRIGGER trigger_plantillas_email_proteger;

UPDATE public.plantillas_email
   SET cuerpo = CASE WHEN cuerpo = cuerpo_original
                     THEN replace(cuerpo,
                            E'[[boton_mi_dorsal]]\n> Al pulsar verás tu dorsal y un **código QR**. Enséñalo en el móvil en la **mesa de recogida de dorsales** y te atienden en segundos. Guarda este correo.',
                            E'[[qr_dorsal]]\n> Enseña este **código QR** en el móvil en la **mesa de recogida de dorsales** y te atienden en segundos. Guarda este correo.')
                     ELSE cuerpo END,
       cuerpo_original = replace(cuerpo_original,
                            E'[[boton_mi_dorsal]]\n> Al pulsar verás tu dorsal y un **código QR**. Enséñalo en el móvil en la **mesa de recogida de dorsales** y te atienden en segundos. Guarda este correo.',
                            E'[[qr_dorsal]]\n> Enseña este **código QR** en el móvil en la **mesa de recogida de dorsales** y te atienden en segundos. Guarda este correo.'),
       descripcion = replace(descripcion,
                            'El dorsal en grande y el enlace «Ver mi dorsal» con el QR que se escanea en la mesa de recogida.',
                            'El dorsal en grande y, debajo, el QR que se escanea en la mesa de recogida, ya dentro del correo.'),
       updated_at = now()
 WHERE clave = 'dorsal';

ALTER TABLE public.plantillas_email ENABLE TRIGGER trigger_plantillas_email_proteger;

COMMIT;

-- Comprobación: el bloque nuevo en el texto vigente y en el original, y el
-- trigger encendido otra vez ('O')
SELECT p.clave, p.descripcion,
       position('[[qr_dorsal]]' in p.cuerpo) > 0          AS vigente_con_qr,
       position('[[qr_dorsal]]' in p.cuerpo_original) > 0 AS original_con_qr,
       (SELECT tgenabled FROM pg_trigger
         WHERE tgname = 'trigger_plantillas_email_proteger') AS trigger_activo
  FROM public.plantillas_email p WHERE p.clave = 'dorsal';
