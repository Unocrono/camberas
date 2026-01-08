
-- Tabla principal de artículos del blog
CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT,
  category TEXT NOT NULL CHECK (category IN ('news', 'interview_organizer', 'interview_runner')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  
  -- YouTube
  youtube_video_id TEXT,
  youtube_timestamps JSONB DEFAULT '[]'::jsonb,
  
  -- SEO
  meta_title TEXT,
  meta_description TEXT,
  og_image_url TEXT,
  
  -- Relaciones opcionales
  race_id UUID REFERENCES races(id) ON DELETE SET NULL,
  interviewed_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Autoría
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Métricas
  view_count INTEGER DEFAULT 0,
  reading_time_minutes INTEGER DEFAULT 5
);

-- Tabla de etiquetas
CREATE TABLE blog_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Relación posts-tags (muchos a muchos)
CREATE TABLE blog_post_tags (
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- Índices para búsqueda y filtrado
CREATE INDEX idx_blog_posts_status ON blog_posts(status);
CREATE INDEX idx_blog_posts_category ON blog_posts(category);
CREATE INDEX idx_blog_posts_published_at ON blog_posts(published_at DESC);
CREATE INDEX idx_blog_posts_author ON blog_posts(author_id);
CREATE INDEX idx_blog_posts_race ON blog_posts(race_id);
CREATE INDEX idx_blog_tags_slug ON blog_tags(slug);

-- Trigger para updated_at
CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- Función para generar slug automático
CREATE OR REPLACE FUNCTION generate_blog_slug()
RETURNS TRIGGER AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Solo generar slug si está vacío o si el título cambió en UPDATE
  IF NEW.slug IS NOT NULL AND NEW.slug != '' THEN
    IF TG_OP = 'INSERT' THEN
      RETURN NEW;
    ELSIF TG_OP = 'UPDATE' AND OLD.title = NEW.title THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Generar slug base desde el título
  base_slug := lower(
    regexp_replace(
      regexp_replace(NEW.title, '[áàäâ]', 'a', 'gi'),
      '[éèëê]', 'e', 'gi'
    )
  );
  base_slug := regexp_replace(base_slug, '[íìïî]', 'i', 'gi');
  base_slug := regexp_replace(base_slug, '[óòöô]', 'o', 'gi');
  base_slug := regexp_replace(base_slug, '[úùüû]', 'u', 'gi');
  base_slug := regexp_replace(base_slug, '[ñ]', 'n', 'gi');
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'gi');
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  
  final_slug := base_slug;
  
  -- Verificar unicidad
  WHILE EXISTS (SELECT 1 FROM blog_posts WHERE slug = final_slug AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  NEW.slug := final_slug;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER generate_blog_post_slug
  BEFORE INSERT OR UPDATE ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION generate_blog_slug();

-- Función para calcular tiempo de lectura
CREATE OR REPLACE FUNCTION calculate_reading_time()
RETURNS TRIGGER AS $$
BEGIN
  -- Aproximadamente 200 palabras por minuto
  NEW.reading_time_minutes := GREATEST(1, CEIL(array_length(regexp_split_to_array(NEW.content, '\s+'), 1)::numeric / 200));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER calculate_blog_reading_time
  BEFORE INSERT OR UPDATE OF content ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION calculate_reading_time();

-- Habilitar RLS
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_post_tags ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para blog_posts
CREATE POLICY "Anyone can view published posts"
  ON blog_posts FOR SELECT
  USING (status = 'published');

CREATE POLICY "Authors can view own posts"
  ON blog_posts FOR SELECT
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Admins and editors can view all posts"
  ON blog_posts FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'editor')
  );

CREATE POLICY "Authorized users can create posts"
  ON blog_posts FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'editor') OR
    has_role(auth.uid(), 'organizer')
  );

CREATE POLICY "Admins and editors can update any post"
  ON blog_posts FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'editor')
  );

CREATE POLICY "Authors can update own posts"
  ON blog_posts FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Admins and editors can delete posts"
  ON blog_posts FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'editor')
  );

-- Políticas RLS para blog_tags
CREATE POLICY "Anyone can view tags"
  ON blog_tags FOR SELECT
  USING (true);

CREATE POLICY "Admins and editors can manage tags"
  ON blog_tags FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'editor')
  );

-- Políticas RLS para blog_post_tags
CREATE POLICY "Anyone can view post tags"
  ON blog_post_tags FOR SELECT
  USING (true);

CREATE POLICY "Authorized users can manage post tags"
  ON blog_post_tags FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'editor') OR
    EXISTS (
      SELECT 1 FROM blog_posts 
      WHERE id = post_id AND author_id = auth.uid()
    )
  );

-- Crear bucket para imágenes del blog
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-images', 'blog-images', true)
ON CONFLICT (id) DO NOTHING;

-- Política de storage para blog-images
CREATE POLICY "Anyone can view blog images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'blog-images');

CREATE POLICY "Authorized users can upload blog images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'blog-images' AND
    (
      has_role(auth.uid(), 'admin') OR 
      has_role(auth.uid(), 'editor') OR
      has_role(auth.uid(), 'organizer')
    )
  );

CREATE POLICY "Authorized users can update blog images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'blog-images' AND
    (
      has_role(auth.uid(), 'admin') OR 
      has_role(auth.uid(), 'editor')
    )
  );

CREATE POLICY "Authorized users can delete blog images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'blog-images' AND
    (
      has_role(auth.uid(), 'admin') OR 
      has_role(auth.uid(), 'editor')
    )
  );
