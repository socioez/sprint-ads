ALTER TABLE public.usage_events ALTER COLUMN user_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.sprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  brief jsonb not null,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.ad_variants (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid references public.sprints(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  angle text,
  hook text,
  primary_text text,
  headline text,
  description text,
  cta text,
  creative text,
  image_url text,
  created_at timestamptz default now()
);

ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Sprints are self-access" ON public.sprints
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Sprints are self-insert" ON public.sprints
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Ads are self-access" ON public.ad_variants
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Ads are self-insert" ON public.ad_variants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Ads are self-update" ON public.ad_variants
  FOR UPDATE USING (auth.uid() = user_id);
