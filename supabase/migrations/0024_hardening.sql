-- Endurecimento antes do beta aberto
-- 1) Ninguém troca a própria linha de família (household_id/user_id) nem estende acesso de suporte
create or replace function public.protect_member_self()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.household_id := old.household_id; new.user_id := old.user_id;
  if new.user_id = auth.uid() and not public.is_admin(old.household_id) then
    new.role := old.role; new.status := old.status; new.areas := old.areas; new.tx_scope := old.tx_scope;
    new.support := old.support; new.expires_at := old.expires_at; new.email := old.email;
  end if;
  if old.role = 'dono' then new.role := 'dono'; new.status := 'ativo'; end if;
  return new;
end $$;

-- 2) Recalcular ciclos sem login só pelo servidor (service_role)
create or replace function public.recompute_cycles(hh uuid, p_day integer)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if auth.uid() is null then
    if coalesce(auth.role(), '') <> 'service_role' then raise exception 'not authenticated'; end if;
  elsif not public.is_admin(hh) then raise exception 'Apenas o dono ou administradores'; end if;
  if p_day < 1 or p_day > 28 then raise exception 'Dia inválido'; end if;
  update public.households set cycle_start_day = p_day where id = hh;
  with ref as (
    select t.id,
      case
        when b.doc_type = 'fatura' and b.due_date is not null then b.due_date
        when b.doc_type = 'fatura' then (date_trunc('month', t.date) + interval '1 month')::date + (least(p_day, 28) - 1)
        else t.date
      end as d
    from public.transactions t left join public.import_batches b on b.id = t.import_batch_id
    where t.household_id = hh
  )
  update public.transactions t
     set cycle = to_char(case when extract(day from ref.d) >= p_day then ref.d else (ref.d - interval '1 month') end, 'YYYY-MM')
    from ref
   where t.id = ref.id
     and t.cycle is distinct from to_char(case when extract(day from ref.d) >= p_day then ref.d else (ref.d - interval '1 month') end, 'YYYY-MM');
  get diagnostics n = row_count;
  return n;
end $$;

-- 3) Funções privilegiadas: só usuários logados (e o servidor), nunca visitantes anônimos
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;
