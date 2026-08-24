export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("pp_token") : null;
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `HTTP ${res.status}`);
  return data as T;
}
