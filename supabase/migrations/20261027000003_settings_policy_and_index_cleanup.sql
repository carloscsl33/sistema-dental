create index if not exists clinic_settings_updated_by_idx on public.clinic_settings (updated_by);
create index if not exists clinic_closures_created_by_idx on public.clinic_closures (created_by);

drop policy if exists clinic_settings_admin_write on public.clinic_settings;
drop policy if exists business_hours_admin_write on public.business_hours;
drop policy if exists clinic_closures_admin_write on public.clinic_closures;
drop policy if exists appointment_reasons_admin_write on public.appointment_reasons;
drop policy if exists treatment_catalog_admin_write on public.treatment_catalog;

create policy clinic_settings_admin_insert on public.clinic_settings for insert to authenticated with check ((select private.is_admin()));
create policy clinic_settings_admin_update on public.clinic_settings for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy clinic_settings_admin_delete on public.clinic_settings for delete to authenticated using ((select private.is_admin()));
create policy business_hours_admin_insert on public.business_hours for insert to authenticated with check ((select private.is_admin()));
create policy business_hours_admin_update on public.business_hours for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy business_hours_admin_delete on public.business_hours for delete to authenticated using ((select private.is_admin()));
create policy clinic_closures_admin_insert on public.clinic_closures for insert to authenticated with check ((select private.is_admin()));
create policy clinic_closures_admin_update on public.clinic_closures for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy clinic_closures_admin_delete on public.clinic_closures for delete to authenticated using ((select private.is_admin()));
create policy appointment_reasons_admin_insert on public.appointment_reasons for insert to authenticated with check ((select private.is_admin()));
create policy appointment_reasons_admin_update on public.appointment_reasons for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy appointment_reasons_admin_delete on public.appointment_reasons for delete to authenticated using ((select private.is_admin()));
create policy treatment_catalog_admin_insert on public.treatment_catalog for insert to authenticated with check ((select private.is_admin()));
create policy treatment_catalog_admin_update on public.treatment_catalog for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy treatment_catalog_admin_delete on public.treatment_catalog for delete to authenticated using ((select private.is_admin()));

create or replace function public.record_payment(
  p_appointment_id uuid, p_amount numeric, p_method text,
  p_paid_on date default null, p_reference text default null, p_notes text default null,
  p_finalize boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.register_payment(p_appointment_id, p_amount, p_method, p_paid_on, p_reference, p_notes, p_finalize);
end $$;

revoke all on function public.record_payment(uuid, numeric, text, date, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_payment(uuid, numeric, text, date, text, text, boolean) to authenticated;
