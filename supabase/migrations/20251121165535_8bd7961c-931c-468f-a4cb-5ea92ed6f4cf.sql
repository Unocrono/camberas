-- Add GPX file URL column to races table
ALTER TABLE public.races 
ADD COLUMN gpx_file_url text;

-- Create storage bucket for GPX files
INSERT INTO storage.buckets (id, name, public)
VALUES ('race-gpx', 'race-gpx', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for GPX bucket
CREATE POLICY "Anyone can view GPX files"
ON storage.objects FOR SELECT
USING (bucket_id = 'race-gpx');

CREATE POLICY "Admins can upload GPX files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'race-gpx' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update GPX files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'race-gpx' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete GPX files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'race-gpx' 
  AND has_role(auth.uid(), 'admin'::app_role)
);