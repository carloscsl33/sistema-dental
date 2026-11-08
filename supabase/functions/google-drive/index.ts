import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const appOrigin = "https://sistema-dental-mu.vercel.app";
const driveScope = "https://www.googleapis.com/auth/drive.file";

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": origin === appOrigin ? origin : appOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function json(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

function redirect(status: string) {
  return Response.redirect(`${appOrigin}/?drive=${encodeURIComponent(status)}#configuracion`, 303);
}

function bytesToBase64(bytes: Uint8Array) {
  let value = "";
  bytes.forEach(byte => { value += String.fromCharCode(byte); });
  return btoa(value);
}

function base64ToBytes(value: string) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

function randomState() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function environment() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const clientId = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET") || "";
  const tokenKey = Deno.env.get("GOOGLE_DRIVE_TOKEN_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !clientId || !clientSecret || !tokenKey) throw new Error("drive_not_configured");
  return { supabaseUrl, anonKey, serviceRoleKey, clientId, clientSecret, tokenKey };
}

async function encryptToken(value: unknown, secret: string) {
  const rawKey = base64ToBytes(secret);
  if (rawKey.length !== 32) throw new Error("invalid_token_key");
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { ciphertext: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
}

async function authenticatedAdmin(request: Request) {
  const env = environment();
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("not_authorized");
  const userClient = createClient(env.supabaseUrl, env.anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) throw new Error("not_authorized");
  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile } = await admin.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (profile?.status !== "approved" || profile.role !== "admin") throw new Error("not_authorized");
  return { env, admin, user };
}

async function googleDriveAccount(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return "";
  const data = await response.json();
  return String(data?.user?.emailAddress || "");
}

async function createRootFolder(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Thera-dent · Archivos clínicos", mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!response.ok) throw new Error("drive_folder_failed");
  const data = await response.json();
  if (!data?.id) throw new Error("drive_folder_failed");
  return String(data.id);
}

async function handleCallback(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (url.searchParams.get("error") || !state || !code) return redirect("denied");
  try {
    const env = environment();
    const admin = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const stateHash = await hash(state);
    const { data: oauthState } = await admin.from("google_drive_oauth_states").select("state_hash,user_id,expires_at").eq("state_hash", stateHash).maybeSingle();
    if (!oauthState || new Date(oauthState.expires_at).getTime() < Date.now()) return redirect("expired");
    const redirectUri = `${env.supabaseUrl}/functions/v1/google-drive`;
    const tokensResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: env.clientId, client_secret: env.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const tokens = await tokensResponse.json();
    if (!tokensResponse.ok || !tokens.refresh_token || !tokens.access_token) throw new Error("token_exchange_failed");
    const [folderId, accountEmail, encrypted] = await Promise.all([createRootFolder(tokens.access_token), googleDriveAccount(tokens.access_token), encryptToken(tokens, env.tokenKey)]);
    const { error } = await admin.from("google_drive_connection").upsert({ id: true, folder_id: folderId, account_email: accountEmail || null, token_ciphertext: encrypted.ciphertext, token_iv: encrypted.iv, connected_at: new Date().toISOString(), connected_by: oauthState.user_id });
    if (error) throw error;
    await admin.from("google_drive_oauth_states").delete().eq("state_hash", stateHash);
    return redirect("connected");
  } catch (error) {
    console.error("google-drive callback failed", error);
    return redirect("error");
  }
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method === "GET") return handleCallback(request);
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
  try {
    const { env, admin, user } = await authenticatedAdmin(request);
    const { action } = await request.json();
    if (action === "status") {
      const { data } = await admin.from("google_drive_connection").select("folder_id,account_email,connected_at").eq("id", true).maybeSingle();
      return json(request, { connected: Boolean(data), account_email: data?.account_email || "", connected_at: data?.connected_at || "" });
    }
    if (action === "connect") {
      const state = randomState();
      const stateHash = await hash(state);
      await admin.from("google_drive_oauth_states").delete().lt("expires_at", new Date().toISOString());
      const { error } = await admin.from("google_drive_oauth_states").insert({ state_hash: stateHash, user_id: user.id, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
      if (error) throw error;
      const redirectUri = `${env.supabaseUrl}/functions/v1/google-drive`;
      const params = new URLSearchParams({ client_id: env.clientId, redirect_uri: redirectUri, response_type: "code", scope: driveScope, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
      return json(request, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }
    if (action === "disconnect") {
      const { error } = await admin.from("google_drive_connection").delete().eq("id", true);
      if (error) throw error;
      return json(request, { success: true });
    }
    return json(request, { error: "invalid_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "drive_failed";
    const status = ["not_authorized"].includes(message) ? 403 : message === "drive_not_configured" ? 503 : 500;
    return json(request, { error: message }, status);
  }
});
