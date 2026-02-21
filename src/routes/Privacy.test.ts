import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Privacy from "./Privacy";

describe("Privacy route", () => {
  it("documents both decryption-key handling flows", () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, undefined, createElement(Privacy))
    );

    expect(html).toContain("Privacy");
    expect(html).toContain("standard flow");
    expect(html).toContain("email notifications are enabled");
    expect(html).toContain("stored report blobs remain encrypted");
  });
});
