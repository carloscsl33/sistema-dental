alter table public.patient_files
  add column if not exists storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'google_drive')),
  add column if not exists external_file_id text,
  add column if not exists drive_folder_id text;

create index if not exists patient_files_google_drive_external_file_idx
  on public.patient_files (external_file_id)
  where storage_provider = 'google_drive';
