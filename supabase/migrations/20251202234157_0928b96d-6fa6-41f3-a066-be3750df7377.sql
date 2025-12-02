-- Drop the existing foreign key constraint
ALTER TABLE public.timer_assignments 
DROP CONSTRAINT IF EXISTS timer_assignments_checkpoint_id_fkey;

-- Add new foreign key to timing_points instead of race_checkpoints
ALTER TABLE public.timer_assignments
ADD CONSTRAINT timer_assignments_checkpoint_id_fkey 
FOREIGN KEY (checkpoint_id) REFERENCES public.timing_points(id) ON DELETE SET NULL;