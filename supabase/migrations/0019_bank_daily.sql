-- Saldo diário da conta no banco (Open Finance) e leitura na Visão geral para quem vê a Visão geral
create table if not exists public.bank_daily (
  link_id uuid not null references public.bank_links(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  date date not null,
  balance numeric not null,
  inflow numeric not null default 0,
  outflow numeric not null default 0,
  primary key (link_id, date)
);
alter table public.bank_daily enable row level security;
drop policy if exists bank_daily_read on public.bank_daily;
create policy bank_daily_read on public.bank_daily for select to authenticated using (public.can_area(household_id, 'visao-geral', 'ver'));
drop policy if exists bank_daily_admin on public.bank_daily;
create policy bank_daily_admin on public.bank_daily for all to authenticated using (public.is_admin(household_id)) with check (public.is_admin(household_id));
drop policy if exists bank_links_read on public.bank_links;
create policy bank_links_read on public.bank_links for select to authenticated using (public.can_area(household_id, 'visao-geral', 'ver'));
drop policy if exists bank_connections_read on public.bank_connections;
create policy bank_connections_read on public.bank_connections for select to authenticated using (public.can_area(household_id, 'visao-geral', 'ver'));
