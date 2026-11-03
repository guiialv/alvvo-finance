-- Insights dispensados pelo usuário (um insight novo, com outra chave, volta a aparecer)
create table if not exists public.insight_dismissals (
  household_id uuid not null references public.households(id) on delete cascade,
  key text not null,
  dismissed_by uuid references auth.users(id) on delete set null,
  dismissed_at timestamptz not null default now(),
  primary key (household_id, key)
);
alter table public.insight_dismissals enable row level security;
drop policy if exists insight_dismissals_all on public.insight_dismissals;
create policy insight_dismissals_all on public.insight_dismissals for all using (public.is_member(household_id)) with check (public.is_member(household_id));
