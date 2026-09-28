import type { BootstrapData, Goal, GoalContribution, Settings } from "./types";

async function readApiResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.text();
  let result: unknown;
  try {
    result = body ? JSON.parse(body) : null;
  } catch {
    const excerpt = body.replace(/\s+/g, " ").slice(0, 140);
    throw new Error(
      `The server returned a non-JSON response (${response.status}).${excerpt ? ` ${excerpt}` : " Check that the API route is deployed."}`,
    );
  }
  if (!response.ok) {
    const message = typeof result === "object" && result && "error" in result
      ? String((result as { error: unknown }).error)
      : fallback;
    throw new Error(message);
  }
  return result as T;
}

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

export async function getGoalFunding(goalId: number): Promise<GoalContribution[]> {
  const response = await fetch(`/api/goals/${goalId}/funding`);
  return readApiResponse<GoalContribution[]>(response, "Could not load goal funding history");
}

export async function addGoalFunding(
  goalId: number,
  funding: { amount: number; fundedOn: string; note: string },
): Promise<{ goal: Goal; contribution: GoalContribution }> {
  const response = await fetch(`/api/goals/${goalId}/funding`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(funding),
  });
  return readApiResponse<{ goal: Goal; contribution: GoalContribution }>(response, "Could not add funds to goal");
}

export async function setFavoriteCashflowPlan(incomeId: number, planId: number): Promise<{ incomeId: number; favorite_plan_id: number }> {
  const response = await fetch(`/api/cashflow/incomes/${incomeId}/favorite`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId }),
  });
  return readApiResponse(response, "Could not set favorite plan");
}
