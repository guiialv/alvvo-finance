-- Open Finance (Pluggy): conexões, contas vinculadas e referência externa das importações
create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  provider text not null default 'pluggy',
  item_id text not null unique,
  connector text,
  status text,
  status_detail text,
  consent_expires_at timestamptz,
  provider_updated_at timestamptz,
  last_sync_at timestamptz,
  last_sync_result jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.bank_links (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  connection_id uuid not null references public.bank_connections(id) on delete cascade,
  ext_account_id text not null unique,
  kind text not null check (kind in ('conta', 'cartao', 'outro')),
  name text,
  number text,
  institution text,
  balance numeric,
  credit_limit numeric,
  available_limit numeric,
  account_id uuid references public.accounts(id) on delete set null,
  enabled boolean not null default false,
  sync_from date,
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.bank_connections enable row level security;
alter table public.bank_links enable row level security;
drop policy if exists bank_connections_admin on public.bank_connections;
create policy bank_connections_admin on public.bank_connections for all to authenticated using (public.is_admin(household_id)) with check (public.is_admin(household_id));
drop policy if exists bank_links_admin on public.bank_links;
create policy bank_links_admin on public.bank_links for all to authenticated using (public.is_admin(household_id)) with check (public.is_admin(household_id));
create index if not exists bank_links_household on public.bank_links(household_id);
create index if not exists bank_connections_household on public.bank_connections(household_id);

alter table public.import_batches add column if not exists external_ref text;
alter table public.import_batches add column if not exists external_sig text;
create index if not exists import_batches_external_ref on public.import_batches(household_id, external_ref);
