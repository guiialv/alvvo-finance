-- Cartões: chaves de outros cartões juntados a este (mesma conta-cartão)
alter table public.accounts add column if not exists merged_keys text[] not null default '{}';
