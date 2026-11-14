# Hallazgos de pruebas — 11 de noviembre de 2026

## Pruebas confirmadas

- Alta y consulta de 230 pacientes ficticios.
- Agendado masivo con capacidad máxima de cinco pacientes por horario.
- Cobros completos y parciales; saldos e historial financiero sincronizados.
- Finalización de una cita pagada y persistencia en Supabase.
- Edición y eliminación de un avance clínico ficticio.
- Generación de tarjeta QR y apertura del expediente mediante código manual.
- Exportación CSV verificada por descarga real.
- Carga válida a Google Drive: se adjuntó `icon-192.png` (2,763 bytes) al expediente de Lucía García López. La base confirma el registro `b3a76201-952d-4de4-b570-f86f74c12a3a`, con proveedor `google_drive`, ID externo de Drive y carpeta asignada.
- Roles: Doctor/a puede consultar expedientes y abrir el registro de evolución clínica; Recepcionista puede gestionar agenda, pacientes, cobros y finanzas, pero no puede registrar avances ni entrar a Administración o Configuración.

## Hallazgos prioritarios

1. **Cancelación con pago previo:** al cancelar una cita pagada y elegir no agendar otra, la cita se elimina y el pago puede quedar sin cita asociada. Durante la prueba se eliminó el pago ficticio afectado para restaurar la consistencia. El flujo debe conservar la cita como `Cancelada` o exigir/rellenar un reembolso antes de eliminarla.
2. **Finalización ya pagada:** finalizar una cita con saldo cero genera un comprobante adicional de $0 antes de marcarla finalizada. No alteró los saldos, pero confunde el flujo.
3. **Funciones SECURITY DEFINER expuestas:** los avisos de Supabase señalan `record_expense`, `record_payment` y `record_payment_refund` ejecutables por usuarios autenticados. Revisar autorización interna y privilegios antes de producción.
4. **Actualización inmediata de archivos de Google Drive:** tras guardar, Historial clínico mostró temporalmente “No hay archivos adjuntos”, pero al recargar la página el archivo apareció. No es un problema de Drive, RLS ni persistencia: es un estado visual desactualizado después de guardar. Debe corregirse para que el archivo se muestre sin necesidad de recargar.
5. **Permisos de doctor/a — información financiera expuesta:** la sesión de Doctor/a bloquea funcionalmente las rutas de Finanzas, Administrar y Configuración, pero sus enlaces permanecen visibles. Además, el tablero y el expediente muestran importes de cobro, saldos, total pagado e Historial financiero. Las políticas actuales de `payments` conceden lectura a todo usuario aprobado, por lo que la restricción no es solo visual: debe definirse si doctor/a puede consultar esos datos; si no, hay que ocultarlos y restringirlos por rol también en la base de datos.
6. **Carga inicial al entrar o cambiar de cuenta:** `handleSession()` muestra el sistema con `applyAuthState(session)` antes de esperar `connectToCloud()`. Por eso el tablero puede renderizarse vacío mientras llegan pacientes, citas, cobros y horarios; los registros del servidor confirman respuestas `200` para esas consultas. Debe permanecer un estado de carga hasta terminar la primera sincronización y protegerse contra eventos de sesión simultáneos al cambiar de cuenta.

## Consola y accesibilidad pendientes

- Sesión de Supabase vencida: `Invalid Refresh Token: Refresh Token Not Found`; limpiar la sesión local y redirigir al inicio de sesión.
- Modales: `aria-hidden` se aplica mientras permanece el foco dentro del modal. Restaurar el foco al disparador y usar `inert` al cerrar.
- QR: Edge muestra Tracking Prevention para `jsQR` y `qrcode-generator` cargados desde jsDelivr. Incluir versiones locales del proyecto.
- Falta `favicon.ico` (404).
- `content.js` / `installHook.js` provienen de extensiones del navegador y no del sistema.
- El WebSocket de Realtime al entrar en Back-Forward Cache es esperable, pero conviene validar reconexión al volver a la pestaña.

## Pendiente de probar

- Cámara física para lectura QR (a cargo del usuario).
- Archivos de Google Drive: prueba completa superada. Se cargó un PNG válido, se abrió desde el botón `Ver` en una pestaña `blob:` y se eliminó mediante la confirmación de la interfaz. La fila de `patient_files` ya no existe después de la operación, por lo que no quedó metadato de prueba pendiente. La actualización inmediata del listado queda como defecto visual a corregir.
- Permisos por rol en sesiones aisladas de doctor/a y recepcionista.
- Protección de contraseñas filtradas (requiere plan Pro de Supabase).
