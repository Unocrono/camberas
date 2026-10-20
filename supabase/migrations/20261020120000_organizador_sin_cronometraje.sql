-- El menú del organizador (/organizer) deja de enseñar el grupo
-- «⏱️ Cronometraje» (20-oct-2026, decisión del usuario: les complicaría
-- mucho). El cronometraje lo lleva UNO desde el panel de admin.
--
-- Solo se ocultan (is_visible = false): las pantallas siguen existiendo y el
-- menú de admin no cambia. La hora de salida PREVISTA, la que ve el público,
-- se sigue poniendo en Recorridos. Aplicado en producción el 20-oct.
UPDATE public.menu_items
   SET is_visible = false, updated_at = now()
 WHERE menu_type = 'organizer'
   AND group_label = '⏱️ Cronometraje';
