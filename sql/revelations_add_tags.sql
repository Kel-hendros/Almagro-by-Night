-- Add tags column to revelations table
ALTER TABLE public.revelations ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- GIN index for efficient array search
CREATE INDEX IF NOT EXISTS idx_revelations_tags ON public.revelations USING gin (tags);
