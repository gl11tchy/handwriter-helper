import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Privacy from "./Privacy";

describe("Privacy route", () => {
  it("documents both decryption-key handling flows", () => {
    const html = renderToStaticMarkup(createElement(Privacy));

    expect(html).toContain("Privacy");
    expect(html).toContain("Decryption keys stay in the URL fragment by default");
    expect(html).toContain("When email notifications are enabled");
    expect(html).toContain("Report blobs remain encrypted");
  });
});
