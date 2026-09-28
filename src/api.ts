import type { BootstrapData, Settings } from "./types";

export async function getBootstrap(): Promise<BootstrapData> {
  const response = await fetch("/api/bootstrap");
  if (!response.ok) throw new Error("Could not load workspace data");
  return response.json();
}

export type AuthUser = { id: number; email: string };
export async function getAuthSession(): Promise<AuthUser | null> {
  const response = await fetch("/api/auth/session");
  if (!response.ok) throw new Error("Could not check session");
  return (await response.json()).user;
}
export async function authenticateAccount(mode: "login" | "register", email: string, password: string) {
  const response = await fetch(`/api/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not authenticate");
  return result.user as AuthUser;
}
export async function logoutAccount() {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error("Could not sign out");
}
export async function changePassword(currentPassword: string, newPassword: string) {
  const response = await fetch("/api/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not change password");
}

export async function createRecord(
  endpoint: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch(`/api/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Could not save record");
  return response.json();
}

export async function updateRecord(
  endpoint: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch(`/api/${endpoint}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Could not update record");
  return response.json();
}

export async function patchRecord(
  endpoint: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch(`/api/${endpoint}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Could not update record");
  return response.json();
}

export async function deleteRecord(endpoint: string) {
  const response = await fetch(`/api/${endpoint}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Could not delete record");
}

export async function updateSettings(settings: Settings) {
  const response = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) throw new Error("Could not save settings");
  return response.json() as Promise<Settings>;
}
