-- Restauración atómica: el respaldo completo se aplica o se revierte íntegramente.
create or replace function public.enforce_slot_capacity() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  capacity int; interval_minutes int; clinic_tz text; day_hours public.business_hours; used int; blocked int;
  today date; minutes_from_open int;
begin
  if current_setting('theradent.restore_mode', true) = 'on' then return new; end if;
  if new.status = 'cancelada' then return new; end if;
  select slot_capacity, slot_minutes, timezone into capacity, interval_minutes, clinic_tz from public.clinic_settings where id = true;
  today := (now() at time zone clinic_tz)::date;
  if (tg_op = 'INSERT' or new.appt_date is distinct from old.appt_date or new.appt_time is distinct from old.appt_time) and new.appt_date < today then
    raise exception 'past_date' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.clinic_closures where closed_on = new.appt_date) then raise exception 'closed_day' using errcode = 'P0001'; end if;
  select * into day_hours from public.business_hours where day_of_week = extract(dow from new.appt_date)::smallint;
  if not found or not day_hours.is_open or new.appt_time < day_hours.opens_at or new.appt_time > day_hours.closes_at
     or (day_hours.break_starts_at is not null and new.appt_time >= day_hours.break_starts_at and new.appt_time < day_hours.break_ends_at) then
    raise exception 'outside_business_hours' using errcode = 'P0001';
  end if;
  minutes_from_open := extract(epoch from (new.appt_time - day_hours.opens_at))::int / 60;
  if minutes_from_open % interval_minutes <> 0 then raise exception 'invalid_slot_interval' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.appt_date::text || ' ' || new.appt_time::text, 0));
  select count(*) into used from public.appointments where appt_date = new.appt_date and appt_time = new.appt_time and status <> 'cancelada' and id <> new.id;
  select coalesce(sum(places), 0) into blocked from public.blocked_slots where slot_date = new.appt_date and slot_time = new.appt_time;
  if used + blocked >= capacity then raise exception 'slot_full' using errcode = 'P0001'; end if;
  return new;
end $$;

create or replace function public.restore_theradent_backup(p_backup jsonb) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_backup->>'format' <> 'theradent-backup' or (p_backup->>'version')::int <> 1 or p_backup->'tables' is null then
    raise exception 'invalid_backup' using errcode = 'P0001';
  end if;

  perform set_config('theradent.restore_mode', 'on', true);
  delete from public.payments;
  delete from public.appointment_notes;
  delete from public.appointments;
  delete from public.patient_qr_tokens;
  delete from public.patient_files;
  delete from public.treatments;
  delete from public.patient_clinical_records;
  delete from public.patients;
  delete from public.blocked_slots;
  delete from public.clinic_closures;
  delete from public.business_hours;
  delete from public.appointment_reasons;
  delete from public.treatment_catalog;
  delete from public.clinic_settings;

  insert into public.clinic_settings select * from jsonb_populate_recordset(null::public.clinic_settings, coalesce(p_backup #> '{tables,clinic_settings}', '[]'::jsonb));
  insert into public.business_hours select * from jsonb_populate_recordset(null::public.business_hours, coalesce(p_backup #> '{tables,business_hours}', '[]'::jsonb));
  insert into public.clinic_closures select * from jsonb_populate_recordset(null::public.clinic_closures, coalesce(p_backup #> '{tables,clinic_closures}', '[]'::jsonb));
  insert into public.appointment_reasons select * from jsonb_populate_recordset(null::public.appointment_reasons, coalesce(p_backup #> '{tables,appointment_reasons}', '[]'::jsonb));
  insert into public.treatment_catalog select * from jsonb_populate_recordset(null::public.treatment_catalog, coalesce(p_backup #> '{tables,treatment_catalog}', '[]'::jsonb));
  insert into public.patients (id, first_name, last_name, birth_date, sex, phone, email, address, emergency_name, emergency_relation, emergency_phone, blood_type, medical_history, allergies, medications, medical_notes, created_at, updated_at, created_by)
    select id, first_name, last_name, birth_date, sex, phone, email, address, emergency_name, emergency_relation, emergency_phone, blood_type, medical_history, allergies, medications, medical_notes, created_at, updated_at, created_by
    from jsonb_populate_recordset(null::public.patients, coalesce(p_backup #> '{tables,patients}', '[]'::jsonb));
  insert into public.patient_clinical_records select * from jsonb_populate_recordset(null::public.patient_clinical_records, coalesce(p_backup #> '{tables,patient_clinical_records}', '[]'::jsonb));
  insert into public.treatments select * from jsonb_populate_recordset(null::public.treatments, coalesce(p_backup #> '{tables,treatments}', '[]'::jsonb));
  insert into public.patient_files select * from jsonb_populate_recordset(null::public.patient_files, coalesce(p_backup #> '{tables,patient_files}', '[]'::jsonb));
  insert into public.appointments (id, patient_id, appt_date, appt_time, motive, status, total, paid, created_at, updated_at, created_by)
    select id, patient_id, appt_date, appt_time, motive, status, total, paid, created_at, updated_at, created_by
    from jsonb_populate_recordset(null::public.appointments, coalesce(p_backup #> '{tables,appointments}', '[]'::jsonb));
  insert into public.appointment_notes select * from jsonb_populate_recordset(null::public.appointment_notes, coalesce(p_backup #> '{tables,appointment_notes}', '[]'::jsonb));
  insert into public.payments select * from jsonb_populate_recordset(null::public.payments, coalesce(p_backup #> '{tables,payments}', '[]'::jsonb));
  insert into public.blocked_slots select * from jsonb_populate_recordset(null::public.blocked_slots, coalesce(p_backup #> '{tables,blocked_slots}', '[]'::jsonb));
  insert into public.patient_qr_tokens select * from jsonb_populate_recordset(null::public.patient_qr_tokens, coalesce(p_backup #> '{tables,patient_qr_tokens}', '[]'::jsonb));
end $$;

revoke all on function public.restore_theradent_backup(jsonb) from public, anon, authenticated;
grant execute on function public.restore_theradent_backup(jsonb) to service_role;
