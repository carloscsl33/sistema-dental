-- Ejecutar en el SQL Editor de Supabase DESPUÉS de schema.sql.
-- Habilita que la app (ya conectada) pueda registrar pagos y actualizar lo pagado de una cita.
-- (El esquema original solo permitía esto a través de la función register_payment; la app
--  valida el sobrepago en el navegador antes de guardar, así que se habilita la escritura directa
--  para no complicar la integración. register_payment queda disponible para usarla más adelante
--  si se requiere bloqueo a nivel de base de datos contra condiciones de carrera en los pagos.)

-- schema.sql ya puede incluir esta política; hacerla idempotente permite
-- ejecutar esta migración tanto en instalaciones nuevas como existentes.
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert to authenticated with check ((select public.is_approved()));

grant insert (patient_id, appointment_id, amount, method, paid_on, concept, reference, notes)
  on public.payments to authenticated;

alter table public.payments alter column created_by set default auth.uid();

grant update (paid) on public.appointments to authenticated;
