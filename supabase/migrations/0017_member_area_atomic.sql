-- Ajuste de acesso por área de forma atômica: muda só a área pedida (várias mudanças seguidas não se sobrescrevem)
create or replace function public.set_member_area(hh uuid, p_user uuid, p_area text, p_level text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r text; out jsonb;
begin
  if not public.is_admin(hh) then raise exception 'Apenas o dono ou administradores'; end if;
  if p_level not in ('nada', 'ver', 'editar') then raise exception 'Nível inválido'; end if;
  select role into r from public.household_members where household_id = hh and user_id = p_user;
  if r is null or r = 'dono' then raise exception 'Membro inválido'; end if;
  if r = 'leitura' and p_level = 'editar' then p_level := 'ver'; end if;
  update public.household_members set areas = coalesce(areas, '{}'::jsonb) || jsonb_build_object(p_area, p_level)
    where household_id = hh and user_id = p_user returning areas into out;
  return out;
end $$;
grant execute on function public.set_member_area(uuid, uuid, text, text) to authenticated;
