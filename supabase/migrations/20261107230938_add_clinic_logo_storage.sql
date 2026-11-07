alter table public.clinic_settings
  add column if not exists logo_path text
  check (logo_path is null or char_length(logo_path) <= 220);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinic-assets',
  'clinic-assets',
  false,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'clinic_assets_approved_select') then
    create policy "clinic_assets_approved_select" on storage.objects
      for select to authenticated
      using (bucket_id = 'clinic-assets' and (select private.is_approved()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'clinic_assets_admin_insert') then
    create policy "clinic_assets_admin_insert" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'clinic-assets' and (select private.is_admin()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'clinic_assets_admin_update') then
    create policy "clinic_assets_admin_update" on storage.objects
      for update to authenticated
      using (bucket_id = 'clinic-assets' and (select private.is_admin()))
      with check (bucket_id = 'clinic-assets' and (select private.is_admin()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'clinic_assets_admin_delete') then
    create policy "clinic_assets_admin_delete" on storage.objects
      for delete to authenticated
      using (bucket_id = 'clinic-assets' and (select private.is_admin()));
  end if;
end $$;
