alter table public.clinical_progress
  add column if not exists progress_on date,
  add column if not exists treatment_name text check (char_length(treatment_name) <= 160);

update public.clinical_progress
set progress_on = (created_at at time zone 'America/Mexico_City')::date
where progress_on is null;

alter table public.clinical_progress
  alter column progress_on set default (now() at time zone 'America/Mexico_City')::date,
  alter column progress_on set not null;

revoke insert, update on public.clinical_progress from authenticated;
grant insert (patient_id, body, progress_on, treatment_name) on public.clinical_progress to authenticated;
grant update (body, progress_on, treatment_name) on public.clinical_progress to authenticated;
