import type { BootstrapData, Settings } from "./types";

export async function getBootstrap(): Promise<BootstrapData> {
  const response = await fetch("/api/bootstrap");
  if (!response.ok) throw new Error("Could not load workspace data");
  return response.json();
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
