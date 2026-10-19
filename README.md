# Sistema Dental (PWA + Supabase)

## Probar en tu computadora
Abre `index.html` con doble clic. Debe aparecer la pantalla "Entrar". Inicia sesión con un usuario
invitado desde Supabase (Authentication → Users → Invite user).

## Estructura
- `index.html`, `css/styles.css`, `manifest.webmanifest`, `sw.js`, `icons/` — la app instalable (PWA).
- `js/config.js` — URL y clave pública (anon) de tu proyecto Supabase.
- `js/supabase-client.js` — crea el cliente; si `config.js` está vacío, la app funciona 100% local sin login.
- `js/data.js` — toda la sincronización con Supabase (pacientes, citas, pagos, archivos, tiempo real).
- `js/auth.js` — pantalla de inicio de sesión.
- `supabase/schema.sql` — esquema completo (tablas, RLS, límite de 3 por horario, auditoría, Storage). Ya ejecutado.
- `supabase/002_conectar_app.sql` — migración para permitir registrar pagos desde la app. Ya ejecutado.
- `vercel.json` — cabeceras de seguridad al publicar.

## Cómo funciona la conexión
- Sin sesión iniciada: toda la app queda oculta detrás de la pantalla de login.
- Al iniciar sesión: se cargan los pacientes, citas, pagos y archivos desde Supabase.
- Cada guardado se refleja al instante en pantalla y se envía a Supabase en segundo plano. Si Supabase
  lo rechaza (saldo inválido, horario lleno, etc.), se revierte y se avisa con un mensaje.
- Varias personas conectadas ven los cambios de las demás casi al instante (tiempo real).
- Los archivos clínicos se guardan en un bucket privado de Supabase (Storage), no en el navegador.

## Primera prueba
1. Abre `index.html`.
2. Inicia sesión.
3. Crea un paciente de prueba.
4. En Supabase → Table Editor → `patients`, confirma que apareció la fila.

## Publicar en Vercel
Sube esta carpeta a GitHub (su contenido, no la carpeta en sí) y conéctala en vercel.com → Add New → Project.
