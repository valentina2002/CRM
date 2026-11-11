import { describe, expect, it } from "vitest";
import { automationInputSchema } from "./automation-engine";
import { AUTOMATION_TEMPLATES } from "./automation-templates";

describe("automation templates", () => {
  it.each(AUTOMATION_TEMPLATES.map((t) => [t.key, t] as const))("%s is a valid automation", (_, t) => {
    expect(automationInputSchema.safeParse(t.automation).error?.issues).toBeUndefined();
  });
  it("keys are unique and URL-safe", () => {
    const keys = AUTOMATION_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z-]{1,40}$/);
  });
});
