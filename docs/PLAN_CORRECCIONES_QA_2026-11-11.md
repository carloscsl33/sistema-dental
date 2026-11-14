# Plan de correcciones posteriores a QA — 11 de noviembre de 2026

Este documento separa defectos confirmados, decisiones de producto y mensajes que no pertenecen al sistema. No se aplicaron cambios al elaborar este plan.

## Parte 1 — Integridad de citas y cobros

### 1.1 Pago antes de finalizar: convertirlo formalmente en anticipo

- **Estado:** corregido, probado localmente y publicado.
- **Hallazgo:** una cita puede recibir un cobro antes de marcarse como finalizada.
- **Corrección aplicada:** el recibo se presenta como **“Registrar pago / anticipo”** cuando no se está finalizando la cita. Mantiene **“Finalizar cita”** como acción clínica independiente y conserva el saldo posterior.
- **Prueba de aceptación:** registrar un anticipo parcial, ver el saldo pendiente, finalizar después y registrar solamente el saldo restante.

### 1.2 Cancelación de una cita ya pagada

- **Estado:** corregido, protegido también en Supabase y publicado.
- **Hallazgo:** si se cancela una cita con pago previo y no se agenda otra, la cita puede eliminarse mientras el pago queda sin cita asociada.
- **Corrección aplicada:** una cita con pagos queda en estado `Cancelada`, no se elimina desde la interfaz y el importe ya pagado se conserva al reagendarla. La política de Supabase preparada también bloquea su eliminación desde la base. El reembolso seguirá siendo un flujo separado y explícito.
- **Prueba de aceptación:** cancelar una cita con anticipo y comprobar que ningún pago queda huérfano y que el saldo/crédito es trazable.

### 1.3 Finalizar una cita con saldo cero

- **Estado:** corregido, probado localmente y publicado.
- **Hallazgo:** al finalizar una cita ya cubierta, se abre un comprobante adicional de `$0`.
- **Corrección aplicada:** si el saldo es cero, se finaliza directamente sin abrir recibo ni crear movimiento financiero adicional.
- **Prueba de aceptación:** finalizar una cita pagada por completo y verificar que no se crea recibo de $0.

## Parte 2 — Inicio de sesión, sincronización y datos visibles

### 2.1 Tablero vacío al entrar o cambiar de cuenta

- **Estado:** corregido, probado localmente y publicado.
- **Causa identificada:** `handleSession()` desbloquea la interfaz antes de esperar `connectToCloud()`. Las consultas de Supabase responden correctamente, pero el tablero se pinta antes de tener pacientes, citas y pagos.
- **Corrección aplicada:** la interfaz permanece bloqueada con “Cargando datos de la clínica…” hasta completar la primera sincronización. Al cambiar de usuario se invalida cualquier carga previa y solo se desbloquea la sesión más reciente.
- **Prueba de aceptación:** alternar entre las tres cuentas y entrar en una ventana nueva; el tablero nunca deberá verse vacío ni mostrar datos transitorios de otra cuenta.

### 2.2 Lista de archivos clínicos no se actualiza inmediatamente

- **Estado:** corregido, probado localmente y publicado.
- **Hallazgo:** la carga, apertura y eliminación en Google Drive funcionan; un archivo recién guardado aparece solo tras recargar.
- **Corrección aplicada:** la sincronización actualiza y elimina solamente las filas de archivos que cambiaron; ya no borra toda la lista antes de insertarla, por lo que Realtime no puede leer una lista temporalmente vacía.
- **Prueba de aceptación:** adjuntar un PNG/PDF, guardar y verlo inmediatamente; abrirlo y eliminarlo sin recargar.

## Parte 3 — Consola, accesibilidad y recursos externos

### 3.1 Avisos `aria-hidden` con foco dentro de un modal

- **Estado:** corregido, probado localmente y publicado.
- **Hallazgo:** al cerrar modales, se establece `aria-hidden="true"` mientras el botón interno conserva el foco. Afectó cita, paciente, comprobantes y QR.
- **Evidencia de consola del 11 de noviembre:** se identificaron los elementos concretos: `#confirmation-cancel`, `#patient-save`, `#appointment-no-schedule`, `#modal-date` (campo oculto de fecha), botón primario del recibo de pago y botón `outline-button` del documento/recibo. Esto confirma que el problema es transversal y no exclusivo de un modal.
- **Corrección propuesta:** centralizar apertura/cierre de modales. Antes de ocultar, mover el foco al elemento que abrió el modal o aplicar `blur()`; después usar `inert` mientras esté cerrado y devolver el foco al disparador. Conservar trampa de foco mientras el modal esté abierto.
- **Prueba de aceptación:** abrir y cerrar cada modal con teclado; no deben aparecer avisos ARIA y el foco debe volver al control original.

### 3.2 Dependencias QR desde jsDelivr bloqueadas por Tracking Prevention

- **Estado:** corregido, probado localmente y publicado.
- **Hallazgo:** Edge bloquea acceso a almacenamiento de `jsQR` y `qrcode-generator` cargados desde CDN. Aunque no siempre rompe el QR, agrega advertencias y depende de terceros.
- **Corrección propuesta:** descargar, versionar y servir ambas bibliotecas localmente desde el proyecto; retirar los `<script>` de jsDelivr y actualizar CSP para usar solo `script-src 'self'`.
- **Prueba de aceptación:** generar tarjeta QR y escanearla en Edge/Chrome sin avisos de Tracking Prevention relacionados con CDN.

### 3.3 CSP: estilos inline y fuentes en la consola histórica

