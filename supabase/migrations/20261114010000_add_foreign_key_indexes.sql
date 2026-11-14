create index if not exists clinical_progress_author_id_idx on public.clinical_progress (author_id);
create index if not exists expenses_created_by_idx on public.expenses (created_by);
create index if not exists google_drive_connection_connected_by_idx on public.google_drive_connection (connected_by);
create index if not exists google_drive_oauth_states_user_id_idx on public.google_drive_oauth_states (user_id);
create index if not exists payment_refunds_appointment_id_idx on public.payment_refunds (appointment_id);
create index if not exists payment_refunds_created_by_idx on public.payment_refunds (created_by);
create index if not exists payment_refunds_patient_id_idx on public.payment_refunds (patient_id);
