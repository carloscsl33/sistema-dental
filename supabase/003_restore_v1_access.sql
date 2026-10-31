-- Restauración de acceso compatible con la aplicación estable del 22 de octubre.
-- No elimina datos: sólo reemplaza las políticas de roles de una versión posterior.
do $$
declare item record;
begin
  for item in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'profiles', 'patients', 'treatments', 'blocked_slots',
        'appointments', 'appointment_notes', 'payments', 'patient_files'
      ])
  loop
    execute format('drop policy if exists %I on public.%I', item.policyname, item.tablename);
  end loop;
end $$;

create policy profiles_select on public.profiles
  for select to authenticated using (id = (select auth.uid()));

do $$
declare target text;
begin
  foreach target in array array[
    'patients', 'treatments', 'blocked_slots', 'appointments',
    'appointment_notes', 'payments', 'patient_files'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.is_approved()))',
      target || '_select', target
    );
  end loop;

  foreach target in array array[
    'patients', 'treatments', 'blocked_slots', 'appointments', 'appointment_notes'
  ] loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.is_approved()))',
      target || '_insert', target
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.is_approved())) with check ((select private.is_approved()))',
      target || '_update', target
    );
  end loop;

  foreach target in array array[
    'treatments', 'blocked_slots', 'appointment_notes', 'patient_files'
  ] loop
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select private.is_approved()))',
      target || '_delete', target
    );
  end loop;
end $$;

create policy patient_files_insert on public.patient_files
  for insert to authenticated with check ((select private.is_approved()));
create policy patients_delete on public.patients
  for delete to authenticated using ((select private.is_approved()));
create policy appointments_delete on public.appointments
  for delete to authenticated using ((select private.is_approved()) and status <> 'finalizada');
create policy payments_insert on public.payments
  for insert to authenticated with check ((select private.is_approved()));

grant select on public.profiles, public.patients, public.treatments, public.blocked_slots,
  public.appointments, public.appointment_notes, public.payments, public.patient_files to authenticated;
grant insert, update, delete on public.patients, public.treatments, public.blocked_slots,
  public.appointment_notes to authenticated;
grant insert (id, patient_id, appt_date, appt_time, motive, total, paid, status)
  on public.appointments to authenticated;
grant update (patient_id, appt_date, appt_time, motive, total, status, paid)
  on public.appointments to authenticated;
grant delete on public.appointments, public.patient_files to authenticated;
grant insert on public.patient_files to authenticated;
grant insert (id, patient_id, appointment_id, amount, method, paid_on, concept, reference, notes)
  on public.payments to authenticated;
