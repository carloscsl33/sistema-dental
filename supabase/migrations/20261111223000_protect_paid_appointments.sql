-- Una cita con dinero aplicado conserva su historial; solo puede cancelarse o reagendarse.
drop policy if exists appointments_delete on public.appointments;

create policy appointments_delete on public.appointments
  for delete to authenticated
  using (
    (select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role)
    and status <> 'finalizada'::public.appt_status
    and coalesce(paid, 0) = 0
  );
