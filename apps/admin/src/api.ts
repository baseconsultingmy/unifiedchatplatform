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
  bookings: (token: string, params?: { from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    const suffix = q.toString() ? `?${q}` : "";
    return request<any[]>(`/v1/bookings${suffix}`, {}, token);
  },
  createBooking: (token: string, body: unknown) =>
    request<any>("/v1/bookings", { method: "POST", body: JSON.stringify(body) }, token),
  updateBooking: (token: string, id: number, body: unknown) =>
    request<any>(`/v1/bookings/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token),
  posSale: (token: string, body: unknown) =>
    request<any>("/v1/pos/sale", { method: "POST", body: JSON.stringify(body) }, token),
  workspace: (token: string) => request<any>("/v1/workspace", {}, token),
  updateWorkspace: (token: string, body: unknown) =>
    request<any>("/v1/workspace", { method: "PATCH", body: JSON.stringify(body) }, token),
  payStatus: (tokenOrPayToken: string) =>
    request<{
      booking_id: number;
      status: string;
      payment_status: string;
      paid_at: string | null;
      amount_due: number;
      currency: string;
      payment_url: string | null;
      service_name: string | null;
    }>(`/pay/${tokenOrPayToken}/status`),
  conversations: (token: string) => request<any[]>("/v1/conversations", {}, token),
  conversation: (token: string, id: number) => request<any>(`/v1/conversations/${id}`, {}, token),
  sendMessage: (token: string, id: number, body: string) =>
    request<any>(
      `/v1/conversations/${id}/messages`,
      { method: "POST", body: JSON.stringify({ body }) },
      token,
    ),
  vendors: (token: string) => request<any[]>("/v1/vendors", {}, token),
  createVendor: (token: string, body: unknown) =>
    request<any>("/v1/vendors", { method: "POST", body: JSON.stringify(body) }, token),
  updateVendor: (token: string, id: number, body: unknown) =>
    request<any>(`/v1/vendors/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token),
  viewAsVendor: (token: string, id: number) =>
    request<{ access_token: string; impersonating: boolean; vendor_name?: string }>(
      `/v1/vendors/${id}/view-as`,
      { method: "POST" },
      token,
    ),
};
