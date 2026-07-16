-- Centro de Ayuda gestionable: secciones y preguntas en BD
CREATE TABLE public.help_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  icon text NOT NULL DEFAULT 'HelpCircle',
  display_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.help_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.help_sections(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.help_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read visible help sections"
ON public.help_sections FOR SELECT USING (is_visible = true);

CREATE POLICY "Admins can manage help sections"
ON public.help_sections FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can read visible help faqs"
ON public.help_faqs FOR SELECT USING (is_visible = true);

CREATE POLICY "Admins can manage help faqs"
ON public.help_faqs FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed: contenido actual de Help.tsx
WITH s1 AS (
  INSERT INTO public.help_sections (title, icon, display_order)
  VALUES ('Inscripción en Carreras', 'UserPlus', 0) RETURNING id
), s2 AS (
  INSERT INTO public.help_sections (title, icon, display_order)
  VALUES ('App de Seguimiento GPS', 'MapPin', 1) RETURNING id
), s3 AS (
  INSERT INTO public.help_sections (title, icon, display_order)
  VALUES ('Ver Resultados', 'Trophy', 2) RETURNING id
), s4 AS (
  INSERT INTO public.help_sections (title, icon, display_order)
  VALUES ('Contactar con el Organizador', 'MessageCircle', 3) RETURNING id
)
INSERT INTO public.help_faqs (section_id, question, answer, display_order)
SELECT id, q, a, o FROM s1, (VALUES
  ('¿Cómo me inscribo en una carrera?', E'1. Navega a la sección ''Carreras'' desde el menú principal.\n2. Selecciona la carrera que te interese.\n3. Haz clic en ''Inscribirme'' y elige la distancia/modalidad.\n4. Completa el formulario con tus datos personales.\n5. Realiza el pago si es necesario.\n6. Recibirás un email de confirmación con tu dorsal asignado.', 0),
  ('¿Necesito crear una cuenta para inscribirme?', E'No, puedes inscribirte como invitado sin crear cuenta: solo necesitas rellenar el formulario con tus datos y recibirás la confirmación por email.\n\nCrear una cuenta gratuita es opcional y te permite además:\n- Gestionar tus inscripciones desde tu perfil\n- Ver tu historial de carreras y resultados\n- Vincular inscripciones anteriores hechas con tu email', 1),
  ('¿Puedo modificar mis datos después de inscribirme?', 'Algunos datos pueden modificarse desde tu perfil antes de la carrera. Para cambios importantes (como la distancia), contacta directamente con el organizador de la carrera.', 2),
  ('¿Cómo cancelo mi inscripción?', E'Desde tu panel ''Mi Perfil'' puedes ver tus inscripciones activas. La política de cancelación y reembolso depende de cada organizador - consulta el reglamento de la carrera.', 3),
  ('¿Dónde veo mi dorsal asignado?', E'Tu número de dorsal aparece en el email de confirmación de la inscripción (y del pago, si la carrera es de pago).\n\nSi tienes cuenta, también lo verás en ''Mi Perfil'' > ''Mis Carreras''.', 4)
) AS f(q, a, o)
UNION ALL
SELECT id, q, a, o FROM s2, (VALUES
  ('¿Qué es la app de seguimiento GPS?', 'Es una aplicación web que permite a tus familiares y amigos seguir tu posición en tiempo real durante la carrera. Tu ubicación se actualiza cada pocos segundos en un mapa interactivo.', 0),
  ('¿Cómo activo el seguimiento GPS?', E'1. Accede a ''Tracking GPS'' desde el menú (debes estar logueado).\n2. Selecciona la carrera en la que estás inscrito.\n3. Pulsa ''Iniciar Seguimiento'' antes de empezar la carrera.\n4. Permite el acceso a tu ubicación cuando el navegador lo solicite.\n5. Mantén la pantalla activa o instala la app como PWA.', 1),
  ('¿Consume mucha batería?', E'El seguimiento GPS consume batería, pero la app incluye:\n- Modo de bajo consumo automático cuando la batería baja del 20%\n- Almacenamiento offline si pierdes conexión\n- Recomendamos llevar el móvil cargado al 100%', 2),
  ('¿Cómo pueden seguirme mis familiares?', E'Comparte el enlace de seguimiento en vivo de la carrera. Desde ahí pueden:\n- Ver todos los corredores en el mapa\n- Buscar tu dorsal o nombre\n- Ver tu posición, ritmo y estadísticas en tiempo real', 3),
  ('¿Qué pasa si pierdo la conexión durante la carrera?', 'La app guarda los puntos GPS localmente y los sincroniza automáticamente cuando recuperas conexión. No perderás ningún dato de tu recorrido.', 4),
  ('¿Puedo instalar la app en mi móvil?', E'Sí, es una Progressive Web App (PWA). Cuando accedas desde el móvil, verás la opción de ''Añadir a pantalla de inicio''. Esto te da acceso directo como una app nativa.', 5)
) AS f(q, a, o)
UNION ALL
SELECT id, q, a, o FROM s3, (VALUES
  ('¿Dónde veo los resultados de una carrera?', E'Los resultados se publican en la página de cada carrera, en la pestaña ''Resultados''. También puedes acceder desde ''Carreras'' > seleccionar carrera > ''Ver Resultados''.', 0),
  ('¿Cuándo se publican los resultados?', 'Los resultados provisionales suelen publicarse poco después de que finalice la carrera. Los resultados definitivos pueden tardar unas horas mientras el organizador verifica los tiempos.', 1),
  ('¿Qué información incluyen los resultados?', E'Dependiendo de la carrera, puedes ver:\n- Tiempo final (tiempo chip y tiempo pistola)\n- Posición general\n- Posición por categoría de edad\n- Posición por género\n- Tiempos parciales en cada punto de control\n- Ritmo promedio', 2),
  ('¿Puedo ver mis resultados históricos?', 'Sí, desde tu perfil puedes ver el historial de todas las carreras en las que has participado, con tus tiempos y posiciones.', 3),
  ('Creo que mi tiempo es incorrecto, ¿qué hago?', 'Contacta directamente con el organizador de la carrera a través de la página de contacto de la carrera o el email del organizador que aparece en los detalles de la carrera.', 4)
) AS f(q, a, o)
UNION ALL
SELECT id, q, a, o FROM s4, (VALUES
  ('¿Cómo contacto con el organizador de una carrera?', E'En la página de detalle de cada carrera encontrarás:\n- Email del organizador\n- Enlace a su web oficial (si tiene)\n- Información de contacto adicional', 0),
  ('¿Cómo contacto con el soporte de Camberas?', E'Para problemas técnicos con la plataforma (no relacionados con una carrera específica), puedes:\n- Usar el formulario de contacto en ''/contacto''\n- Escribir por WhatsApp\n- Usar el chat de soporte si está disponible', 1),
  ('¿El organizador no responde, qué hago?', 'Si tienes problemas para contactar con un organizador, escríbenos a través del formulario de contacto indicando la carrera y el problema. Intentaremos ayudarte a establecer comunicación.', 2)
) AS f(q, a, o);

-- Entrada en el menú de administración (grupo Contenido)
INSERT INTO public.menu_items (menu_type, title, icon, view_name, group_label, display_order, is_visible, requires_auth)
VALUES ('admin', 'Centro de Ayuda', 'LifeBuoy', 'help-content', '📁 Contenido', 40, true, true);
