create or replace function public.restore_theradent_backup(p_backup jsonb) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_backup->>'format' <> 'theradent-backup' or (p_backup->>'version')::int <> 1 or p_backup->'tables' is null then raise exception 'invalid_backup' using errcode = 'P0001'; end if;
  perform set_config('theradent.restore_mode', 'on', true);
  delete from public.payment_refunds where id is not null; delete from public.payments where id is not null; delete from public.expenses where id is not null; delete from public.clinical_progress where id is not null; delete from public.appointments where id is not null; delete from public.patient_qr_tokens where patient_id is not null; delete from public.patient_files where id is not null; delete from public.treatments where id is not null; delete from public.patient_clinical_records where patient_id is not null; delete from public.patients where id is not null; delete from public.blocked_slots where slot_date is not null; delete from public.clinic_closures where closed_on is not null; delete from public.business_hours where day_of_week is not null; delete from public.appointment_reasons where id is not null; delete from public.treatment_catalog where id is not null; delete from public.clinic_settings where id is not null;
  insert into public.clinic_settings select * from jsonb_populate_recordset(null::public.clinic_settings, coalesce(p_backup #> '{tables,clinic_settings}', '[]'::jsonb));
  insert into public.business_hours select * from jsonb_populate_recordset(null::public.business_hours, coalesce(p_backup #> '{tables,business_hours}', '[]'::jsonb));
  insert into public.clinic_closures select * from jsonb_populate_recordset(null::public.clinic_closures, coalesce(p_backup #> '{tables,clinic_closures}', '[]'::jsonb));
  insert into public.appointment_reasons select * from jsonb_populate_recordset(null::public.appointment_reasons, coalesce(p_backup #> '{tables,appointment_reasons}', '[]'::jsonb));
  insert into public.treatment_catalog select * from jsonb_populate_recordset(null::public.treatment_catalog, coalesce(p_backup #> '{tables,treatment_catalog}', '[]'::jsonb));
  insert into public.patients (id, first_name, last_name, birth_date, sex, phone, email, address, emergency_name, emergency_relation, emergency_phone, blood_type, medical_history, allergies, medications, medical_notes, created_at, updated_at, created_by) select id, first_name, last_name, birth_date, sex, phone, email, address, emergency_name, emergency_relation, emergency_phone, blood_type, medical_history, allergies, medications, medical_notes, created_at, updated_at, created_by from jsonb_populate_recordset(null::public.patients, coalesce(p_backup #> '{tables,patients}', '[]'::jsonb));
  insert into public.patient_clinical_records select * from jsonb_populate_recordset(null::public.patient_clinical_records, coalesce(p_backup #> '{tables,patient_clinical_records}', '[]'::jsonb));
  insert into public.treatments select * from jsonb_populate_recordset(null::public.treatments, coalesce(p_backup #> '{tables,treatments}', '[]'::jsonb));
  insert into public.patient_files select * from jsonb_populate_recordset(null::public.patient_files, coalesce(p_backup #> '{tables,patient_files}', '[]'::jsonb));
  insert into public.appointments (id, patient_id, appt_date, appt_time, motive, status, total, paid, created_at, updated_at, created_by) select id, patient_id, appt_date, appt_time, motive, status, total, paid, created_at, updated_at, created_by from jsonb_populate_recordset(null::public.appointments, coalesce(p_backup #> '{tables,appointments}', '[]'::jsonb));
  insert into public.clinical_progress select * from jsonb_populate_recordset(null::public.clinical_progress, coalesce(p_backup #> '{tables,clinical_progress}', '[]'::jsonb));
  insert into public.payments select * from jsonb_populate_recordset(null::public.payments, coalesce(p_backup #> '{tables,payments}', '[]'::jsonb));
  insert into public.payment_refunds select * from jsonb_populate_recordset(null::public.payment_refunds, coalesce(p_backup #> '{tables,payment_refunds}', '[]'::jsonb));
  insert into public.expenses select * from jsonb_populate_recordset(null::public.expenses, coalesce(p_backup #> '{tables,expenses}', '[]'::jsonb));
  insert into public.blocked_slots select * from jsonb_populate_recordset(null::public.blocked_slots, coalesce(p_backup #> '{tables,blocked_slots}', '[]'::jsonb));
  insert into public.patient_qr_tokens select * from jsonb_populate_recordset(null::public.patient_qr_tokens, coalesce(p_backup #> '{tables,patient_qr_tokens}', '[]'::jsonb));
end $$;

drop table if exists public.appointment_notes;
