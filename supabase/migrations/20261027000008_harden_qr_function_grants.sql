revoke execute on function public.get_patient_qr_token(uuid) from anon;
revoke execute on function public.resolve_patient_qr_token(text) from anon;
create index if not exists patient_qr_tokens_created_by_idx on public.patient_qr_tokens (created_by);
