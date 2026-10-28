-- Impide que recepción solicite columnas clínicas heredadas del directorio.
revoke all on public.patients from authenticated;
grant select (id, first_name, last_name, full_name, birth_date, sex, phone, email, address, emergency_name, emergency_relation, emergency_phone, created_at, updated_at, created_by) on public.patients to authenticated;
grant insert (id, first_name, last_name, birth_date, sex, phone, email, address, emergency_name, emergency_relation, emergency_phone) on public.patients to authenticated;
grant update (first_name, last_name, birth_date, sex, phone, email, address, emergency_name, emergency_relation, emergency_phone) on public.patients to authenticated;
grant delete on public.patients to authenticated;
