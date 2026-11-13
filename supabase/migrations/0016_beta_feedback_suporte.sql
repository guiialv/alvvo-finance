-- Beta fechado de verdade, feedback dos testadores e acesso de suporte temporário (com consentimento da família)

-- 1) Administradores da plataforma (quem cuida do produto, não de uma família)
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
drop policy if exists platform_admins_self on public.platform_admins;
create policy platform_admins_self on public.platform_admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- 2) Códigos de acesso ao beta (necessários para criar uma família nova)
create table if not exists public.beta_codes (
  code text primary key,
  note text,
  uses_left int not null default 1 check (uses_left >= 0),
  used int not null default 0,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.beta_codes enable row level security;
drop policy if exists beta_codes_admin on public.beta_codes;
create policy beta_codes_admin on public.beta_codes for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

alter table public.households add column if not exists beta_code text;

-- Criar família agora exige um código válido (o próprio dono da plataforma não precisa)
create or replace function public.create_household_beta(p_code text, p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hh uuid; c text := upper(trim(coalesce(p_code, '')));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_platform_admin() then
    update public.beta_codes set uses_left = uses_left - 1, used = used + 1
      where code = c and uses_left > 0 and (expires_at is null or expires_at > now())
      returning code into c;
    if c is null or c = '' then raise exception 'Código de acesso inválido, vencido ou já usado'; end if;
  end if;
  insert into public.households(name, beta_code) values (coalesce(nullif(trim(p_name), ''), 'Minha conta'), nullif(c, '')) returning id into hh;
  insert into public.household_members(household_id, user_id, display_name, role, status, email, approved_at)
  values (hh, auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Eu'), 'dono', 'ativo', (select email from auth.users where id = auth.uid()), now());
  insert into public.audit_log(household_id, actor, actor_name, action) values (hh, auth.uid(), p_display_name, 'Conta criada');
  return hh;
end $$;
-- o caminho antigo, sem código, deixa de estar disponível para usuários
revoke execute on function public.create_household(text, text) from authenticated, anon, public;
grant execute on function public.create_household_beta(text, text, text) to authenticated;

-- 3) Feedback dos testadores
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  author_name text,
  kind text not null default 'ideia' check (kind in ('problema', 'ideia', 'elogio', 'duvida')),
  page text,
  message text not null check (length(message) between 2 and 4000),
  status text not null default 'novo' check (status in ('novo', 'visto', 'resolvido')),
  reply text,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert to authenticated with check (user_id = auth.uid() and (household_id is null or public.is_member(household_id)));
drop policy if exists feedback_read on public.feedback;
create policy feedback_read on public.feedback for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());
drop policy if exists feedback_admin on public.feedback;
create policy feedback_admin on public.feedback for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- 4) Acesso de suporte temporário: a família autoriza; vira um membro "Só leitura" que expira sozinho
alter table public.household_members add column if not exists expires_at timestamptz;
alter table public.household_members add column if not exists support boolean not null default false;

create or replace function public.is_member(hh uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members where household_id = hh and user_id = auth.uid() and status = 'ativo' and (expires_at is null or expires_at > now()));
$$;
create or replace function public.is_admin(hh uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members where household_id = hh and user_id = auth.uid() and status = 'ativo' and (expires_at is null or expires_at > now()) and role in ('dono', 'admin'));
$$;
create or replace function public.can_area(hh uuid, p_area text, p_level text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hh and m.user_id = auth.uid() and m.status = 'ativo' and (m.expires_at is null or m.expires_at > now())
      and (m.role in ('dono', 'admin')
        or (p_level = 'ver' and coalesce(m.areas ->> p_area, 'nada') in ('ver', 'editar'))
        or (p_level = 'editar' and m.role <> 'leitura' and coalesce(m.areas ->> p_area, 'nada') = 'editar'))
  );
$$;
create or replace function public.sees_tx(hh uuid, tx_member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hh and m.user_id = auth.uid() and m.status = 'ativo' and (m.expires_at is null or m.expires_at > now())
      and (m.role in ('dono', 'admin') or m.tx_scope = 'todos' or tx_member = auth.uid())
  );
$$;

create or replace function public.grant_support(hh uuid, p_days int default 7)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare until timestamptz := now() + make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30)); n int;
begin
  if not public.is_admin(hh) then raise exception 'Apenas o dono ou administradores'; end if;
  insert into public.household_members(household_id, user_id, display_name, role, status, email, approved_at, approved_by, areas, tx_scope, expires_at, support)
  select hh, pa.user_id, 'Suporte ALVVO', 'leitura', 'ativo', u.email, now(), auth.uid(), public.role_areas('leitura'), 'todos', until, true
  from public.platform_admins pa join auth.users u on u.id = pa.user_id
  where not exists (select 1 from public.household_members x where x.household_id = hh and x.user_id = pa.user_id and not x.support)
  on conflict (household_id, user_id) do update set expires_at = excluded.expires_at, status = 'ativo';
  get diagnostics n = row_count;
  insert into public.audit_log(household_id, actor, actor_name, action)
  values (hh, auth.uid(), (select display_name from public.household_members where household_id = hh and user_id = auth.uid()), format('Liberou acesso de suporte (só leitura) até %s', to_char(until at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')));
  return until;
end $$;

create or replace function public.revoke_support(hh uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(hh) then raise exception 'Apenas o dono ou administradores'; end if;
  delete from public.household_members where household_id = hh and support;
  insert into public.audit_log(household_id, actor, actor_name, action)
  values (hh, auth.uid(), (select display_name from public.household_members where household_id = hh and user_id = auth.uid()), 'Encerrou o acesso de suporte');
end $$;
grant execute on function public.grant_support(uuid, int) to authenticated;
grant execute on function public.revoke_support(uuid) to authenticated;

-- Visão do administrador da plataforma: só números agregados, nenhum dado financeiro
create or replace function public.platform_overview()
returns table(household_id uuid, name text, created_at timestamptz, beta_code text, members int, tx_count bigint, last_activity timestamptz, support_until timestamptz)
language sql stable security definer set search_path = public as $$
  select h.id, h.name, h.created_at, h.beta_code,
    (select count(*)::int from public.household_members m where m.household_id = h.id and m.status = 'ativo' and not m.support),
    (select count(*) from public.transactions t where t.household_id = h.id),
    (select max(t.created_at) from public.transactions t where t.household_id = h.id),
    (select max(m.expires_at) from public.household_members m where m.household_id = h.id and m.support and m.user_id = auth.uid() and m.expires_at > now())
  from public.households h
  where public.is_platform_admin()
  order by h.created_at desc;
$$;
grant execute on function public.platform_overview() to authenticated;

-- Administrador inicial da plataforma: inserido direto no banco (platform_admins), fora do repositório.
