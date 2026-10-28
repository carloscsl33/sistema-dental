import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const headers = { "Content-Type": "application/json" };
const tables = ["clinic_settings", "business_hours", "clinic_closures", "appointment_reasons", "treatment_catalog", "patients", "patient_clinical_records", "treatments", "patient_files", "appointments", "appointment_notes", "payments", "blocked_slots", "patient_qr_tokens"] as const;
const deleteOrder = ["payments", "appointment_notes", "appointments", "patient_qr_tokens", "patient_files", "treatments", "patient_clinical_records", "patients", "blocked_slots", "clinic_closures", "business_hours", "appointment_reasons", "treatment_catalog", "clinic_settings"] as const;

Deno.serve(async req => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
  const auth = req.headers.get("Authorization") || "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "not_authorized" }), { status: 401, headers });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profile } = await admin.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" || profile.status !== "approved") return new Response(JSON.stringify({ error: "not_authorized" }), { status: 403, headers });
  const body = await req.json();
  if (body.action === "qr_get") {
    if (!["admin", "receptionist"].includes(profile.role)) return new Response(JSON.stringify({ error: "not_authorized" }), { status: 403, headers });
    const { data: existing } = await admin.from("patient_qr_tokens").select("token").eq("patient_id", body.patient_id).maybeSingle();
    if (existing?.token) return new Response(JSON.stringify({ token: existing.token }), { headers });
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"; const bytes = crypto.getRandomValues(new Uint8Array(8)); const token = `TD-${Array.from(bytes, byte => chars[byte % chars.length]).join("")}`;
    const { error } = await admin.from("patient_qr_tokens").insert({ patient_id: body.patient_id, token, created_by: user.id });
    if (error) throw error;
    return new Response(JSON.stringify({ token }), { headers });
  }
  if (body.action === "qr_resolve") {
    const token = String(body.token || "").trim().toUpperCase();
    const { data } = await admin.from("patient_qr_tokens").select("patient_id").eq("token", token).maybeSingle();
    return new Response(JSON.stringify({ patient_id: data?.patient_id || null }), { headers });
  }
  if (body.action === "export") {
    const entries = await Promise.all(tables.map(async table => {
      const { data, error } = await admin.from(table).select("*"); if (error) throw error; return [table, data || []];
    }));
    return new Response(JSON.stringify({ format: "theradent-backup", version: 1, exported_at: new Date().toISOString(), note: "Incluye datos clínicos y administrativos; no incluye contraseñas, sesiones ni archivos binarios de Storage.", tables: Object.fromEntries(entries) }), { headers });
  }
  const backup = body.backup;
  if (!backup || backup.format !== "theradent-backup" || backup.version !== 1) return new Response(JSON.stringify({ error: "invalid_backup" }), { status: 400, headers });
  if (body.action === "reset" && body.confirmation !== "BORRAR TODO") return new Response(JSON.stringify({ error: "confirmation_required" }), { status: 400, headers });
  if (body.action === "restore" && body.confirmation !== "RESTABLECER TODO") return new Response(JSON.stringify({ error: "confirmation_required" }), { status: 400, headers });
  if (!["restore", "reset"].includes(body.action)) return new Response(JSON.stringify({ error: "invalid_action" }), { status: 400, headers });
  const deleteColumn: Record<string, string> = { clinic_settings: "id", business_hours: "day_of_week", clinic_closures: "closure_date", blocked_slots: "slot_date", appointment_notes: "appointment_id", patient_clinical_records: "patient_id", patient_qr_tokens: "patient_id" };
  const tablesToClear = body.action === "reset"
    ? deleteOrder.filter(table => !["clinic_settings", "business_hours", "appointment_reasons", "treatment_catalog"].includes(table))
    : deleteOrder;
  for (const table of tablesToClear) { const { error } = await admin.from(table).delete().not(deleteColumn[table] || "id", "is", null); if (error) throw error; }
  if (body.action === "restore") {
    for (const table of tables) {
      let rows = Array.isArray(backup.tables?.[table]) ? backup.tables[table] : [];
      if (table === "patients") rows = rows.map(({ full_name, ...row }: Record<string, unknown>) => row);
      if (rows.length) { const { error } = await admin.from(table).insert(rows); if (error) throw error; }
    }
  }
  return new Response(JSON.stringify({ success: true }), { headers });
});
