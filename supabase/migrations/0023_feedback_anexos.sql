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
