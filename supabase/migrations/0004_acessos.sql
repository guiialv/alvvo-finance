-- =====================================================================
-- ALVVO Finance — membros e acessos.
-- Convite + aprovação do dono, papéis, permissão por área, escopo de
-- lançamentos ("todos" ou "só os próprios"), registro de atividades e
-- configuração de IA. Rode depois do 0003_insights.sql.
-- =====================================================================

-- ---------- Conta (household) ----------
alter table public.households add column if not exists template text not null default 'familia';
alter table public.households add column if not exists invite_expires_at timestamptz not null default now() + interval '7 days';
alter table public.households add column if not exists ai_mode text not null default 'nenhuma';
alter table public.households add column if not exists ai_included boolean not null default false; -- só o administrador da plataforma liga
alter table public.households drop constraint if exists households_ai_mode_check;
alter table public.households add constraint households_ai_mode_check check (ai_mode in ('nenhuma', 'incluida', 'chave'));

-- ai_included só muda pelo service role (painel da plataforma), nunca pelo app
create or replace function public.protect_household_flags() returns trigger language plpgsql as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role'
     and new.ai_included is distinct from old.ai_included then
    new.ai_included := old.ai_included;
  end if;
  if new.ai_mode = 'incluida' and not new.ai_included then new.ai_mode := 'nenhuma'; end if;
  return new;
end $$;
drop trigger if exists households_protect on public.households;
create trigger households_protect before update on public.households for each row execute function public.protect_household_flags();

-- ---------- Membros: status, papel, áreas, escopo ----------
alter table public.household_members add column if not exists status text not null default 'ativo';
alter table public.household_members add column if not exists areas jsonb not null default '{}'::jsonb;
alter table public.household_members add column if not exists tx_scope text not null default 'todos';
alter table public.household_members add column if not exists email text;
alter table public.household_members add column if not exists provider text;
alter table public.household_members add column if not exists request_message text;
alter table public.household_members add column if not exists approved_at timestamptz;
alter table public.household_members add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table public.household_members drop constraint if exists household_members_role_check;
alter table public.household_members add constraint household_members_role_check check (role in ('dono', 'admin', 'membro', 'leitura'));
alter table public.household_members drop constraint if exists household_members_status_check;
alter table public.household_members add constraint household_members_status_check check (status in ('pendente', 'ativo', 'suspenso'));
alter table public.household_members drop constraint if exists household_members_scope_check;
alter table public.household_members add constraint household_members_scope_check check (tx_scope in ('todos', 'proprios'));

-- Áreas padrão de cada papel
create or replace function public.role_areas(p_role text) returns jsonb language sql immutable as $$
  select case p_role
    when 'admin' then '{"visao-geral":"editar","insights":"editar","agenda":"editar","orcamento":"editar","lancamentos":"editar","faturas":"editar","parcelamentos":"editar","pj":"editar","investimentos":"editar","objetivos":"editar","analise":"editar"}'::jsonb
    when 'membro' then '{"visao-geral":"editar","insights":"editar","agenda":"editar","orcamento":"editar","lancamentos":"editar","faturas":"editar","parcelamentos":"editar","pj":"nada","investimentos":"nada","objetivos":"editar","analise":"nada"}'::jsonb
    else '{"visao-geral":"ver","insights":"ver","agenda":"ver","orcamento":"ver","lancamentos":"ver","faturas":"ver","parcelamentos":"ver","pj":"nada","investimentos":"ver","objetivos":"ver","analise":"ver"}'::jsonb
  end;
$$;

-- Membros que já existiam ficam ativos com as áreas do papel
update public.household_members set areas = public.role_areas(role) where areas = '{}'::jsonb and role <> 'dono';

-- Só membros ATIVOS enxergam os dados da conta
create or replace function public.is_member(hh uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members where household_id = hh and user_id = auth.uid() and status = 'ativo');
$$;

create or replace function public.is_admin(hh uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members where household_id = hh and user_id = auth.uid() and status = 'ativo' and role in ('dono', 'admin'));
$$;

/** Permissão na área: p_level 'ver' ou 'editar'. Dono e admin podem tudo. */
create or replace function public.can_area(hh uuid, p_area text, p_level text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hh and m.user_id = auth.uid() and m.status = 'ativo'
      and (m.role in ('dono', 'admin')
        or (p_level = 'ver' and coalesce(m.areas ->> p_area, 'nada') in ('ver', 'editar'))
        or (p_level = 'editar' and m.role <> 'leitura' and coalesce(m.areas ->> p_area, 'nada') = 'editar'))
  );
