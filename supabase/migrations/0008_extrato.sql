-- Extratos bancários e conciliação com faturas de cartão

alter table public.import_batches drop constraint if exists import_batches_source_check;
alter table public.import_batches add constraint import_batches_source_check check (source in ('fatura_pdf', 'extrato_pdf', 'csv', 'ofx', 'planilha'));
alter table public.import_batches add column if not exists doc_type text not null default 'fatura' check (doc_type in ('fatura', 'extrato'));
alter table public.import_batches add column if not exists account_id uuid references public.accounts(id) on delete set null;

alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions add constraint transactions_source_check check (source in ('manual', 'fatura', 'extrato', 'csv', 'ofx', 'planilha', 'agenda'));
-- Sentido do dinheiro na conta (extratos): entrada ou saída
alter table public.transactions add column if not exists flow text check (flow in ('entrada', 'saida'));
-- Pagamento de fatura (no extrato) conferido com a fatura importada
alter table public.transactions add column if not exists reconciled_batch_id uuid references public.import_batches(id) on delete set null;
create index if not exists transactions_reconciled_idx on public.transactions(reconciled_batch_id) where reconciled_batch_id is not null;

-- Grupo e categorias de movimentações que não são receita nem gasto
insert into public.category_groups(household_id, scope, kind, name, hint, sort, system)
select h.id, 'pessoal', 'transferencia', 'Transferências', 'Pagamento de fatura, PIX no crédito, empréstimos e transferências entre suas contas — não entram nos totais', 65, true
from public.households h
on conflict (household_id, scope, name) do nothing;

insert into public.categories(household_id, scope, kind, grp, subgroup, name, sort)
select h.id, 'pessoal', 'transferencia', 'Transferências', '', n.name, n.sort
from public.households h cross join (values ('Pagamento de fatura', 1), ('PIX no crédito', 2), ('Empréstimos', 3), ('Entre contas próprias', 4)) as n(name, sort)
on conflict do nothing;

insert into public.categories(household_id, scope, kind, grp, subgroup, name, sort)
select h.id, 'pessoal', 'despesa', 'A classificar', '', 'Fatura de cartão sem detalhe', 2
from public.households h
on conflict do nothing;

-- "A classificar" é a categoria com esse nome (agora o grupo tem outra)
create or replace function public.delete_category(p_id uuid, p_target uuid default null)
returns void language plpgsql security invoker set search_path = public as $$
declare hh uuid; tgt uuid;
begin
  select household_id into hh from public.categories where id = p_id;
  if hh is null then raise exception 'Categoria não encontrada'; end if;
  if not public.can_area(hh, 'orcamento', 'editar') then raise exception 'Sem permissão'; end if;
  tgt := coalesce(p_target, (select id from public.categories where household_id = hh and grp = 'A classificar' and name = 'A classificar' and id <> p_id limit 1));
  if tgt = p_id then raise exception 'Escolha outra categoria de destino'; end if;
  update public.transactions set category_id = tgt, kind = (select kind from public.categories where id = tgt) where category_id = p_id;
  update public.category_rules set category_id = tgt where category_id = p_id;
  update public.agenda_items set category_id = tgt where category_id = p_id;
  delete from public.budgets where category_id = p_id;
  delete from public.categories where id = p_id;
end $$;
revoke execute on function public.delete_category(uuid, uuid) from public, anon;
grant execute on function public.delete_category(uuid, uuid) to authenticated;
