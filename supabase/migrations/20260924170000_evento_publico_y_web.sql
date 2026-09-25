-- ============================================================
-- EVENTO PÚBLICO PARA LA PLANTILLA WEB MULTI-TENANT (24-sep-2026, tras 20260924160000)
--
-- Las webs de carrera (Gurriana, Loiu, La Garita, Guardia Civil…) se
-- generan con una plantilla que hoy lee un race.json del repo. Para que lean
-- de Camberas hace falta:
--
--  1) Que quepan carreras que no son trail/mtb: populares, de ruta y marchas.
--     El CHECK de races.race_type solo admitía 'trail' y 'mtb'.
--  2) Que un recorrido diga qué es (carrera, marcha, infantil…) y si es
--     competitivo: hoy se adivina por el nombre ("MARTXA").
--  3) Un sitio para el contenido que solo sirve a la web y Camberas no
--     modela (programa, recogida de dorsales, premios, camiseta, servicios,
--     sanitario, medioambiente, beneficiario, marca, documentos, fotos):
--     race_web, un JSONB por carrera con la forma de evento.schema.json.
--  4) Patrocinadores con logo y nivel: race_sponsors.
--  5) La RPC evento_publico(slug) que monta el evento entero va en la
--     migración siguiente (20260924180000), junto con dominios y TPV.
--
-- Solo datos públicos: carrera y recorridos con is_visible. Nada personal.
--
-- Editor SQL de Lovable: sentencias sueltas, cuerpos con $fn$ (no $$).
-- ============================================================

-- ── 1) Tipos de carrera ──────────────────────────────────────────────────
-- Se amplía el CHECK; no se renombra nada. Los selectores de la UI siguen
-- ofreciendo trail/mtb hasta que se toquen; los valores nuevos entran por
-- el panel cuando se amplíe, o por SQL.
ALTER TABLE public.races DROP CONSTRAINT IF EXISTS races_race_type_check;

ALTER TABLE public.races
  ADD CONSTRAINT races_race_type_check
  CHECK (race_type IN ('trail', 'mtb', 'both', 'popular', 'ruta', 'marcha', 'ciclismo', 'triatlon', 'natacion', 'otro'));

-- ── 2) Qué es cada recorrido ─────────────────────────────────────────────
ALTER TABLE public.race_distances
  ADD COLUMN IF NOT EXISTS kind           text    NOT NULL DEFAULT 'carrera',
  ADD COLUMN IF NOT EXISTS competitive    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS chip           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS elevation_loss integer,
  ADD COLUMN IF NOT EXISTS alt_max        integer,
  ADD COLUMN IF NOT EXISTS alt_min        integer;

ALTER TABLE public.race_distances DROP CONSTRAINT IF EXISTS race_distances_kind_check;

ALTER TABLE public.race_distances
  ADD CONSTRAINT race_distances_kind_check
  CHECK (kind IN ('carrera', 'marcha', 'infantil', 'relevos', 'km_vertical'));

COMMENT ON COLUMN public.race_distances.kind IS
  'Tipo de recorrido: carrera | marcha (andar, no competitiva) | infantil | relevos | km_vertical.';
COMMENT ON COLUMN public.race_distances.competitive IS
  'false = no hay clasificación oficial (marchas, infantiles no clasificatorias).';
COMMENT ON COLUMN public.race_distances.chip IS
  'false = sin dorsal-chip (marchas familiares, txikis).';

-- Marchas ya cargadas: las que se llaman "marcha/martxa/andar/caminata"
-- pasan a kind='marcha' y no competitivas. Solo afecta a las que no se han
-- tocado (siguen con el valor por defecto).
UPDATE public.race_distances
   SET kind = 'marcha', competitive = false
 WHERE kind = 'carrera'
   AND name ~* '(marcha|martxa|andar|ibili|caminata|senderis)';

-- ── 3) Contenido de la web por carrera ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.race_web (
  race_id    uuid PRIMARY KEY REFERENCES public.races(id) ON DELETE CASCADE,
  contenido  jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contenido) = 'object'),
  plantilla  text  NOT NULL DEFAULT 'gurriana' CHECK (plantilla IN ('gurriana')),
  tema       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(tema) = 'object'),
  activa     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.race_web.plantilla IS 'Plantilla de la web propia. La lista del CHECK es el registro de plantillas del cliente (src/plantillas/registro.ts).';
