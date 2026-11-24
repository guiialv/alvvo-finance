-- Feedback do beta com áudio e prints (como no alvvo health): anexos na pasta privada de cada pessoa
alter table public.feedback add column if not exists attachments jsonb not null default '[]';
alter table public.feedback add column if not exists device text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 10485760, array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/aac', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists feedback_files_insert on storage.objects;
create policy feedback_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists feedback_files_read on storage.objects;
create policy feedback_files_read on storage.objects for select to authenticated
  using (bucket_id = 'feedback' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin()));

-- Preferências pessoais de cada membro (ex.: abas da barra de baixo no celular), valem em todos os aparelhos
alter table public.household_members add column if not exists prefs jsonb not null default '{}';
create or replace function public.set_my_prefs(hh uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  update public.household_members set prefs = coalesce(prefs, '{}'::jsonb) || coalesce(p, '{}'::jsonb)
   where household_id = hh and user_id = auth.uid() returning prefs into out;
  return out;
end $$;
grant execute on function public.set_my_prefs(uuid, jsonb) to authenticated;
