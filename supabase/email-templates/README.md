# Plantillas de correo · Thera-dent

Estas plantillas se pegan en `Supabase > Authentication > Email Templates`.

| Plantilla de Supabase | Asunto recomendado | Archivo |
| --- | --- | --- |
| Invite user | Has sido invitado(a) a Thera-dent | `invite.html` |
| Reset password | Restablece tu contraseña de Thera-dent | `recovery.html` |

Las plantillas usan `{{ .ConfirmationURL }}` para el enlace único y seguro generado por Supabase. No se debe reemplazar ni modificar esa variable.
