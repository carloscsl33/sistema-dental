revoke execute on function public.get_patient_qr_token(uuid) from authenticated;
revoke execute on function public.resolve_patient_qr_token(text) from authenticated;
drop function public.get_patient_qr_token(uuid);
drop function public.resolve_patient_qr_token(text);
