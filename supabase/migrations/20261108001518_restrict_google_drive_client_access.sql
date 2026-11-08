-- OAuth states and encrypted Drive tokens are server-only data.
-- Service-role access used by the Edge Function bypasses RLS; browser roles do not.
create policy "google_drive_connection_no_client_access"
on public.google_drive_connection
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "google_drive_oauth_states_no_client_access"
on public.google_drive_oauth_states
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
