-- Universo de ativos (B3, EUA, moedas, commodities, índices) e carteiras de avaliação

create table if not exists public.market_universe (
  market text not null check (market in ('BR', 'US', 'FX', 'CMD', 'IDX')),
  symbol text not null,
  yahoo text not null,
  name text,
  kind text,
  sector text,
  industry text,
  currency text,
  price numeric(20,6),
  change_pct numeric(12,4),
  volume numeric(22,2),
  market_cap numeric(24,2),
  pe numeric(14,4), pb numeric(14,4), dy numeric(12,4), roe numeric(12,4), net_margin numeric(12,4),
  debt_equity numeric(14,4), ev_ebitda numeric(14,4), eps numeric(14,4),
  perf_1m numeric(12,4), perf_ytd numeric(12,4), perf_1y numeric(12,4), rsi numeric(8,3), rating numeric(8,4),
  logoid text,
  sort integer,
  updated_at timestamptz not null default now(),
  primary key (market, symbol)
);
create index if not exists market_universe_cap_idx on public.market_universe(market, market_cap desc nulls last);
create index if not exists market_universe_yahoo_idx on public.market_universe(yahoo);
alter table public.market_universe enable row level security;
drop policy if exists market_universe_read on public.market_universe;
create policy market_universe_read on public.market_universe for select to authenticated using (true);

create table if not exists public.eval_portfolios (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.eval_items (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.eval_portfolios(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  market text not null,
  symbol text not null,
  yahoo text not null,
  name text,
  currency text,
  added_price numeric(20,6),
  added_at timestamptz not null default now(),
  target_price numeric(20,6),
  stop_price numeric(20,6),
  rating text not null default 'observar' check (rating in ('comprar', 'acumular', 'manter', 'reduzir', 'vender', 'observar')),
  weight numeric(8,4),
  thesis text,
  updated_at timestamptz not null default now(),
  unique (portfolio_id, market, symbol)
);
create table if not exists public.eval_notes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.eval_items(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  author uuid references auth.users(id) on delete set null,
  author_name text,
  body text not null,
  price numeric(20,6),
  created_at timestamptz not null default now()
);
create index if not exists eval_items_hh_idx on public.eval_items(household_id, symbol);
create index if not exists eval_notes_item_idx on public.eval_notes(item_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['eval_portfolios', 'eval_items', 'eval_notes'] loop
    execute format('alter table public.%1$s enable row level security', t);
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_member(household_id))', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('create policy %1$s_write on public.%1$s for all using (public.can_area(household_id, ''analise'', ''editar'')) with check (public.can_area(household_id, ''analise'', ''editar''))', t);
  end loop;
end $$;