$$;

/** Membro com escopo "só os próprios" vê apenas lançamentos dele. */
create or replace function public.sees_tx(hh uuid, tx_member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hh and m.user_id = auth.uid() and m.status = 'ativo'
      and (m.role in ('dono', 'admin') or m.tx_scope = 'todos' or tx_member = auth.uid())
  );
$$;

grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.can_area(uuid, text, text) to authenticated;
grant execute on function public.sees_tx(uuid, uuid) to authenticated;

-- ---------- Políticas ----------
-- Membros: cada um vê a própria linha (inclusive pendente); ativos veem a conta; admins gerenciam
drop policy if exists members_select on public.household_members;
create policy members_select on public.household_members for select using (user_id = auth.uid() or public.is_member(household_id));
drop policy if exists members_update_self on public.household_members;
create policy members_update_self on public.household_members for update using (user_id = auth.uid() and status = 'ativo') with check (user_id = auth.uid());
drop policy if exists members_admin_update on public.household_members;
create policy members_admin_update on public.household_members for update using (public.is_admin(household_id) and role <> 'dono') with check (public.is_admin(household_id) and role <> 'dono');
drop policy if exists members_admin_delete on public.household_members;
create policy members_admin_delete on public.household_members for delete using ((public.is_admin(household_id) and role <> 'dono') or (user_id = auth.uid() and role <> 'dono'));

-- O próprio membro não pode se promover nem mudar as próprias áreas
create or replace function public.protect_member_self() returns trigger language plpgsql as $$
begin
  if new.user_id = auth.uid() and not public.is_admin(new.household_id) then
    new.role := old.role; new.status := old.status; new.areas := old.areas; new.tx_scope := old.tx_scope;
  end if;
  if old.role = 'dono' then new.role := 'dono'; new.status := 'ativo'; end if;
  return new;
end $$;
drop trigger if exists members_protect on public.household_members;
create trigger members_protect before update on public.household_members for each row execute function public.protect_member_self();

-- Conta: só admins alteram
drop policy if exists households_update on public.households;
create policy households_update on public.households for update using (public.is_admin(id)) with check (public.is_admin(id));

-- Lançamentos: PJ exige a área PJ; escopo "só os próprios"; editar exige permissão
drop policy if exists transactions_all on public.transactions;
drop policy if exists transactions_select on public.transactions;
drop policy if exists transactions_write on public.transactions;
create policy transactions_select on public.transactions for select using (
  public.is_member(household_id) and public.sees_tx(household_id, member_user_id)
  and (scope <> 'pj' or public.can_area(household_id, 'pj', 'ver')));
create policy transactions_write on public.transactions for all using (
  public.is_member(household_id) and public.sees_tx(household_id, member_user_id)
  and (public.can_area(household_id, 'lancamentos', 'editar') or public.can_area(household_id, 'faturas', 'editar') or public.can_area(household_id, 'agenda', 'editar'))
  and (scope <> 'pj' or public.can_area(household_id, 'pj', 'editar')))
  with check (public.is_member(household_id)
  and (public.can_area(household_id, 'lancamentos', 'editar') or public.can_area(household_id, 'faturas', 'editar') or public.can_area(household_id, 'agenda', 'editar'))
  and (scope <> 'pj' or public.can_area(household_id, 'pj', 'editar')));

-- Demais tabelas: ler = membro ativo; escrever = permissão de edição na área correspondente
do $$
declare r record;
begin
  for r in select * from (values
    ('accounts', 'faturas'), ('categories', 'lancamentos'), ('import_batches', 'faturas'), ('budgets', 'orcamento'),
    ('category_rules', 'lancamentos'), ('pj_invoices', 'pj'), ('agenda_items', 'agenda'), ('agenda_payments', 'agenda'),
    ('insight_dismissals', 'insights')) as t(tbl, area)
  loop
    execute format('drop policy if exists %1$s_all on public.%1$s', r.tbl);
    execute format('drop policy if exists %1$s_select on public.%1$s', r.tbl);
    execute format('drop policy if exists %1$s_write on public.%1$s', r.tbl);
    if r.area = 'pj' then
      execute format('create policy %1$s_select on public.%1$s for select using (public.can_area(household_id, %2$L, ''ver''))', r.tbl, r.area);
    else
      execute format('create policy %1$s_select on public.%1$s for select using (public.is_member(household_id))', r.tbl);
    end if;
    execute format('create policy %1$s_write on public.%1$s for all using (public.can_area(household_id, %2$L, ''editar'')) with check (public.can_area(household_id, %2$L, ''editar''))', r.tbl, r.area);
  end loop;
