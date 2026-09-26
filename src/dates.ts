export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateKeyFromValue(value: string) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return localDateKey(parsed);
  return String(value || "").slice(0, 10);
}
