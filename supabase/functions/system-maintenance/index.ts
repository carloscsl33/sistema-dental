import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://sistema-dental-mu.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};

const tables = ["clinic_settings", "business_hours", "clinic_closures", "appointment_reasons", "treatment_catalog", "patients", "patient_clinical_records", "treatments", "patient_files", "appointments", "appointment_notes", "payments", "payment_refunds", "expenses", "blocked_slots", "patient_qr_tokens"] as const;
const deleteOrder = ["payment_refunds", "payments", "expenses", "appointment_notes", "appointments", "patient_qr_tokens", "patient_files", "treatments", "patient_clinical_records", "patients", "blocked_slots", "clinic_closures", "business_hours", "appointment_reasons", "treatment_catalog", "clinic_settings"] as const;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function isValidBackup(backup: unknown): backup is { format: string; version: number; tables: Record<string, unknown> } {
  if (!backup || typeof backup !== "object") return false;
  const candidate = backup as { format?: string; version?: number; tables?: Record<string, unknown> };
  return candidate.format === "theradent-backup"
    && candidate.version === 1
    && Boolean(candidate.tables);
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "not_authorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
    if (profile?.status !== "approved") return json({ error: "not_authorized" }, 403);

    const body = await req.json();
    if (body.action === "qr_get") {
      if (!["admin", "receptionist"].includes(profile.role)) return json({ error: "not_authorized" }, 403);
      const { data: existing } = await admin.from("patient_qr_tokens").select("token").eq("patient_id", body.patient_id).maybeSingle();
      if (existing?.token) return json({ token: existing.token });
      const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      const token = `TD-${Array.from(bytes, byte => chars[byte % chars.length]).join("")}`;
      const { error } = await admin.from("patient_qr_tokens").insert({ patient_id: body.patient_id, token, created_by: user.id });
      if (error) throw error;
      return json({ token });
    }

    if (body.action === "qr_resolve") {
      const token = String(body.token || "").trim().toUpperCase();
      const { data } = await admin.from("patient_qr_tokens").select("patient_id").eq("token", token).maybeSingle();
      return json({ patient_id: data?.patient_id || null });
    }

    if (profile.role !== "admin") return json({ error: "not_authorized" }, 403);
    if (body.action === "export") {
      const entries = await Promise.all(tables.map(async table => {
        const { data, error } = await admin.from(table).select("*");
        if (error) throw error;
        return [table, data || []];
      }));
      return json({ format: "theradent-backup", version: 1, exported_at: new Date().toISOString(), note: "Incluye información de clínica, agenda y expedientes; no incluye contraseñas, sesiones ni archivos binarios de Storage.", tables: Object.fromEntries(entries) });
    }

    const confirmation = String(body.confirmation || "").trim().toUpperCase();
    if (!["restore", "reset"].includes(body.action)) return json({ error: "invalid_action" }, 400);

    if (body.action === "reset" && confirmation !== "BORRAR TODO") return json({ error: "confirmation_required" }, 400);
    if (body.action === "restore" && confirmation !== "RESTAURAR TODO") return json({ error: "confirmation_required" }, 400);

    const backup = body.backup;
    if (body.action === "restore" && !isValidBackup(backup)) return json({ error: "invalid_backup" }, 400);

    if (body.action === "restore") {
      const { error } = await admin.rpc("restore_theradent_backup", { p_backup: backup });
      if (error) throw new Error(`No se pudo restaurar la copia: ${error.message}`);
      return json({ success: true });
    }

    const deleteColumn: Record<string, string> = {
      clinic_settings: "id",
      business_hours: "day_of_week",
      clinic_closures: "closed_on",
      blocked_slots: "slot_date",
      appointment_notes: "appointment_id",
      patient_clinical_records: "patient_id",
      patient_qr_tokens: "patient_id"
    };
    const tablesToClear = deleteOrder.filter(table => !["clinic_settings", "business_hours", "appointment_reasons", "treatment_catalog"].includes(table));

    for (const table of tablesToClear) {
      const { error } = await admin.from(table).delete().not(deleteColumn[table] || "id", "is", null);
      if (error) throw new Error(`No se pudo limpiar ${table}: ${error.message}`);
    }

    return json({ success: true });
  } catch (error) {
    console.error("system-maintenance failed", error);
    return json({ error: error instanceof Error ? error.message : "maintenance_failed" }, 500);
  }
});
