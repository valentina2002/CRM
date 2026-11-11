import { parse } from "yaml";

// Turns docs/openapi.yaml into the simple structure the /docs/api page renders. Pure: the page reads the file.

type Json = Record<string, unknown>;

export type DocParam = { name: string; in: string; required: boolean; type: string; description: string | null };
export type DocOperation = {
  id: string;
  method: string;
  path: string;
  summary: string;
  description: string | null;
  params: DocParam[];
  requestExample: string | null;
  bodyRequired: boolean;
  responses: { code: string; description: string }[];
};
export type DocGroup = { tag: string; operations: DocOperation[] };
export type ApiDoc = {
  title: string;
  version: string;
  description: string;
  groups: DocGroup[];
  webhook: { description: string; example: string | null } | null;
};

const METHODS = ["get", "post", "put", "patch", "delete"] as const;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : null);

function resolve(root: Json, node: unknown): Json {
  let current = node;
  for (let i = 0; i < 10 && isObj(current) && typeof current.$ref === "string"; i++) {
    const path = current.$ref.replace(/^#\//, "").split("/");
    current = path.reduce<unknown>((acc, key) => (isObj(acc) ? acc[key] : undefined), root);
  }
  return isObj(current) ? current : {};
}

function typeOf(root: Json, schema: unknown): string {
  const s = resolve(root, schema);
  if (Array.isArray(s.enum)) return s.enum.filter((v) => v !== null).join(" | ");
  const t = Array.isArray(s.type) ? s.type.filter((x) => x !== "null").join(" | ") : str(s.type);
  if (t === "array") return `${typeOf(root, s.items)}[]`;
  return t ?? "object";
}

function jsonExample(root: Json, content: unknown): string | null {
  const media = resolve(root, isObj(content) ? content["application/json"] : undefined);
  const example = media.example ?? resolve(root, media.schema).example;
  return example === undefined ? null : JSON.stringify(example, null, 2);
}

export function buildApiDoc(yamlText: string): ApiDoc {
  const root = parse(yamlText) as Json;
  const info = resolve(root, root.info);
  const tagOrder = (Array.isArray(root.tags) ? root.tags : []).map((t) => str(resolve(root, t).name)).filter((t): t is string => Boolean(t));
  const groups = new Map<string, DocOperation[]>(tagOrder.map((t) => [t, []]));

  for (const [path, rawItem] of Object.entries(resolve(root, root.paths))) {
    const item = resolve(root, rawItem);
    const shared = Array.isArray(item.parameters) ? item.parameters : [];
    for (const method of METHODS) {
      if (!isObj(item[method])) continue;
      const op = item[method] as Json;
      const params = [...shared, ...(Array.isArray(op.parameters) ? op.parameters : [])].map((p) => {
        const param = resolve(root, p);
        return {
          name: str(param.name) ?? "",
          in: str(param.in) ?? "query",
          required: param.required === true,
          type: typeOf(root, param.schema),
          description: str(param.description),
        };
      });
      const body = resolve(root, op.requestBody);
      const responses = Object.entries(resolve(root, op.responses)).map(([code, r]) => ({ code, description: str(resolve(root, r).description) ?? "" }));
      const tag = (Array.isArray(op.tags) && str(op.tags[0])) || "Otros";
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag)!.push({
        id: `${method}-${path}`.replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "").toLowerCase(),
        method: method.toUpperCase(),
        path,
        summary: str(op.summary) ?? "",
        description: str(op.description),
        params,
        requestExample: jsonExample(root, body.content),
        bodyRequired: body.required === true,
        responses,
      });
    }
  }

  const hook = Object.values(resolve(root, root.webhooks))
    .map((w) => resolve(root, resolve(root, w).post))
    .find((p) => Object.keys(p).length > 0);

  return {
    title: str(info.title) ?? "API",
    version: str(info.version) ?? "",
    description: str(info.description) ?? "",
    groups: [...groups].filter(([, ops]) => ops.length).map(([tag, operations]) => ({ tag, operations })),
    webhook: hook ? { description: str(hook.description) ?? "", example: jsonExample(root, resolve(root, hook.requestBody).content) } : null,
  };
}
