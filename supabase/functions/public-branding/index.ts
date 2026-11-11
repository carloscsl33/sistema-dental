import { createClient } from "jsr:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=60"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: settings, error } = await admin
      .from("clinic_settings")
      .select("clinic_name, logo_path")
      .eq("id", true)
      .maybeSingle();
    if (error) throw error;

    let logoUrl = "";
    const logoPath = String(settings?.logo_path || "").trim();
    if (logoPath) {
      const { data, error: logoError } = await admin.storage
        .from("clinic-assets")
        .createSignedUrl(logoPath, 60 * 10);
      if (!logoError) logoUrl = data?.signedUrl || "";
    }

    return new Response(JSON.stringify({
      clinic_name: String(settings?.clinic_name || "Thera-dent"),
      logo_url: logoUrl
    }), { headers: { ...headers, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("No se pudo cargar la identidad pública de la clínica.", error);
    return new Response(JSON.stringify({ error: "branding_unavailable" }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }
});
