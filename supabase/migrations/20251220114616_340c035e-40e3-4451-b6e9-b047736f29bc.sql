-- Add checkpoint_id to split_times for reliable relationship
ALTER TABLE public.split_times 
ADD COLUMN checkpoint_id uuid REFERENCES public.race_checkpoints(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_split_times_checkpoint_id ON public.split_times(checkpoint_id);