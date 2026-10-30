import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type AppRole = "admin" | "receptionist" | "doctor";
type ProfileStatus = "approved" | "blocked";

const allowedOrigins = new Set([
  "https://sistema-dental-mu.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const validRoles = new Set<AppRole>(["admin", "receptionist", "doctor"]);
const validStatuses = new Set<ProfileStatus>(["approved", "blocked"]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://sistema-dental-mu.vercel.app",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function safeAppOrigin(request: Request) {
  const origin = request.headers.get("origin") || "";
  return allowedOrigins.has(origin)
    ? origin
    : "https://sistema-dental-mu.vercel.app";
}

function reply(
  request: Request,
  status: number,
  body: Record<string, unknown>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request),
  });
}

function cleanEmail(value: unknown) {
  const email = String(value || "")
    .trim()
    .toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    throw new Error("Correo inválido.");
  }
  return email;
}

function cleanName(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function getRole(value: unknown): AppRole {
  if (!validRoles.has(value as AppRole)) throw new Error("Rol inválido.");
  return value as AppRole;
}

function getStatus(value: unknown): ProfileStatus {
  if (!validStatuses.has(value as ProfileStatus))
    throw new Error("Estado inválido.");
  return value as ProfileStatus;
}

async function audit(
  admin: ReturnType<typeof createClient>,
  actorId: string,
  action: string,
  targetId: string,
  details: Record<string, unknown>,
) {
  await admin.from("audit_log").insert({
    user_id: actorId,
    table_name: "profiles",
    row_id: targetId,
    action,
    new_data: details,
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST")
    return reply(request, 405, { error: "Método no permitido." });

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    return reply(request, 401, { error: "Sesión requerida." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey || !anonKey)
    return reply(request, 500, {
      error: "Configuración de servidor incompleta.",
    });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.slice("Bearer ".length);
  const { data: userResult, error: userError } =
    await admin.auth.getUser(token);
  const actor = userResult.user;
  if (userError || !actor)
    return reply(request, 401, { error: "Sesión inválida." });

  const { data: actorProfile, error: profileError } = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", actor.id)
    .maybeSingle();
  if (
    profileError ||
    actorProfile?.status !== "approved" ||
    actorProfile.role !== "admin"
  ) {
    return reply(request, 403, {
      error: "No tienes permiso para administrar usuarios.",
    });
  }

  try {
    const body = await request.json();
    const action = String(body?.action || "");

    if (action === "list") {
      const { data, error } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (error) throw error;
      const userIds = data.users.map((user) => user.id);
      const { data: profiles, error: profilesError } = userIds.length
        ? await admin
            .from("profiles")
            .select("id, full_name, role, status, created_at")
            .in("id", userIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;
      const profileById = new Map(
        (profiles || []).map((profile) => [profile.id, profile]),
      );
      const users = data.users
        .map((user) => {
          const profile = profileById.get(user.id);
          return {
            id: user.id,
            email: user.email || "",
            fullName: profile?.full_name || "",
            role: profile?.role || "receptionist",
            status: profile?.status || "blocked",
            createdAt: profile?.created_at || user.created_at,
            lastSignInAt: user.last_sign_in_at || null,
            isCurrentUser: user.id === actor.id,
          };
        })
        .sort((a, b) => a.email.localeCompare(b.email, "es"));
      return reply(request, 200, { users });
    }

    if (action === "invite") {
      const email = cleanEmail(body.email);
      const fullName = cleanName(body.fullName);
      const role = getRole(body.role);
      const redirectTo = `${safeAppOrigin(request)}/`;
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: fullName ? { full_name: fullName } : {},
        redirectTo,
      });
      if (error || !data.user)
        throw error || new Error("No se pudo invitar al usuario.");
      const { error: updateError } = await admin
        .from("profiles")
        .update({ role, status: "approved", full_name: fullName || email })
        .eq("id", data.user.id);
      if (updateError) throw updateError;
      await audit(admin, actor.id, "USER_INVITED", data.user.id, {
        email,
        role,
      });
      return reply(request, 201, { message: "Invitación enviada." });
    }

    const targetId = String(body.userId || "");
    if (!/^[0-9a-f-]{36}$/i.test(targetId))
      throw new Error("Usuario inválido.");
    const { data: targetUser, error: targetError } =
      await admin.auth.admin.getUserById(targetId);
    if (targetError || !targetUser.user)
      throw targetError || new Error("Usuario no encontrado.");
    const { data: targetProfile, error: targetProfileError } = await admin
      .from("profiles")
      .select("role, status")
      .eq("id", targetId)
      .single();
    if (targetProfileError || !targetProfile)
      throw targetProfileError || new Error("Perfil no encontrado.");

    if (action === "update") {
      const role = getRole(body.role);
      const status = getStatus(body.status);
      if (
        targetId === actor.id &&
        (role !== "admin" || status !== "approved")
      ) {
        throw new Error("No puedes reducir ni suspender tu propia cuenta.");
      }
      if (
        targetProfile.role === "admin" &&
        targetProfile.status === "approved" &&
        (role !== "admin" || status !== "approved")
      ) {
        const { count, error: countError } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .eq("status", "approved");
        if (countError) throw countError;
        if ((count || 0) <= 1)
          throw new Error("Debe permanecer al menos un administrador activo.");
      }
      const { error } = await admin
        .from("profiles")
        .update({ role, status })
        .eq("id", targetId);
      if (error) throw error;
      await audit(admin, actor.id, "USER_UPDATED", targetId, {
        email: targetUser.user.email || "",
        role,
        status,
      });
      return reply(request, 200, { message: "Usuario actualizado." });
    }

    if (action === "reset_password") {
      const email = targetUser.user.email;
      if (!email) throw new Error("El usuario no tiene un correo disponible.");
      const redirectTo = `${safeAppOrigin(request)}/?recovery=1`;
      const recovery = await fetch(`${supabaseUrl}/auth/v1/recover`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirect_to: redirectTo }),
      });
      if (!recovery.ok)
        throw new Error(
          "No se pudo enviar el enlace. Intenta de nuevo más tarde.",
        );
      await audit(admin, actor.id, "PASSWORD_RESET_SENT", targetId, { email });
      return reply(request, 200, {
        message: "Enlace de restablecimiento enviado.",
      });
    }

    if (action === "delete") {
      const confirmationEmail = cleanEmail(body.confirmEmail);
      const targetEmail = String(targetUser.user.email || "").toLowerCase();
      if (targetId === actor.id)
        throw new Error("No puedes eliminar tu propia cuenta.");
      if (confirmationEmail !== targetEmail)
        throw new Error("El correo de confirmación no coincide.");
      if (
        targetProfile.role === "admin" &&
        targetProfile.status === "approved"
      ) {
        const { count, error: countError } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .eq("status", "approved");
        if (countError) throw countError;
        if ((count || 0) <= 1)
          throw new Error("Debe permanecer al menos un administrador activo.");
      }
      await audit(admin, actor.id, "USER_DELETED", targetId, {
        email: targetEmail,
        role: targetProfile.role,
      });
      const { error } = await admin.auth.admin.deleteUser(targetId);
      if (error) throw error;
      return reply(request, 200, { message: "Usuario eliminado." });
    }

    return reply(request, 400, { error: "Acción no válida." });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo completar la operación.";
    return reply(request, 400, { error: message });
  }
});
