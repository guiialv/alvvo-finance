-- Investimentos ligados a objetivos: título de renda fixa (goal_id) e ativo de renda variável (por ticker)
alter table public.inv_fixed add column if not exists goal_id uuid references public.goals(id) on delete set null;
create table if not exists public.inv_goal_links (
  household_id uuid not null references public.households(id) on delete cascade,
  ticker text not null,
  goal_id uuid not null references public.goals(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (household_id, ticker)
);
alter table public.inv_goal_links enable row level security;
drop policy if exists inv_goal_links_select on public.inv_goal_links;
create policy inv_goal_links_select on public.inv_goal_links for select using (public.can_area(household_id, 'investimentos', 'ver') or public.can_area(household_id, 'objetivos', 'ver'));
drop policy if exists inv_goal_links_write on public.inv_goal_links;
create policy inv_goal_links_write on public.inv_goal_links for all using (public.can_area(household_id, 'investimentos', 'editar')) with check (public.can_area(household_id, 'investimentos', 'editar'));
