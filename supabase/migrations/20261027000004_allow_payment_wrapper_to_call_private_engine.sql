-- record_payment es una envoltura invoker pública; necesita invocar el motor privado.
-- El motor sigue fuera del esquema expuesto y verifica explícitamente admin/recepción.
grant execute on function private.register_payment(uuid, numeric, text, date, text, text, boolean) to authenticated;
