-- "Posso comprar?": avaliações de compra (reavaliar amanhã, descartar, virar objetivo)
create table if not exists public.purchase_checks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  item text not null,
  amount numeric not null,
  params jsonb not null default '{}'::jsonb,
  verdict text,
  status text not null check (status in ('reavaliar', 'comprar', 'descartada', 'objetivo')),
  remind_on date,
  goal_id uuid references public.goals(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists purchase_checks_hh on public.purchase_checks(household_id, created_at desc);
alter table public.purchase_checks enable row level security;
create policy purchase_checks_read on public.purchase_checks for select using (public.is_member(household_id));
create policy purchase_checks_write on public.purchase_checks for all
  using (public.is_member(household_id) and (user_id = auth.uid() or public.is_admin(household_id)))
  with check (public.is_member(household_id) and user_id = auth.uid());

-- Fotos dos objetivos: pasta por família (<household_id>/<goal_id>/arquivo.jpg)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('goals', 'goals', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create or replace function public.goal_photo_hh(p_name text) returns uuid language sql stable set search_path = public, storage as $$
  select case when (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[1])::uuid end;
$$;
create policy goals_photos_read on storage.objects for select to authenticated
  using (case when bucket_id = 'goals' then coalesce(public.is_member(public.goal_photo_hh(name)), false) else false end);
create policy goals_photos_insert on storage.objects for insert to authenticated
  with check (case when bucket_id = 'goals' then coalesce(public.can_area(public.goal_photo_hh(name), 'objetivos', 'editar'), false) else false end);
create policy goals_photos_delete on storage.objects for delete to authenticated
  using (case when bucket_id = 'goals' then coalesce(public.can_area(public.goal_photo_hh(name), 'objetivos', 'editar'), false) else false end);
