export type AnalyticsEventName =
  | "assignment_created"
  | "submission_started"
  | "grading_completed"
  | "report_link_generated"
  | "report_viewed";

export interface AnalyticsEventPayload {
  [key: string]: string | number | boolean | null | undefined;
}

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  payload: AnalyticsEventPayload;
  occurredAt: string;
}

export type AnalyticsTransport = (event: AnalyticsEvent) => void | Promise<void>;

const defaultTransport: AnalyticsTransport = (event) => {
  if (typeof window !== "undefined" && typeof console !== "undefined") {
    console.warn("[analytics]", event);
  }
};

let activeTransport: AnalyticsTransport = defaultTransport;

export function setAnalyticsTransport(transport: AnalyticsTransport): void {
  activeTransport = transport;
}

export function resetAnalyticsTransport(): void {
  activeTransport = defaultTransport;
}

export function trackEvent(
  name: AnalyticsEventName,
  payload: AnalyticsEventPayload = {}
): void {
  const event: AnalyticsEvent = {
    name,
    payload,
    occurredAt: new Date().toISOString(),
  };

  try {
    const result = activeTransport(event);
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch(() => {
        // Intentionally swallow analytics transport failures.
      });
    }
  } catch {
    // Intentionally swallow analytics transport failures.
  }
}