- **Estado:** verificado en producción; no se agregaron excepciones `unsafe-inline` a la CSP.
- **Hallazgo:** la consola anterior mostraba bloqueos CSP de estilos inline desde el gráfico de Finanzas y de fuentes. El código actual de `finance.js` ya usa clases CSS (`finance-bar-height-*`) en vez de `style="..."`.
- **Corrección propuesta:** publicar/verificar la versión actual, invalidar el caché del service worker y comprobar en un perfil limpio. No agregar `unsafe-inline`; si queda una fuente externa, alojarla localmente o eliminarla.
- **Prueba de aceptación:** abrir Finanzas en perfil limpio; cero errores de `style-src` y cero solicitudes de fuentes no permitidas.

### 3.4 Mapa de código de jsDelivr bloqueado por CSP

- **Estado:** corregido al retirar la dependencia remota de jsDelivr.
- **Hallazgo:** DevTools intenta descargar un `source map` remoto; no participa en la ejecución de la aplicación.
- **Corrección propuesta:** al alojar QR localmente desaparece. Si se mantiene CDN, permitir solo el origen necesario en `connect-src`; no ampliar CSP sin necesidad.

### 3.5 `Invalid Refresh Token: Refresh Token Not Found`

- **Estado:** corregido, probado localmente y publicado.
- **Corrección propuesta:** ante error de refresh, borrar el almacenamiento de sesión de Supabase, desmontar Realtime y regresar al inicio de sesión con un mensaje breve. Evitar que se hagan consultas con un token inválido.
- **Prueba de aceptación:** invalidar/cerrar una sesión y recargar; debe llevar a iniciar sesión sin errores repetidos en consola.

### 3.6 `favicon.ico` 404

- **Estado:** corregido y verificado en producción (`/favicon.ico` responde 200).
- **Corrección propuesta:** agregar un favicon local y su etiqueta `link rel="icon"`.

### 3.7 Mensajes que no requieren corrección en el sistema

- `Unchecked runtime.lastError: Could not establish connection`: proviene de una extensión del navegador.
- `installHook.js` y el `Uncaught (in promise) undefined` de `content.js:167`: provienen de extensiones/herramientas, no del código publicado.
- “Service Worker was updated because Update on reload was checked”: información de DevTools, no error.
- El WebSocket de Realtime fallando por `Page entered Back-Forward Cache`: comportamiento esperado del navegador; validar solamente que Realtime se reconecte al volver.

## Parte 4 — Seguridad y base de datos

### 4.1 Funciones `SECURITY DEFINER` ejecutables por usuarios autenticados

- **Estado:** corregido y verificado en Supabase.
- **Funciones:** `record_payment`, `record_expense`, `record_payment_refund`.
- **Riesgo:** son necesarias para operaciones atómicas, pero por ser `SECURITY DEFINER` expuestas en `public` deben validar estrictamente rol y autorización dentro de cada función.
- **Corrección propuesta:** mantenerlas solo si cada una exige `admin` o `receptionist` mediante `private.current_role()` y verifica que el registro pertenece a un paciente/cita válida. Revocar `EXECUTE` al rol autenticado si una función no se usa desde el cliente. Añadir pruebas con cuenta Doctor/a que confirmen error `forbidden` al invocarlas.
- **Nota del asesor:** el aviso persistirá mientras estas tres funciones públicas deban ser ejecutables por los roles autorizados desde la aplicación. La verificación de rol interna y las pruebas de rechazo para roles no autorizados están implementadas; revocar `EXECUTE` rompería los cobros y gastos legítimos.

### 4.2 Protección contra contraseñas filtradas

- **Estado:** advertencia activa de Supabase; requiere plan Pro.
- **Decisión:** habilitarla al pasar a Pro. Mientras tanto, mantener requisitos propios de contraseña y no reutilizar credenciales de prueba.

### 4.3 Índices de claves foráneas

- **Estado:** corregido y verificado en Supabase.
- **Índices faltantes detectados:** autor de avances, creador de gastos, usuario de conexión/estado OAuth de Drive y varias claves de reembolsos.
- **Corrección aplicada:** se agregaron los siete índices de claves foráneas señalados por el asesor. No se borraron índices “unused”: la base aún no tiene suficiente tráfico real para juzgarlos.

## Parte 5 — Roles y decisiones confirmadas

- Doctor/a: puede consultar agenda y expedientes, y registrar evolución clínica. Finanzas, Administración y Configuración están bloqueados funcionalmente.
- Recepcionista: puede gestionar agenda, pacientes, cobros y Finanzas; no puede administrar usuarios/configuración ni registrar avances clínicos.
- Los enlaces restringidos pueden permanecer ocultos visualmente para reducir confusión, pero la validación de rol debe mantenerse también al ejecutar cada acción y en Supabase.

## Orden recomendado de implementación

1. Cancelación con pagos y finalización con saldo cero.
2. Carga de sesión inicial/cambio de usuario y recuperación de refresh token vencido.
3. Seguridad de funciones `SECURITY DEFINER`.
4. Accesibilidad de modales.
5. Dependencias QR locales, CSP y favicon.
6. Actualización inmediata de adjuntos Drive.
7. Etiquetas de pago/anticipo y mejoras visuales.
8. Índices de rendimiento y protección de contraseñas filtradas según plan de Supabase.

## Pendientes externos o manuales

- **Protección contra contraseñas filtradas:** Supabase la reserva para el plan Pro; no existe una corrección segura equivalente desde el código cliente.
- **Cámara física de QR:** prueba manual completada correctamente el 13 de noviembre de 2026.

## Evidencia de consola incorporada

Las cuatro capturas derivadas de `consola 1.mp4` fueron revisadas e incorporadas. No muestran un error adicional de lógica de negocio: corroboran los avisos ARIA, el favicon ausente, el mensaje de extensión y el cierre esperado de Realtime por Back-Forward Cache descritos arriba.
