-- Pesquisa inicial (anamnese): momento de vida, objetivos e interesses de cada pessoa
create table if not exists public.member_profiles (
  user_id uuid primary key default auth.uid(),
  household_id uuid references public.households(id) on delete set null,
  display_name text,
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.member_profiles enable row level security;
create policy member_profiles_read on public.member_profiles for select
  using (user_id = auth.uid() or public.is_platform_admin());
create policy member_profiles_insert on public.member_profiles for insert
  with check (user_id = auth.uid() and (household_id is null or public.is_member(household_id)));
create policy member_profiles_update on public.member_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (household_id is null or public.is_member(household_id)));
