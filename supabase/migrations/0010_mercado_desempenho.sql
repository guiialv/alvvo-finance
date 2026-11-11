-- Colunas de desempenho, técnica e liquidez para a tabela de mercado
alter table public.market_universe
  add column if not exists perf_w numeric(12,4),
  add column if not exists perf_3m numeric(12,4),
  add column if not exists perf_6m numeric(12,4),
  add column if not exists perf_3y numeric(12,4),
  add column if not exists perf_5y numeric(12,4),
  add column if not exists volatility_m numeric(12,4),
  add column if not exists sma50 numeric(20,6),
  add column if not exists sma200 numeric(20,6),
  add column if not exists rec_ma numeric(8,4),
  add column if not exists rec_osc numeric(8,4),
  add column if not exists adx numeric(8,3),
  add column if not exists beta numeric(10,4),
  add column if not exists payout numeric(12,4),
  add column if not exists avg_volume numeric(22,2);
alter table public.market_universe
  add column if not exists liquidity numeric generated always as (price * coalesce(avg_volume, volume)) stored;
create index if not exists market_universe_liq_idx on public.market_universe(market, liquidity desc nulls last);
