import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://sistema-dental-mu.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://sistema-dental-mu.vercel.app",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function response(request: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

function passwordIsStrong(password: string) {
  const groups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z\d]/]
    .filter((rule) => rule.test(password)).length;
  return password.length >= 12 && groups >= 3;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return response(request, 405, { error: "Método no permitido." });

  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return response(request, 401, { error: "Sesión requerida." });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return response(request, 500, { error: "Configuración de servidor incompleta." });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return response(request, 401, { error: "Sesión inválida." });

    const { password } = await request.json();
    if (typeof password !== "string" || !passwordIsStrong(password)) {
      return response(request, 400, { error: "La contraseña no cumple los requisitos de seguridad." });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: targetResult, error: targetError } = await admin.auth.admin.getUserById(user.id);
    const target = targetResult.user;
    if (targetError || !target || target.app_metadata?.pending_invite_setup !== true) {
      return response(request, 403, { error: "Esta invitación ya no está disponible." });
    }

    const { error: updateUserError } = await admin.auth.admin.updateUserById(user.id, {
      password,
      app_metadata: { ...target.app_metadata, pending_invite_setup: false },
    });
    if (updateUserError) throw updateUserError;

    const { error: profileError } = await admin.from("profiles").update({ status: "approved" }).eq("id", user.id);
    if (profileError) throw profileError;
    return response(request, 200, { success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo completar la invitación.";
    return response(request, 400, { error: message });
  }
});
