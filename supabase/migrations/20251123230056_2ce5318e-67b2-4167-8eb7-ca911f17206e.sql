-- Crear bucket para imágenes de la aplicación
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-images', 'app-images', true);

-- Políticas para app-images
CREATE POLICY "Anyone can view app images"
ON storage.objects FOR SELECT
USING (bucket_id = 'app-images');

CREATE POLICY "Admins can upload app images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'app-images' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update app images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'app-images' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete app images"
ON storage.objects FOR DELETE
USING (bucket_id = 'app-images' AND has_role(auth.uid(), 'admin'));