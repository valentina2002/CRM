import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildApiDoc } from "./openapi-doc";

/** docs/openapi.yaml parsed for the docs page. Cached: the file only changes with a deploy. */
export async function loadApiDoc() {
  "use cache";
  const text = await readFile(path.join(process.cwd(), "docs", "openapi.yaml"), "utf8");
  return buildApiDoc(text);
}
