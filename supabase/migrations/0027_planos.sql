-- Planos Free, Premium e Família (por família). Testers com código: tudo liberado até o fim do beta.
alter table public.households
  add column if not exists plan text not null default 'free' check (plan in ('free', 'premium', 'familia')),
  add column if not exists plan_until timestamptz,
  add column if not exists plan_origin text check (plan_origin in ('codigo', 'assinatura', 'cortesia'));

-- Quem entrou com código de beta (e as famílias do administrador) já ficam com tudo liberado
update public.households set plan = 'familia', plan_origin = 'codigo' where beta_code is not null and plan = 'free';
update public.households h set plan = 'familia', plan_origin = 'cortesia'
  where plan = 'free' and exists (select 1 from public.household_members m join public.platform_admins pa on pa.user_id = m.user_id where m.household_id = h.id and m.role = 'dono');

-- Só o servidor ou o administrador da plataforma mudam o plano (donos e administradores da família, não)
create or replace function public.protect_household_plan() returns trigger language plpgsql set search_path to 'public' as $$
begin
  if (new.plan, new.plan_until, new.plan_origin) is distinct from (old.plan, old.plan_until, old.plan_origin)
     and coalesce(auth.role(), '') <> 'service_role' and not public.is_platform_admin() then
    new.plan := old.plan; new.plan_until := old.plan_until; new.plan_origin := old.plan_origin;
  end if;
  return new;
end $$;
drop trigger if exists households_plan_protect on public.households;
create trigger households_plan_protect before update on public.households for each row execute function public.protect_household_plan();

-- Novas famílias criadas com código de beta já nascem com tudo liberado
create or replace function public.create_household_beta(p_code text, p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare hh uuid; c text := upper(trim(coalesce(p_code, ''))); adm boolean := public.is_platform_admin();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not adm then
    update public.beta_codes set uses_left = uses_left - 1, used = used + 1
      where code = c and uses_left > 0 and (expires_at is null or expires_at > now())
      returning code into c;
    if c is null or c = '' then raise exception 'Código de acesso inválido, vencido ou já usado'; end if;
  end if;
  insert into public.households(name, beta_code, plan, plan_origin)
  values (coalesce(nullif(trim(p_name), ''), 'Minha conta'), nullif(c, ''), 'familia', case when adm and nullif(c, '') is null then 'cortesia' else 'codigo' end)
  returning id into hh;
  insert into public.household_members(household_id, user_id, display_name, role, status, email, approved_at)
  values (hh, auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Eu'), 'dono', 'ativo', (select email from auth.users where id = auth.uid()), now());
  insert into public.audit_log(household_id, actor, actor_name, action) values (hh, auth.uid(), p_display_name, 'Conta criada');
  return hh;
end $$;
revoke execute on function public.create_household_beta(text, text, text) from public, anon;
grant execute on function public.create_household_beta(text, text, text) to authenticated, service_role;

-- Código de acesso para uma família já existente (ex.: quem estiver no Free)
create or replace function public.resgatar_codigo_plano(hh uuid, p_code text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c text := upper(trim(coalesce(p_code, '')));
begin
  if not public.is_admin(hh) then return jsonb_build_object('ok', false, 'erro', 'Apenas o dono ou administradores da conta podem usar um código.'); end if;
  if exists (select 1 from public.households where id = hh and plan <> 'free' and (plan_until is null or plan_until > now())) then
    return jsonb_build_object('ok', true, 'ja_tinha', true);
  end if;
  update public.beta_codes set uses_left = uses_left - 1, used = used + 1
    where code = c and uses_left > 0 and (expires_at is null or expires_at > now()) returning code into c;
  if c is null then return jsonb_build_object('ok', false, 'erro', 'Código inválido, vencido ou já utilizado.'); end if;
  update public.households set plan = 'familia', plan_origin = 'codigo', plan_until = null, beta_code = coalesce(beta_code, c) where id = hh;
  insert into public.audit_log(household_id, actor, actor_name, action)
  values (hh, auth.uid(), (select display_name from public.household_members where household_id = hh and user_id = auth.uid()), format('Liberou o plano Família com o código %s', c));
  return jsonb_build_object('ok', true, 'plano', 'familia');
end $$;
revoke execute on function public.resgatar_codigo_plano(uuid, text) from public, anon;
grant execute on function public.resgatar_codigo_plano(uuid, text) to authenticated, service_role;

-- "Quero assinar": interesse registrado para avisar no lançamento
create table if not exists public.plan_interest (
  user_id uuid not null default auth.uid(),
  household_id uuid not null references public.households(id) on delete cascade,
  plano text not null check (plano in ('premium', 'familia')),
  ciclo text not null default 'anual' check (ciclo in ('mensal', 'anual')),
  created_at timestamptz not null default now(),
  primary key (user_id, household_id)
);
alter table public.plan_interest enable row level security;
create policy plan_interest_read on public.plan_interest for select using (user_id = auth.uid() or public.is_platform_admin());
create policy plan_interest_write on public.plan_interest for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(household_id));
