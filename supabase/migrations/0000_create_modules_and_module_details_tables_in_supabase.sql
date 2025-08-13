-- Create modules table
CREATE TABLE public.modules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  pnom NUMERIC,
  vmp NUMERIC,
  imp NUMERIC,
  voc NUMERIC,
  isc NUMERIC,
  ns INTEGER,
  np INTEGER,
  area NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (manufacturer, model)
);

-- Enable RLS
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

-- Public access policy to match existing tables
CREATE POLICY "Public access" ON public.modules FOR ALL USING (true) WITH CHECK (true);

-- Create module_details table to store parsed data and raw file text
CREATE TABLE public.module_details (
  module_id UUID PRIMARY KEY REFERENCES public.modules(id) ON DELETE CASCADE,
  parsed JSONB,
  pan_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.module_details ENABLE ROW LEVEL SECURITY;

-- Public access policy to match existing tables
CREATE POLICY "Public access" ON public.module_details FOR ALL USING (true) WITH CHECK (true);