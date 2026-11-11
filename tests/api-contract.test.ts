import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApiDoc } from "@/lib/api/openapi-doc";

// The /api/v1 route files and docs/openapi.yaml must describe the same API.

const root = join(__dirname, "..");
const v1 = join(root, "src", "app", "api", "v1");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? routeFiles(full) : name === "route.ts" ? [full] : [];
  });
}

const implemented = routeFiles(v1)
  .flatMap((file) => {
    const path = "/" + relative(v1, file).split(sep).slice(0, -1).join("/").replace(/\[(\w+)\]/g, "{$1}");
    const methods = [...readFileSync(file, "utf8").matchAll(/export const (GET|POST|PUT|PATCH|DELETE) =/g)].map((m) => m[1]);
    return methods.map((m) => `${m} ${path}`);
  })
  .sort();

const doc = buildApiDoc(readFileSync(join(root, "docs", "openapi.yaml"), "utf8"));
const documented = doc.groups.flatMap((g) => g.operations.map((o) => `${o.method} ${o.path}`)).sort();

describe("API contract (openapi.yaml ↔ src/app/api/v1)", () => {
  it("documents exactly the implemented routes", () => {
    expect(implemented.length).toBeGreaterThan(10);
    expect(documented).toEqual(implemented);
  });

  it("every operation has a summary and a success response", () => {
    for (const g of doc.groups) {
      for (const op of g.operations) {
        expect(op.summary, `${op.method} ${op.path}`).not.toBe("");
        expect(op.responses.some((r) => r.code.startsWith("2")), `${op.method} ${op.path}`).toBe(true);
      }
    }
  });

  it("documents the outgoing webhook with an example", () => {
    expect(doc.webhook?.description).toContain("X-CRM-Signature");
    expect(JSON.parse(doc.webhook?.example ?? "{}").type).toBe("invoice.paid");
  });
});
