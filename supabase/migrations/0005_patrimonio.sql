-- =====================================================================
-- ALVVO Finance — investimentos, objetivos, análise e dados de mercado.
-- Rode depois do 0004_acessos.sql.
-- =====================================================================

-- ---------- Investimentos (área "investimentos") ----------
create table if not exists public.inv_ops (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  date date not null,
  type text not null check (type in ('compra', 'venda')),
  ticker text not null,
  name text,
  cls text not null default 'acao' check (cls in ('acao', 'fii', 'etf', 'exterior', 'cripto')),
  qty numeric(20,8) not null check (qty > 0),
  price numeric(18,6) not null check (price >= 0),
  costs numeric(14,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists inv_ops_hh_idx on public.inv_ops(household_id, date);

create table if not exists public.inv_fixed (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  kind text not null default 'CDB',
  amount numeric(14,2) not null check (amount > 0),
  date date not null,
  index text not null check (index in ('cdi', 'ipca', 'pre', 'selic')),
  rate numeric(8,4) not null,
  maturity date,
  issuer text,
  redeemed_at date,
  created_at timestamptz not null default now()
);

create table if not exists public.inv_dividends (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  date date not null,
  ticker text not null,
  kind text not null default 'Dividendo',
  amount numeric(14,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.inv_settings (
  household_id uuid primary key references public.households(id) on delete cascade,
  targets jsonb not null default '{"acao":25,"fii":15,"etf":10,"exterior":15,"cripto":5,"rf":30}'::jsonb,
  manual_quotes jsonb not null default '{}'::jsonb
);

-- ---------- Objetivos (área "objetivos") ----------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null check (type in ('patrimonio', 'independencia', 'caixinha')),
  name text not null,
  data jsonb not null default '{}'::jsonb,  -- metas, prazos, aportes e premissas de cada tipo
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Análise (área "analise") ----------
create table if not exists public.watchlist (
  household_id uuid not null references public.households(id) on delete cascade,
  ticker text not null,
  buy numeric(18,4),
  sell numeric(18,4),
  note text,
  created_at timestamptz not null default now(),
  primary key (household_id, ticker)
);
create table if not exists public.chart_drawings (
  household_id uuid not null references public.households(id) on delete cascade,
  ticker text not null,
  drawings jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (household_id, ticker)
);
create table if not exists public.rf_offers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('cdb', 'lci', 'lca', 'cri', 'cra', 'deb-inc', 'deb')),
  index text not null check (index in ('cdi', 'cdi+', 'pre', 'ipca')),
  rate numeric(8,4) not null,
  maturity date,
  daily boolean not null default false,
  created_at timestamptz not null default now()
);

do $$
declare r record;
begin
  for r in select * from (values ('inv_ops', 'investimentos'), ('inv_fixed', 'investimentos'), ('inv_dividends', 'investimentos'), ('inv_settings', 'investimentos'),
    ('goals', 'objetivos'), ('watchlist', 'analise'), ('chart_drawings', 'analise'), ('rf_offers', 'analise')) as t(tbl, area)
  loop
    execute format('alter table public.%1$s enable row level security', r.tbl);
    execute format('drop policy if exists %1$s_select on public.%1$s', r.tbl);
    execute format('drop policy if exists %1$s_write on public.%1$s', r.tbl);
    execute format('create policy %1$s_select on public.%1$s for select using (public.can_area(household_id, %2$L, ''ver''))', r.tbl, r.area);
    execute format('create policy %1$s_write on public.%1$s for all using (public.can_area(household_id, %2$L, ''editar'')) with check (public.can_area(household_id, %2$L, ''editar''))', r.tbl, r.area);
  end loop;
end $$;

-- ---------- Dados de mercado (compartilhados; só o servidor grava) ----------
create table if not exists public.market_quotes (
  symbol text primary key,          -- formato Yahoo: PETR4.SA, AAPL, BTC-BRL
  name text,
  currency text,
  price numeric(18,6),
  prev_close numeric(18,6),
  market_time timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.market_history (
  symbol text not null,
  date date not null,
  open numeric(18,6), high numeric(18,6), low numeric(18,6), close numeric(18,6), volume bigint,
  primary key (symbol, date)
);
create table if not exists public.market_history_meta (
  symbol text primary key,
  first_date date,
  updated_at timestamptz not null default now()
);
create table if not exists public.market_news (
  id text primary key,
  symbol text not null,
  title text not null,
  url text not null,
  source text,
  published_at timestamptz,
  fetched_at timestamptz not null default now()
);
create index if not exists market_news_symbol_idx on public.market_news(symbol, published_at desc);
create table if not exists public.market_rf (
  id text primary key,              -- nome do título normalizado
  name text not null,
  index text not null check (index in ('selic', 'pre', 'ipca')),
  rate numeric(8,4) not null,
  maturity date not null,
  min_investment numeric(14,2),
  unit_price numeric(14,2),
  grp text not null,                -- pos, pre, ipca, renda, educa
  coupon boolean not null default false,
  ref_date date not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.market_macro (
  key text primary key,             -- selic, cdi, focus, copom
  value jsonb not null,
  ref_date date,
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['market_quotes', 'market_history', 'market_history_meta', 'market_news', 'market_rf', 'market_macro'] loop
    execute format('alter table public.%1$s enable row level security', t);
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (true)', t);
  end loop;
end $$;

-- ---------- Dados iniciais (taxas de 03/11/2026), substituídos na primeira atualização automática ----------
insert into public.market_rf(id, name, index, rate, maturity, min_investment, grp, coupon, ref_date) values
('tr36','Tesouro Reserva 2036','selic',0,'2036-01-01',1,'pos',false,'2026-11-03'),
('ts31','Tesouro Selic 2031','selic',0.1057,'2031-03-01',201.3,'pos',false,'2026-11-03'),
('tp29','Tesouro Prefixado 2029','pre',15.19,'2029-01-01',7.38,'pre',false,'2026-11-03'),
('tp32','Tesouro Prefixado 2032','pre',15.63,'2032-01-01',4.74,'pre',false,'2026-11-03'),
('tp37','Tesouro Prefixado c/ Juros Semestrais 2037','pre',15.5,'2037-01-01',7.7,'pre',true,'2026-11-03'),
('ti32','Tesouro IPCA+ 2032','ipca',8.03,'2032-08-15',30.62,'ipca',false,'2026-11-03'),
('ti37','Tesouro IPCA+ c/ Juros Semestrais 2037','ipca',7.91,'2037-05-15',42.96,'ipca',true,'2026-11-03'),
('ti40','Tesouro IPCA+ 2040','ipca',7.69,'2040-08-15',17.29,'ipca',false,'2026-11-03'),
('ti45','Tesouro IPCA+ c/ Juros Semestrais 2045','ipca',7.62,'2045-05-15',41.82,'ipca',true,'2026-11-03'),
('ti50','Tesouro IPCA+ 2050','ipca',7.44,'2050-08-15',8.75,'ipca',false,'2026-11-03'),
('ti60','Tesouro IPCA+ c/ Juros Semestrais 2060','ipca',7.57,'2060-08-15',39.64,'ipca',true,'2026-11-03'),
('ra30','Tesouro RendA+ 2030','ipca',7.72,'2049-12-15',19.74,'renda',false,'2026-11-03'),
('ra40','Tesouro RendA+ 2040','ipca',7.48,'2059-12-15',9.87,'renda',false,'2026-11-03'),
('ra50','Tesouro RendA+ 2050','ipca',7.42,'2069-12-15',4.9,'renda',false,'2026-11-03'),
('ed30','Tesouro Educa+ 2030','ipca',8.01,'2034-12-15',31.14,'educa',false,'2026-11-03'),
('ed35','Tesouro Educa+ 2035','ipca',7.88,'2039-12-15',21.51,'educa',false,'2026-11-03')
on conflict (id) do nothing;
insert into public.market_macro(key, value, ref_date, updated_at) values
  ('selic', '{"rate": 13.75}', '2026-11-03', '2026-11-03 13:00:00+00'),
  ('cdi', '{"rate": 13.65}', '2026-11-03', '2026-11-03 13:00:00+00'),
  ('focus', '{"ipca": {"2026": 5.19, "2027": 4.34}, "selic": {"2026": 13.50, "2027": 11.75}}', '2026-11-03', '2026-11-03 13:00:00+00')
on conflict (key) do nothing;

-- Fundamentos e preços-alvo informados pelo usuário no monitor (P/L, P/VP, DY, LPA, VPA, alvo de analistas)
alter table public.watchlist add column if not exists fund jsonb not null default '{}'::jsonb;
