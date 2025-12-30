-- Add a more permissive policy for authenticated users to manage overlay_config
-- This allows anyone authenticated to manage overlay configs for development/testing
-- In production, this should be restricted to admins/organizers only

-- Drop all existing policies first
DROP POLICY IF EXISTS "Admins can manage all overlay config" ON public.overlay_config;
DROP POLICY IF EXISTS "Organizers can manage their race overlay config" ON public.overlay_config;
DROP POLICY IF EXISTS "Anyone can view overlay config" ON public.overlay_config;

-- Recreate with more permissive rules
-- SELECT: Anyone can read (for overlays to work publicly)
CREATE POLICY "Anyone can view overlay config" 
ON public.overlay_config 
FOR SELECT 
USING (true);

-- INSERT: Any authenticated user can create
CREATE POLICY "Authenticated users can insert overlay config" 
ON public.overlay_config 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- UPDATE: Any authenticated user can update
CREATE POLICY "Authenticated users can update overlay config" 
ON public.overlay_config 
FOR UPDATE 
TO authenticated
USING (true)
WITH CHECK (true);

-- DELETE: Only admins can delete
CREATE POLICY "Admins can delete overlay config" 
ON public.overlay_config 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));