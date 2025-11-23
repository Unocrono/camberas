-- Create storage bucket for race images
INSERT INTO storage.buckets (id, name, public)
VALUES ('race-images', 'race-images', true);

-- Create RLS policies for race-images bucket
CREATE POLICY "Anyone can view race images"
ON storage.objects FOR SELECT
USING (bucket_id = 'race-images');

CREATE POLICY "Admins can upload race images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'race-images' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Organizers can upload race images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'race-images' AND
  has_role(auth.uid(), 'organizer'::app_role)
);

CREATE POLICY "Admins can update race images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'race-images' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Organizers can update race images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'race-images' AND
  has_role(auth.uid(), 'organizer'::app_role)
);

CREATE POLICY "Admins can delete race images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'race-images' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Organizers can delete race images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'race-images' AND
  has_role(auth.uid(), 'organizer'::app_role)
);