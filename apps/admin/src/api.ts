const API_BASE = import.meta.env.VITE_API_BASE || "https://api.baseapp.asia";

export type TokenResponse = { access_token: string; token_type: string };

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = "Request failed";
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<TokenResponse>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: (token: string) => request<any>("/v1/auth/me", {}, token),
  dashboard: (token: string) => request<any>("/v1/dashboard", {}, token),
  services: (token: string) => request<any[]>("/v1/services", {}, token),
  createService: (token: string, body: unknown) =>
    request<any>("/v1/services", { method: "POST", body: JSON.stringify(body) }, token),
  customers: (token: string) => request<any[]>("/v1/customers", {}, token),
  createCustomer: (token: string, body: unknown) =>
    request<any>("/v1/customers", { method: "POST", body: JSON.stringify(body) }, token),
  bookings: (token: string) => request<any[]>("/v1/bookings", {}, token),
  createBooking: (token: string, body: unknown) =>
    request<any>("/v1/bookings", { method: "POST", body: JSON.stringify(body) }, token),
  updateBooking: (token: string, id: number, body: unknown) =>
    request<any>(`/v1/bookings/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token),
  conversations: (token: string) => request<any[]>("/v1/conversations", {}, token),
  vendors: (token: string) => request<any[]>("/v1/vendors", {}, token),
  createVendor: (token: string, body: unknown) =>
    request<any>("/v1/vendors", { method: "POST", body: JSON.stringify(body) }, token),
  updateVendor: (token: string, id: number, body: unknown) =>
    request<any>(`/v1/vendors/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token),
};
