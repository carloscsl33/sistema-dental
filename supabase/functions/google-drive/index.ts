import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const appOrigin = "https://sistema-dental-mu.vercel.app";
const driveScope = "https://www.googleapis.com/auth/drive.file";
const driveFolderMime = "application/vnd.google-apps.folder";
const maxFileSize = 10 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
type DriveTokens = { access_token: string; refresh_token: string; expires_at?: number };

function corsHeaders(request: Request, contentType = "application/json") {
  const origin = request.headers.get("origin") || "";
  return { "Access-Control-Allow-Origin": origin === appOrigin ? origin : appOrigin, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": contentType, "Vary": "Origin" };
}
function json(request: Request, body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) }); }
function redirect(status: string) { return Response.redirect(`${appOrigin}/?drive=${encodeURIComponent(status)}#configuracion`, 303); }
function bytesToBase64(bytes: Uint8Array) { let value = ""; bytes.forEach(byte => { value += String.fromCharCode(byte); }); return btoa(value); }
function base64ToBytes(value: string) { const decoded = atob(value); return Uint8Array.from(decoded, char => char.charCodeAt(0)); }
async function hash(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return bytesToBase64(new Uint8Array(digest)); }
function randomState() { return bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }

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
async function encryptionKey(secret: string, usage: KeyUsage[]) {
  const rawKey = base64ToBytes(secret); if (rawKey.length !== 32) throw new Error("invalid_token_key");
  return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, usage);
}
async function encryptToken(value: unknown, secret: string) {
  const key = await encryptionKey(secret, ["encrypt"]); const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { ciphertext: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
}
async function decryptToken(ciphertext: string, iv: string, secret: string): Promise<DriveTokens> {
  const key = await encryptionKey(secret, ["decrypt"]);
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, key, base64ToBytes(ciphertext));
  const token = JSON.parse(new TextDecoder().decode(raw));
  if (!token?.access_token || !token?.refresh_token) throw new Error("invalid_drive_token");
  return token;
}
function adminClient(env = environment()) { return createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }); }
async function authenticatedUser(request: Request, allowedRoles = ["admin", "receptionist", "doctor"]) {
  const env = environment(); const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("not_authorized");
  const userClient = createClient(env.supabaseUrl, env.anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) throw new Error("not_authorized");
  const admin = adminClient(env); const { data: profile } = await admin.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (profile?.status !== "approved" || !allowedRoles.includes(profile.role)) throw new Error("not_authorized");
  return { env, admin, user };
}
function cleanName(value: string, fallback: string) { const cleaned = String(value || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim(); return (cleaned || fallback).slice(0, 120); }
function fileMimeType(file: File) {
  if (allowedMimeTypes.has(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const byExtension: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  return byExtension[extension] || '';
}
async function googleDriveAccount(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return ""; const data = await response.json(); return String(data?.user?.emailAddress || "");
}
async function createRootFolder(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Thera-dent · Archivos clínicos", mimeType: driveFolderMime }) });
  if (!response.ok) throw new Error("drive_folder_failed"); const data = await response.json(); if (!data?.id) throw new Error("drive_folder_failed"); return String(data.id);
}
async function refreshAccessToken(env: ReturnType<typeof environment>, tokens: DriveTokens): Promise<DriveTokens> {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.clientId, client_secret: env.clientSecret, refresh_token: tokens.refresh_token, grant_type: "refresh_token" }) });
  const refreshed = await response.json(); if (!response.ok || !refreshed?.access_token) throw new Error("drive_refresh_failed");
  return { ...tokens, access_token: refreshed.access_token, expires_at: Date.now() + (Number(refreshed.expires_in) || 3600) * 1000 };
}
async function driveAccess(admin: ReturnType<typeof adminClient>, env: ReturnType<typeof environment>) {
  const { data: connection } = await admin.from("google_drive_connection").select("folder_id,token_ciphertext,token_iv").eq("id", true).maybeSingle();
  if (!connection) return null; let tokens = await decryptToken(connection.token_ciphertext, connection.token_iv, env.tokenKey);
  if (!tokens.expires_at || tokens.expires_at < Date.now() + 60_000) {
    tokens = await refreshAccessToken(env, tokens); const encrypted = await encryptToken(tokens, env.tokenKey);
    const { error } = await admin.from("google_drive_connection").update({ token_ciphertext: encrypted.ciphertext, token_iv: encrypted.iv }).eq("id", true); if (error) throw error;
  }
  return { folderId: connection.folder_id, accessToken: tokens.access_token };
}
async function driveJson(accessToken: string, url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(url, { ...init, headers }); if (!response.ok) throw new Error("drive_request_failed"); return response.json();
}
async function patientFolder(accessToken: string, rootFolderId: string, patientId: string, patientName: string) {
  const folderName = cleanName(`Expediente · ${patientName} · ${patientId.slice(0, 8)}`, `Expediente · ${patientId.slice(0, 8)}`);
  const escapedName = folderName.replaceAll("'", "\\'"); const query = encodeURIComponent(`name = '${escapedName}' and '${rootFolderId}' in parents and mimeType = '${driveFolderMime}' and trashed = false`);
  const listed = await driveJson(accessToken, `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  if (listed?.files?.[0]?.id) return String(listed.files[0].id);
  const created = await driveJson(accessToken, "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: folderName, mimeType: driveFolderMime, parents: [rootFolderId] }) });
  if (!created?.id) throw new Error("drive_patient_folder_failed"); return String(created.id);
}
async function uploadDriveFile(accessToken: string, folderId: string, file: File, mimeType: string) {
  const boundary = `theradent-${crypto.randomUUID()}`; const metadata = JSON.stringify({ name: cleanName(file.name, "archivo"), parents: [folderId] });
  const prefix = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const bytes = new Uint8Array(await file.arrayBuffer()); const suffix = new TextEncoder().encode(`\r\n--${boundary}--`); const body = new Uint8Array(prefix.length + bytes.length + suffix.length);
  body.set(prefix); body.set(bytes, prefix.length); body.set(suffix, prefix.length + bytes.length);
  const result = await driveJson(accessToken, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
  if (!result?.id) throw new Error("drive_upload_failed"); return String(result.id);
}
async function handleCallback(request: Request) {
  const url = new URL(request.url); const state = url.searchParams.get("state") || ""; const code = url.searchParams.get("code") || "";
  if (url.searchParams.get("error") || !state || !code) return redirect("denied");
  try {
    const env = environment(); const admin = adminClient(env); const stateHash = await hash(state);
    const { data: oauthState } = await admin.from("google_drive_oauth_states").select("state_hash,user_id,expires_at").eq("state_hash", stateHash).maybeSingle();
    if (!oauthState || new Date(oauthState.expires_at).getTime() < Date.now()) return redirect("expired");
    const redirectUri = `${env.supabaseUrl}/functions/v1/google-drive`;
    const tokensResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env.clientId, client_secret: env.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
    const responseTokens = await tokensResponse.json(); if (!tokensResponse.ok || !responseTokens.refresh_token || !responseTokens.access_token) throw new Error("token_exchange_failed");
    const tokens: DriveTokens = { ...responseTokens, expires_at: Date.now() + (Number(responseTokens.expires_in) || 3600) * 1000 };
    const [folderId, accountEmail, encrypted] = await Promise.all([createRootFolder(tokens.access_token), googleDriveAccount(tokens.access_token), encryptToken(tokens, env.tokenKey)]);
    const { error } = await admin.from("google_drive_connection").upsert({ id: true, folder_id: folderId, account_email: accountEmail || null, token_ciphertext: encrypted.ciphertext, token_iv: encrypted.iv, connected_at: new Date().toISOString(), connected_by: oauthState.user_id });
    if (error) throw error; await admin.from("google_drive_oauth_states").delete().eq("state_hash", stateHash); return redirect("connected");
  } catch (error) { console.error("google-drive callback failed", error); return redirect("error"); }
}
async function requestPayload(request: Request) { return (request.headers.get("content-type") || "").includes("multipart/form-data") ? request.formData() : request.json(); }

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method === "GET") return handleCallback(request);
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
  try {
    const payload = await requestPayload(request); const action = String(payload instanceof FormData ? payload.get("action") : payload.action || "");
    const adminOnly = ["status", "connect", "disconnect"].includes(action); const { env, admin, user } = await authenticatedUser(request, adminOnly ? ["admin"] : ["admin", "receptionist", "doctor"]);
    if (action === "status") { const { data } = await admin.from("google_drive_connection").select("folder_id,account_email,connected_at").eq("id", true).maybeSingle(); return json(request, { connected: Boolean(data), account_email: data?.account_email || "", connected_at: data?.connected_at || "" }); }
    if (action === "connect") {
      const state = randomState(); const stateHash = await hash(state); await admin.from("google_drive_oauth_states").delete().lt("expires_at", new Date().toISOString());
      const { error } = await admin.from("google_drive_oauth_states").insert({ state_hash: stateHash, user_id: user.id, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() }); if (error) throw error;
      const redirectUri = `${env.supabaseUrl}/functions/v1/google-drive`; const params = new URLSearchParams({ client_id: env.clientId, redirect_uri: redirectUri, response_type: "code", scope: driveScope, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state }); return json(request, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }
    if (action === "disconnect") { const { error } = await admin.from("google_drive_connection").delete().eq("id", true); if (error) throw error; return json(request, { success: true }); }
    const access = await driveAccess(admin, env); if (!access) return json(request, { use_supabase: true });
    if (action === "upload") {
      if (!(payload instanceof FormData)) return json(request, { error: "invalid_upload" }, 400);
      const file = payload.get("file"); const patientId = String(payload.get("patient_id") || ""); const patientName = String(payload.get("patient_name") || ""); const mimeType = file instanceof File ? fileMimeType(file) : '';
      if (!(file instanceof File) || !/^[0-9a-f-]{36}$/i.test(patientId) || !patientName || file.size < 1 || file.size > maxFileSize || !mimeType) return json(request, { error: "invalid_upload" }, 400);
      const folderId = await patientFolder(access.accessToken, access.folderId, patientId, patientName); const externalFileId = await uploadDriveFile(access.accessToken, folderId, file, mimeType);
      return json(request, { provider: "google_drive", external_file_id: externalFileId, drive_folder_id: folderId, storage_path: `drive:${externalFileId}` });
    }
    if (action === "download") {
      const id = String(payload instanceof FormData ? payload.get("file_id") : payload.file_id || ""); const { data: file } = await admin.from("patient_files").select("external_file_id,mime_type,file_name").eq("id", id).eq("storage_provider", "google_drive").maybeSingle();
      if (!file?.external_file_id) return json(request, { error: "file_not_found" }, 404);
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.external_file_id)}?alt=media`, { headers: { Authorization: `Bearer ${access.accessToken}` } });
      if (!response.ok || !response.body) return json(request, { error: "drive_download_failed" }, 502);
      return new Response(response.body, { headers: { ...corsHeaders(request, file.mime_type || "application/octet-stream"), "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.file_name || "archivo")}` } });
    }
    if (action === "delete_files") {
      const ids = Array.isArray(payload instanceof FormData ? [] : payload.file_ids) ? payload.file_ids.map((id: unknown) => String(id)).filter(Boolean).slice(0, 100) : [];
      if (!ids.length) return json(request, { success: true }); const { data: files, error } = await admin.from("patient_files").select("id,external_file_id").in("id", ids).eq("storage_provider", "google_drive"); if (error) throw error;
      if ((files || []).length !== ids.length) return json(request, { error: "file_not_found" }, 404);
      for (const file of files || []) { const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.external_file_id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${access.accessToken}` } }); if (!response.ok && response.status !== 404) throw new Error("drive_delete_failed"); }
      return json(request, { success: true });
    }
    return json(request, { error: "invalid_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "drive_failed"; const status = message === "not_authorized" ? 403 : message === "drive_not_configured" ? 503 : 500;
    console.error("google-drive request failed", message); return json(request, { error: message }, status);
  }
});