COMMENT ON COLUMN public.race_web.tema IS 'Libro de diseno de la plantilla (tokens: colores, fuentes, radio, hero, cinta, secciones). JSON validado por el cliente; lo invalido se ignora clave a clave.';
COMMENT ON COLUMN public.race_web.activa IS 'true: camberas.com/{slug} sirve la plantilla en vez de la ficha clasica. El dominio propio la sirve siempre.';
COMMENT ON TABLE public.race_web IS
  'Secciones de la web de la carrera que Camberas no modela en tablas. Claves con la forma de evento.schema.json: '
  'subtitulo, descripcion, lugar{zona,municipio,provincia,municipios[]}, organizador{nombre,web,telefono}, beneficiario, '
  'incluye[], nota, programa[], dorsales, premios[], entregaPremios, servicios[], camiseta, sanitario, medioAmbiente, '
  'infoPractica{comoLlegar,parking,alojamiento,espectadores,transporte}, clasificaciones{url,anteriores[]}, fotos, '
  'documentos[], imagenes{}, marca{}, seo{}, contacto{}. El resto lo aporta evento_publico() desde las tablas.';

ALTER TABLE public.race_web ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "race_web: lectura pública de carreras visibles" ON public.race_web;
CREATE POLICY "race_web: lectura pública de carreras visibles"
  ON public.race_web FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.races r
                  WHERE r.id = race_web.race_id
                    AND (r.is_visible = true OR r.organizer_id = auth.uid()))
         OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "race_web: organizador o admin" ON public.race_web;
CREATE POLICY "race_web: organizador o admin"
  ON public.race_web FOR ALL
  TO authenticated
  USING (public.puede_gestionar_carrera(race_id))
  WITH CHECK (public.puede_gestionar_carrera(race_id));

DROP TRIGGER IF EXISTS update_race_web_updated_at ON public.race_web;
CREATE TRIGGER update_race_web_updated_at
  BEFORE UPDATE ON public.race_web
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 4) Patrocinadores ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.race_sponsors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id       uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  name          text NOT NULL,
  logo_url      text,
  website       text,
  level         text NOT NULL DEFAULT 'colaborador'
                CHECK (level IN ('organiza', 'principal', 'institucional', 'beneficiario', 'colaborador')),
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_race_sponsors_race_id ON public.race_sponsors(race_id, display_order);

ALTER TABLE public.race_sponsors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "race_sponsors: lectura pública de carreras visibles" ON public.race_sponsors;
CREATE POLICY "race_sponsors: lectura pública de carreras visibles"
  ON public.race_sponsors FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.races r
                  WHERE r.id = race_sponsors.race_id
                    AND (r.is_visible = true OR r.organizer_id = auth.uid()))
         OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "race_sponsors: organizador o admin" ON public.race_sponsors;
CREATE POLICY "race_sponsors: organizador o admin"
  ON public.race_sponsors FOR ALL
  TO authenticated
  USING (public.puede_gestionar_carrera(race_id))
  WITH CHECK (public.puede_gestionar_carrera(race_id));

DROP TRIGGER IF EXISTS update_race_sponsors_updated_at ON public.race_sponsors;
CREATE TRIGGER update_race_sponsors_updated_at
  BEFORE UPDATE ON public.race_sponsors
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 5) evento_publico(slug) ──────────────────────────────────────────────
-- Se define en 20260924180000_web_propia_dominios_y_tpv.sql, porque necesita
-- race_domains y race_tpv (dominio y TPV propio del organizador).

-- ── 6) Comprobaciones (ejecutar tras aplicar) ────────────────────────────
-- Permisos de las funciones vecinas (deben seguir abiertas a anon) y RLS
-- activo en las tablas nuevas.
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('widget_carrera', 'plazas_libres');

SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('race_web', 'race_sponsors');

-- Datos: Loiu debe tener Trail como carrera y Martxa como marcha
SELECT name, kind, competitive, chip FROM public.race_distances
WHERE race_id = (SELECT id FROM public.races WHERE slug = 'loiu-500-trail-2026')
ORDER BY display_order NULLS LAST, distance_km;
