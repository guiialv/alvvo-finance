-- Cartões: todos os finais já vistos nas faturas deste cartão (titular + adicionais).
-- Identifica a linha do cartão pela própria fatura, não pelo nome do arquivo.
alter table public.accounts add column if not exists known_last4 text[] not null default '{}';
alter table public.accounts add column if not exists product text;
