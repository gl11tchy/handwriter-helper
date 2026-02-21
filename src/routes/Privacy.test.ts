import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Privacy from "./Privacy";

describe("Privacy route", () => {
  it("renders the privacy heading and core guarantees", () => {
    const html = renderToStaticMarkup(createElement(Privacy));

    expect(html).toContain("Privacy");
    expect(html).toContain("not uploaded");
    expect(html).toContain("encrypted");
  });
});
