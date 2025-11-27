-- Create trigger to auto-create default registration fields when a distance is created
CREATE OR REPLACE FUNCTION public.auto_seed_registration_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the existing function to seed default fields for the race
  -- This will only insert if no system fields exist for this race
  PERFORM seed_default_registration_fields(NEW.race_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on race_distances table
DROP TRIGGER IF EXISTS trigger_auto_seed_registration_fields ON race_distances;
CREATE TRIGGER trigger_auto_seed_registration_fields
  AFTER INSERT ON race_distances
  FOR EACH ROW
  EXECUTE FUNCTION auto_seed_registration_fields();