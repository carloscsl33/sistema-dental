grant select on public.patients, public.treatments, public.blocked_slots, public.appointments, public.appointment_notes, public.payments, public.patient_files to authenticated;
grant insert, update, delete on public.patients, public.treatments, public.blocked_slots, public.appointment_notes to authenticated;
grant insert (id, patient_id, appt_date, appt_time, motive, total, paid, status) on public.appointments to authenticated;
grant update (patient_id, appt_date, appt_time, motive, total, status, paid) on public.appointments to authenticated;
grant delete on public.appointments, public.patient_files to authenticated;
grant insert on public.patient_files to authenticated;
grant insert (id, patient_id, appointment_id, amount, method, paid_on, concept, reference, notes) on public.payments to authenticated;
