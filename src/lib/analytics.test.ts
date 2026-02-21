import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetAnalyticsTransport,
  setAnalyticsTransport,
  trackEvent,
  type AnalyticsEvent,
} from "./analytics";

describe("analytics", () => {
  afterEach(() => {
    resetAnalyticsTransport();
  });

  it("sends shaped events through configured transport", () => {
    const transport = vi.fn();
    setAnalyticsTransport(transport);

    trackEvent("assignment_created", {
      requiredLineCount: 5,
      expectedStyle: "print",
    });

    expect(transport).toHaveBeenCalledTimes(1);

    const event = transport.mock.calls[0][0] as AnalyticsEvent;
    expect(event.name).toBe("assignment_created");
    expect(event.payload.requiredLineCount).toBe(5);
    expect(event.payload.expectedStyle).toBe("print");
    expect(event.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("does not throw when transport fails", () => {
    setAnalyticsTransport(() => {
      throw new Error("transport failed");
    });

    expect(() => {
      trackEvent("report_viewed", { reportId: "abc123" });
    }).not.toThrow();
  });
});
