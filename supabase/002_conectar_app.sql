
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payments'
      and policyname = 'payments_insert'
  ) then
    create policy payments_insert on public.payments
      for insert to authenticated with check ((select public.is_approved()));
  end if;
end $$;

grant insert (patient_id, appointment_id, amount, method, paid_on, concept, reference, notes)
  on public.payments to authenticated;

grant update (paid) on public.appointments to authenticated;
