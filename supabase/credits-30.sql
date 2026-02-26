create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;

  insert into public.credits (user_id, balance)
  values (new.id, 30)
  on conflict (user_id) do nothing;

  return new;
end;
$$ language plpgsql security definer;
