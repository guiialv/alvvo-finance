-- =====================================================================
-- ALVVO Finance — endurecimento de segurança (recomendações do Supabase).
-- Funções só para usuários logados; search_path fixo nas funções de gatilho.
-- household_secrets fica sem políticas de propósito (só o servidor lê).
-- =====================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.ai_key_last4(uuid)', 'public.approve_member(uuid, uuid, text)', 'public.can_area(uuid, text, text)',
    'public.create_household(text, text)', 'public.is_admin(uuid)', 'public.is_member(uuid)',
    'public.join_household(text, text, text, text)', 'public.regenerate_invite(uuid)', 'public.sees_tx(uuid, uuid)',
    'public.set_ai_key(uuid, text, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
alter function public.protect_member_self() set search_path = public;
alter function public.touch_updated_at() set search_path = public;
alter function public.protect_household_flags() set search_path = public;
alter function public.role_areas(text) set search_path = public;
