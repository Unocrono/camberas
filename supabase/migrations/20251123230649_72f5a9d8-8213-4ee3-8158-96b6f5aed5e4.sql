-- Añadir políticas para que organizadores puedan gestionar archivos en todos los buckets

-- Políticas para race-photos
CREATE POLICY "Organizers can upload race photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'race-photos' AND has_role(auth.uid(), 'organizer'));

CREATE POLICY "Organizers can update race photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'race-photos' AND has_role(auth.uid(), 'organizer'));

CREATE POLICY "Organizers can delete race photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'race-photos' AND has_role(auth.uid(), 'organizer'));

-- Políticas para race-gpx
CREATE POLICY "Organizers can upload GPX files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'race-gpx' AND has_role(auth.uid(), 'organizer'));

CREATE POLICY "Organizers can update GPX files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'race-gpx' AND has_role(auth.uid(), 'organizer'));

CREATE POLICY "Organizers can delete GPX files"
ON storage.objects FOR DELETE
USING (bucket_id = 'race-gpx' AND has_role(auth.uid(), 'organizer'));