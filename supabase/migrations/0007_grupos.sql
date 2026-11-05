-- =====================================================================
-- ALVVO Finance — grupos de orçamento editáveis (criar, renomear,
-- excluir, reordenar) separados por tipo: receita, investimento, despesa.
-- =====================================================================
create table if not exists public.category_groups (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  scope text not null default 'pessoal' check (scope in ('pessoal', 'pj')),
  kind text not null check (kind in ('receita', 'despesa', 'investimento', 'transferencia')),
  name text not null,
  hint text,
  color text,
  sort integer not null default 0,
  system boolean not null default false,       -- "A classificar": não pode ser excluído
  created_at timestamptz not null default now(),
  unique (household_id, scope, name)
);
alter table public.category_groups enable row level security;
drop policy if exists category_groups_select on public.category_groups;
create policy category_groups_select on public.category_groups for select using (public.is_member(household_id));
drop policy if exists category_groups_write on public.category_groups;
create policy category_groups_write on public.category_groups for all using (public.can_area(household_id, 'orcamento', 'editar')) with check (public.can_area(household_id, 'orcamento', 'editar'));

-- Grupos a partir das categorias que já existem (ordem e dicas da planilha)
insert into public.category_groups(household_id, scope, kind, name, hint, sort, system)
select c.household_id, c.scope, mode() within group (order by c.kind), c.grp,
  case c.grp when 'Fixas' then 'Mesmo valor todo mês' when 'Variáveis' then 'Todo mês, mas dá para reduzir'
    when 'Extras' then 'Extraordinárias — esteja preparado' when 'Adicionais' then 'Não precisam acontecer todo mês' end,
  coalesce(array_position(array['Receitas','Investimentos','Fixas','Variáveis','Extras','Adicionais','A classificar','Receitas PJ','Impostos','Custos PJ','Retiradas'], c.grp), 50) * 10,
  c.grp = 'A classificar'
from public.categories c
group by c.household_id, c.scope, c.grp
on conflict (household_id, scope, name) do nothing;

-- Exclui uma categoria levando os lançamentos, regras e orçamento para outra (ou para "A classificar")
create or replace function public.delete_category(p_id uuid, p_target uuid default null)
returns void language plpgsql security invoker set search_path = public as $$
declare hh uuid; tgt uuid;
begin
  select household_id into hh from public.categories where id = p_id;
  if hh is null then raise exception 'Categoria não encontrada'; end if;
  if not public.can_area(hh, 'orcamento', 'editar') then raise exception 'Sem permissão'; end if;
  tgt := coalesce(p_target, (select id from public.categories where household_id = hh and grp = 'A classificar' and id <> p_id limit 1));
  if tgt = p_id then raise exception 'Escolha outra categoria de destino'; end if;
  update public.transactions set category_id = tgt where category_id = p_id;
  update public.category_rules set category_id = tgt where category_id = p_id;
  update public.agenda_items set category_id = tgt where category_id = p_id;
  delete from public.budgets where category_id = p_id;
  delete from public.categories where id = p_id;
end $$;
revoke execute on function public.delete_category(uuid, uuid) from public, anon;
grant execute on function public.delete_category(uuid, uuid) to authenticated;

-- Categorias passam a ser editáveis também por quem edita o Orçamento
drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for all
  using (public.can_area(household_id, 'lancamentos', 'editar') or public.can_area(household_id, 'orcamento', 'editar'))
  with check (public.can_area(household_id, 'lancamentos', 'editar') or public.can_area(household_id, 'orcamento', 'editar'));
