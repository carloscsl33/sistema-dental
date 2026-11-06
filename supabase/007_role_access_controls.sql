-- Reglas de acceso de Thera-dent:
-- Admin: acceso completo.
-- Recepcionista: pacientes, citas y finanzas; sin avances clínicos.
-- Doctor/a: pacientes, expediente y avances; citas de solo consulta.

drop policy if exists appointments_insert on public.appointments;
drop policy if exists appointments_update on public.appointments;
drop policy if exists appointments_delete on public.appointments;
create policy appointments_insert on public.appointments
  for insert to authenticated
  with check ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role));
create policy appointments_update on public.appointments
  for update to authenticated
  using ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role))
  with check ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role));
create policy appointments_delete on public.appointments
  for delete to authenticated
  using (
    (select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role)
    and status <> 'finalizada'::public.appt_status
  );

drop policy if exists blocked_slots_insert on public.blocked_slots;
drop policy if exists blocked_slots_update on public.blocked_slots;
drop policy if exists blocked_slots_delete on public.blocked_slots;
create policy blocked_slots_insert on public.blocked_slots
  for insert to authenticated
  with check ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role));
create policy blocked_slots_update on public.blocked_slots
  for update to authenticated
  using ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role))
  with check ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role));
create policy blocked_slots_delete on public.blocked_slots
  for delete to authenticated
  using ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role));

drop policy if exists appointment_notes_insert on public.appointment_notes;
drop policy if exists appointment_notes_update on public.appointment_notes;
drop policy if exists appointment_notes_delete on public.appointment_notes;
create policy appointment_notes_insert on public.appointment_notes
  for insert to authenticated
  with check ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy appointment_notes_update on public.appointment_notes
  for update to authenticated
  using ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role))
  with check ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy appointment_notes_delete on public.appointment_notes
  for delete to authenticated
  using ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));

drop policy if exists clinical_records_staff on public.patient_clinical_records;
drop policy if exists clinical_records_staff_insert on public.patient_clinical_records;
drop policy if exists clinical_records_staff_update on public.patient_clinical_records;
drop policy if exists clinical_records_admin_delete on public.patient_clinical_records;
create policy clinical_records_staff on public.patient_clinical_records
  for select to authenticated
  using ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role, 'doctor'::public.app_role));
create policy clinical_records_staff_insert on public.patient_clinical_records
  for insert to authenticated
  with check ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role, 'doctor'::public.app_role));
create policy clinical_records_staff_update on public.patient_clinical_records
  for update to authenticated
  using ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role, 'doctor'::public.app_role))
  with check ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role, 'doctor'::public.app_role));
create policy clinical_records_staff_delete on public.patient_clinical_records
  for delete to authenticated
  using ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role, 'doctor'::public.app_role));

drop policy if exists payments_select on public.payments;
drop policy if exists payments_insert on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role));
create policy payments_insert on public.payments
  for insert to authenticated
  with check ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role));
