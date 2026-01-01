-- Add YouTube integration fields to race_checkpoints
ALTER TABLE public.race_checkpoints
ADD COLUMN youtube_video_id text,
ADD COLUMN youtube_video_start_time timestamptz,
ADD COLUMN youtube_seconds_before integer DEFAULT 5,
ADD COLUMN youtube_seconds_after integer DEFAULT 10,
ADD COLUMN youtube_error_text text DEFAULT 'Video no disponible para este momento';