-- =====================================================================
-- Plataforma Financeira — Fase 1: família, contas, categorias,
-- lançamentos, orçamento, regras de categorização, faturas e NFs do PJ.
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Família (household) e membros ----------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  cycle_start_day smallint not null default 8 check (cycle_start_day between 1 and 28),
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'membro' check (role in ('dono', 'membro')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index if not exists household_members_user_idx on public.household_members(user_id);

create or replace function public.is_member(hh uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members where household_id = hh and user_id = auth.uid());
$$;

-- ---------- Contas e cartões ----------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'pj')),
  name text not null,
  type text not null default 'conta' check (type in ('conta', 'cartao', 'dinheiro', 'investimento')),
  institution text,
  last4 text,
  owner_user_id uuid references auth.users(id) on delete set null,
  closing_day smallint,
  due_day smallint,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists accounts_card_uniq on public.accounts(household_id, institution, last4) where last4 is not null;

-- ---------- Categorias ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'pj')),
  kind text not null check (kind in ('receita', 'despesa', 'investimento', 'transferencia')),
  grp text not null,           -- Fixas, Variáveis, Extras, Adicionais, Receitas, Investimentos, Impostos...
  subgroup text not null default '', -- Habitação, Transporte, Alimentação...
  name text not null,
  sort integer not null default 0,
  excluded_from_totals boolean not null default false, -- ex.: reembolsos corporativos
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (household_id, scope, grp, subgroup, name)
);

-- ---------- Lotes de importação (faturas, extratos, planilhas) ----------
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  source text not null check (source in ('fatura_pdf', 'csv', 'ofx', 'planilha')),
  institution text,
  file_name text,
  due_date date,
  statement_total numeric(14,2),
  tx_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Lançamentos ----------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'pj')),
  date date not null,                 -- data da compra / do lançamento
  cycle text not null,                -- ciclo de competência 'AAAA-MM' (ex.: 08/11 a 07/12 = '2026-11')
  description text not null,
  merchant_key text,                  -- descrição normalizada, usada pelas regras
  amount numeric(14,2) not null,      -- positivo = valor do lançamento; negativo = estorno
  kind text not null default 'despesa' check (kind in ('receita', 'despesa', 'investimento', 'transferencia')),
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  member_user_id uuid references auth.users(id) on delete set null,
  installment_no smallint,
  installment_total smallint,
  bank_category text,
  source text not null default 'manual' check (source in ('manual', 'fatura', 'csv', 'ofx', 'planilha')),
  import_batch_id uuid references public.import_batches(id) on delete cascade,
  external_hash text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transactions_cycle_idx on public.transactions(household_id, scope, cycle);
create index if not exists transactions_category_idx on public.transactions(category_id);
create index if not exists transactions_merchant_idx on public.transactions(household_id, merchant_key);
create unique index if not exists transactions_hash_uniq on public.transactions(household_id, external_hash) where external_hash is not null;

-- ---------- Orçamento (valor planejado / limite por categoria e ciclo) ----------
create table if not exists public.budgets (
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  cycle text not null,
  planned numeric(14,2) not null default 0,
  primary key (category_id, cycle)
);

-- ---------- Regras aprendidas de categorização ----------
create table if not exists public.category_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  pattern text not null,              -- merchant_key (ou trecho) em maiúsculas, sem acentos
  match_type text not null default 'prefix' check (match_type in ('exact', 'prefix', 'contains')),
  category_id uuid not null references public.categories(id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'pj')),
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, pattern)
);

-- ---------- Notas fiscais emitidas pelo PJ ----------
create table if not exists public.pj_invoices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  month date not null,                -- primeiro dia do mês de competência
  number text,
  client text,
  total numeric(14,2) not null,
  salary_part numeric(14,2) not null default 0,
  commission_part numeric(14,2) not null default 0,
  other_part numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists pj_invoices_month_idx on public.pj_invoices(household_id, month);

-- ---------- Segurança (RLS): cada família só enxerga os próprios dados ----------
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.import_batches enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.category_rules enable row level security;
alter table public.pj_invoices enable row level security;

drop policy if exists households_select on public.households;
create policy households_select on public.households for select using (public.is_member(id));
drop policy if exists households_update on public.households;
create policy households_update on public.households for update using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists members_select on public.household_members;
create policy members_select on public.household_members for select using (public.is_member(household_id));
drop policy if exists members_update_self on public.household_members;
create policy members_update_self on public.household_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','import_batches','transactions','budgets','category_rules','pj_invoices'] loop
    execute format('drop policy if exists %1$s_all on public.%1$s', t);
    execute format('create policy %1$s_all on public.%1$s for all using (public.is_member(household_id)) with check (public.is_member(household_id))', t);
  end loop;
end $$;

-- ---------- Funções de criação/entrada na família ----------
create or replace function public.create_household(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hh uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.households(name) values (coalesce(nullif(trim(p_name), ''), 'Minha família')) returning id into hh;
  insert into public.household_members(household_id, user_id, display_name, role)
  values (hh, auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Eu'), 'dono');
  return hh;
end $$;

create or replace function public.join_household(p_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hh uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into hh from public.households where invite_code = upper(trim(p_code));
  if hh is null then raise exception 'Código de convite inválido'; end if;
  insert into public.household_members(household_id, user_id, display_name, role)
  values (hh, auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Membro'), 'membro')
  on conflict (household_id, user_id) do nothing;
  return hh;
end $$;

grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;

-- Atualiza updated_at
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch before update on public.transactions for each row execute function public.touch_updated_at();
