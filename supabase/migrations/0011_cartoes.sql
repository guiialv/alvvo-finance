-- Cartões identificados pelas faturas: nome, propósito, cor, limite e a chave da conta-cartão
alter table public.accounts
  add column if not exists brand text,
  add column if not exists color text,
  add column if not exists purpose text,
  add column if not exists statement_key text,
  add column if not exists credit_limit numeric(14,2),
  add column if not exists sort integer;
create unique index if not exists accounts_statement_key_uq on public.accounts(household_id, statement_key) where statement_key is not null;

-- Cria um cartão para cada conta-cartão das faturas já importadas e vincula faturas e lançamentos
with keys as (
  select b.id batch_id, b.household_id, coalesce(b.institution, 'Cartão') inst,
    substring(b.file_name from '_(\d{6,})_') skey,
    case when upper(b.file_name) like '%VISA%' then 'Visa' when upper(b.file_name) like '%MASTER%' then 'Mastercard' when upper(b.file_name) like '%ELO%' then 'Elo' when upper(b.file_name) like '%AMEX%' then 'Amex' end brand
  from public.import_batches b
  where b.doc_type = 'fatura' and b.account_id is null and b.file_name ~ '_(\d{6,})_'
), ins as (
  insert into public.accounts(household_id, scope, name, type, institution, brand, statement_key, closing_day, due_day)
  select distinct on (k.household_id, k.skey) k.household_id, 'pessoal', trim(k.inst || ' ' || coalesce(k.brand, '') || ' ••' || right(k.skey, 4)), 'cartao', k.inst, k.brand, k.skey, null, null
  from keys k
  on conflict do nothing
  returning id, household_id, statement_key
)
select 1;

update public.import_batches b set account_id = a.id
from public.accounts a
where b.account_id is null and b.doc_type = 'fatura' and a.household_id = b.household_id and a.statement_key = substring(b.file_name from '_(\d{6,})_');

update public.accounts a set due_day = extract(day from x.due)::int
from (select account_id, max(due_date) due from public.import_batches where account_id is not null and due_date is not null group by account_id) x
where a.id = x.account_id and a.due_day is null;

update public.transactions t set account_id = b.account_id
from public.import_batches b
where t.import_batch_id = b.id and t.account_id is null and b.doc_type = 'fatura' and b.account_id is not null;
