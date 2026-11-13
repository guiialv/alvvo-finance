-- Radar de notícias: feeds de fontes consolidadas (RSS/Atom, Banco Central, fatos relevantes CVM via Fundamentus)
create table if not exists public.market_feed (
  id text primary key,                 -- hash do link
  url text not null,
  title text not null,
  summary text,
  source text not null,                -- nome exibido (InfoMoney, Valor, Banco Central...)
  source_key text not null,
  kind text not null default 'noticia' check (kind in ('noticia', 'banco_central', 'fato_relevante', 'comunicado')),
  tickers text[] not null default '{}',
  published_at timestamptz,
  fetched_at timestamptz not null default now()
);
create index if not exists market_feed_pub_idx on public.market_feed(published_at desc);
alter table public.market_feed enable row level security;
drop policy if exists market_feed_read on public.market_feed;
create policy market_feed_read on public.market_feed for select to authenticated using (true);

-- Leitura com IA por família (cache): itens escolhidos e “por que importa”
create table if not exists public.news_briefs (
  household_id uuid not null references public.households(id) on delete cascade,
  slot text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (household_id, slot)
);
alter table public.news_briefs enable row level security;
drop policy if exists news_briefs_rw on public.news_briefs;
create policy news_briefs_rw on public.news_briefs for all using (public.is_member(household_id)) with check (public.is_member(household_id));
