drop policy if exists patients_select on public.patients;
drop policy if exists patients_insert on public.patients;
drop policy if exists patients_update on public.patients;
drop policy if exists patients_delete on public.patients;
create policy patients_directory_select on public.patients for select to authenticated
  using ((select private.is_approved()));
create policy patients_directory_insert on public.patients for insert to authenticated
  with check ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role));
create policy patients_directory_update on public.patients for update to authenticated
  using ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role))
  with check ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role));
create policy patients_directory_delete on public.patients for delete to authenticated
  using ((select private.is_admin()));

revoke select (blood_type, medical_history, allergies, medications, medical_notes) on public.patients from authenticated;
revoke insert (blood_type, medical_history, allergies, medications, medical_notes) on public.patients from authenticated;
revoke update (blood_type, medical_history, allergies, medications, medical_notes) on public.patients from authenticated;

create table if not exists public.patient_clinical_records (
  patient_id uuid primary key references public.patients(id) on delete cascade,
  blood_type text check (blood_type in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  medical_history text check (char_length(medical_history) <= 2000),
  allergies text not null default '' check (char_length(allergies) <= 1000),
  medications text check (char_length(medications) <= 1000),
  medical_notes text check (char_length(medical_notes) <= 2000),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null
);

insert into public.patient_clinical_records (patient_id, blood_type, medical_history, allergies, medications, medical_notes)
select id, blood_type, medical_history, allergies, medications, medical_notes from public.patients
on conflict (patient_id) do update set
  blood_type = excluded.blood_type, medical_history = excluded.medical_history,
  allergies = excluded.allergies, medications = excluded.medications, medical_notes = excluded.medical_notes;

create index if not exists patient_clinical_records_updated_by_idx on public.patient_clinical_records (updated_by);
create trigger patient_clinical_records_touch before update on public.patient_clinical_records for each row execute function public.touch_updated_at();
alter table public.patient_clinical_records enable row level security;
revoke all on public.patient_clinical_records from anon, authenticated;
grant select, insert, update, delete on public.patient_clinical_records to authenticated;
create policy clinical_records_staff on public.patient_clinical_records for select to authenticated
  using ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy clinical_records_staff_insert on public.patient_clinical_records for insert to authenticated
  with check ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy clinical_records_staff_update on public.patient_clinical_records for update to authenticated
  using ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role))
  with check ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy clinical_records_admin_delete on public.patient_clinical_records for delete to authenticated
  using ((select private.is_admin()));

drop policy if exists treatments_select on public.treatments;
drop policy if exists treatments_insert on public.treatments;
drop policy if exists treatments_update on public.treatments;
drop policy if exists treatments_delete on public.treatments;
create policy treatments_clinical_select on public.treatments for select to authenticated using ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy treatments_clinical_insert on public.treatments for insert to authenticated with check ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy treatments_clinical_update on public.treatments for update to authenticated using ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role)) with check ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy treatments_clinical_delete on public.treatments for delete to authenticated using ((select private.is_admin()));

drop policy if exists patient_files_select on public.patient_files;
drop policy if exists patient_files_insert on public.patient_files;
drop policy if exists patient_files_delete on public.patient_files;
create policy patient_files_clinical_select on public.patient_files for select to authenticated using ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy patient_files_clinical_insert on public.patient_files for insert to authenticated with check ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy patient_files_clinical_delete on public.patient_files for delete to authenticated using ((select private.is_admin()));

drop policy if exists appointment_notes_select on public.appointment_notes;
drop policy if exists appointment_notes_insert on public.appointment_notes;
drop policy if exists appointment_notes_update on public.appointment_notes;
drop policy if exists appointment_notes_delete on public.appointment_notes;
create policy appointment_notes_clinical_select on public.appointment_notes for select to authenticated using ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy appointment_notes_clinical_insert on public.appointment_notes for insert to authenticated with check ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy appointment_notes_clinical_update on public.appointment_notes for update to authenticated using ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role)) with check ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy appointment_notes_admin_delete on public.appointment_notes for delete to authenticated using ((select private.is_admin()));

drop policy if exists clinical_files_select on storage.objects;
drop policy if exists clinical_files_insert on storage.objects;
drop policy if exists clinical_files_delete on storage.objects;
create policy clinical_files_clinical_select on storage.objects for select to authenticated using (bucket_id = 'clinical-files' and (select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy clinical_files_clinical_insert on storage.objects for insert to authenticated with check (bucket_id = 'clinical-files' and (select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy clinical_files_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'clinical-files' and (select private.is_admin()));
