-- =====================================================================
-- Fase 1.1: agenda financeira (cartões, contas, receitas) e detalhes
-- de itens de fatura (cidade, internacional, câmbio).
-- Rode depois do 0001_base.sql.
-- =====================================================================

-- Detalhes extras dos itens importados
alter table public.transactions add column if not exists city text;
alter table public.transactions add column if not exists international boolean not null default false;
alter table public.transactions add column if not exists foreign_amount numeric(14,2);
alter table public.transactions add column if not exists foreign_currency text;
alter table public.transactions add column if not exists fx_rate numeric(10,4);
alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions add constraint transactions_source_check
  check (source in ('manual', 'fatura', 'csv', 'ofx', 'planilha', 'agenda'));

alter table public.import_batches add column if not exists future_total numeric(14,2);

-- Itens da agenda: cartões (fechamento + vencimento), contas a pagar e receitas
create table if not exists public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null check (type in ('cartao', 'conta', 'receita')),
  name text not null,
  closing_day smallint check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  amount numeric(14,2),
  category_id uuid references public.categories(id) on delete set null,
  card_last4 text,
  member_user_id uuid references auth.users(id) on delete set null,
  notes text,
  active boolean not null default true,
  starts_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists agenda_items_hh_idx on public.agenda_items(household_id);

-- Ocorrências marcadas como pagas/recebidas (uma por item, mês e evento)
create table if not exists public.agenda_payments (
  household_id uuid not null references public.households(id) on delete cascade,
  item_id uuid not null references public.agenda_items(id) on delete cascade,
  month text not null,                 -- 'AAAA-MM'
  event text not null check (event in ('vencimento', 'conta', 'receita')),
  transaction_id uuid references public.transactions(id) on delete set null,
  paid_at timestamptz not null default now(),
  primary key (item_id, month, event)
);

alter table public.agenda_items enable row level security;
alter table public.agenda_payments enable row level security;
drop policy if exists agenda_items_all on public.agenda_items;
create policy agenda_items_all on public.agenda_items for all using (public.is_member(household_id)) with check (public.is_member(household_id));
drop policy if exists agenda_payments_all on public.agenda_payments;
create policy agenda_payments_all on public.agenda_payments for all using (public.is_member(household_id)) with check (public.is_member(household_id));
