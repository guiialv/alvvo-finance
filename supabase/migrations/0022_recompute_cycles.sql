-- Troca o dia em que o mês começa e recalcula o mês de todos os lançamentos da família.
-- Faturas de cartão seguem o mês do vencimento (regime de caixa); o resto segue a data do lançamento.
create or replace function public.recompute_cycles(hh uuid, p_day int)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and not public.is_admin(hh) then raise exception 'Apenas o dono ou administradores'; end if;
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
grant execute on function public.recompute_cycles(uuid, int) to authenticated;
