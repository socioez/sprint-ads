-- Auth profile
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- Credits balance
create table if not exists public.credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz default now()
);

-- Usage tracking
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null,
  credits_used integer not null default 0,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Revenue tracking (placeholder for Stripe later)
create table if not exists public.revenue_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  provider text default 'manual',
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Initialize profile + credits on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;

  insert into public.credits (user_id, balance)
  values (new.id, 120)
  on conflict (user_id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.credits enable row level security;
alter table public.usage_events enable row level security;
alter table public.revenue_events enable row level security;

create policy "Profiles are self-access" on public.profiles
  for select using (auth.uid() = id);

create policy "Profiles are self-update" on public.profiles
  for update using (auth.uid() = id);

create policy "Credits are self-access" on public.credits
  for select using (auth.uid() = user_id);

create policy "Credits are self-update" on public.credits
  for update using (auth.uid() = user_id);

create policy "Usage is self-insert" on public.usage_events
  for insert with check (auth.uid() = user_id);

create policy "Usage is self-select" on public.usage_events
  for select using (auth.uid() = user_id);

create policy "Revenue is self-select" on public.revenue_events
  for select using (auth.uid() = user_id);