end $$;

-- ---------- Registro de atividades ----------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  actor uuid references auth.users(id) on delete set null,
  actor_name text,
  action text not null,
  at timestamptz not null default now()
);
create index if not exists audit_log_hh_idx on public.audit_log(household_id, at desc);
alter table public.audit_log enable row level security;
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select using (public.is_admin(household_id));
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert with check (public.is_member(household_id) and actor = auth.uid());

-- ---------- Segredo de IA (chave do usuário, criptografada pelo app) ----------
-- Sem políticas: só o servidor (service role) lê. O app grava via função.
create table if not exists public.household_secrets (
  household_id uuid primary key references public.households(id) on delete cascade,
  ai_key_enc text,
  ai_key_last4 text,
  updated_at timestamptz not null default now()
);
alter table public.household_secrets enable row level security;

create or replace function public.set_ai_key(hh uuid, p_enc text, p_last4 text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(hh) then raise exception 'Apenas o dono ou administradores'; end if;
  insert into public.household_secrets(household_id, ai_key_enc, ai_key_last4, updated_at) values (hh, p_enc, p_last4, now())
  on conflict (household_id) do update set ai_key_enc = excluded.ai_key_enc, ai_key_last4 = excluded.ai_key_last4, updated_at = now();
end $$;
create or replace function public.ai_key_last4(hh uuid) returns text language sql stable security definer set search_path = public as $$
  select case when public.is_admin(hh) then (select ai_key_last4 from public.household_secrets where household_id = hh) end;
$$;
grant execute on function public.set_ai_key(uuid, text, text) to authenticated;
grant execute on function public.ai_key_last4(uuid) to authenticated;

-- ---------- Criar conta, pedir entrada, aprovar ----------
create or replace function public.create_household(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hh uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.households(name) values (coalesce(nullif(trim(p_name), ''), 'Minha conta')) returning id into hh;
  insert into public.household_members(household_id, user_id, display_name, role, status, email, approved_at)
  values (hh, auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Eu'), 'dono', 'ativo', (select email from auth.users where id = auth.uid()), now());
  insert into public.audit_log(household_id, actor, actor_name, action) values (hh, auth.uid(), p_display_name, 'Conta criada');
  return hh;
end $$;

/** Pede entrada com código de convite. Fica PENDENTE até o dono ou um admin aprovar. */
create or replace function public.join_household(p_code text, p_display_name text, p_message text default null, p_provider text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare hh uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into hh from public.households where invite_code = upper(trim(p_code)) and invite_expires_at > now();
  if hh is null then raise exception 'Código de convite inválido ou vencido'; end if;
  insert into public.household_members(household_id, user_id, display_name, role, status, email, provider, request_message, areas)
  values (hh, auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Membro'), 'leitura', 'pendente', (select email from auth.users where id = auth.uid()), p_provider, nullif(trim(p_message), ''), public.role_areas('leitura'))
  on conflict (household_id, user_id) do nothing;
  return hh;
end $$;
drop function if exists public.join_household(text, text);

create or replace function public.approve_member(hh uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  if not public.is_admin(hh) then raise exception 'Apenas o dono ou administradores'; end if;
  if p_role not in ('admin', 'membro', 'leitura') then raise exception 'Papel inválido'; end if;
  update public.household_members set status = 'ativo', role = p_role, areas = public.role_areas(p_role), approved_at = now(), approved_by = auth.uid()
  where household_id = hh and user_id = p_user and status = 'pendente' returning display_name into nm;
  insert into public.audit_log(household_id, actor, actor_name, action)
  values (hh, auth.uid(), (select display_name from public.household_members where household_id = hh and user_id = auth.uid()), format('Aprovou %s como %s', nm, p_role));
end $$;

create or replace function public.regenerate_invite(hh uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_admin(hh) then raise exception 'Apenas o dono ou administradores'; end if;
  c := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  update public.households set invite_code = c, invite_expires_at = now() + interval '7 days' where id = hh;
  return c;
end $$;

grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text, text, text) to authenticated;
grant execute on function public.approve_member(uuid, uuid, text) to authenticated;
grant execute on function public.regenerate_invite(uuid) to authenticated;
