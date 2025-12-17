const API_BASE = "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" })) as { error?: string };
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

export const api = {
  getUser: () => request<import("@/types").UserData>("/api/user"),

  createCheckoutSession: () =>
    request<{ url: string }>("/api/stripe/checkout", { method: "POST" }),

  createPortalSession: () =>
    request<{ url: string }>("/api/stripe/portal", { method: "POST" }),
};
