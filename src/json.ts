import type { ZodType, ZodTypeDef } from "zod";

/** Agents often wrap JSON in prose or code fences; accept the first JSON object found. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fall through
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("No JSON object found");
}

export class ValidationError extends Error {
  constructor(
    readonly label: string,
    readonly details: string[],
  ) {
    super(`${label} is invalid:\n${details.map((d) => `  - ${d}`).join("\n")}`);
  }
}

export function parseWith<T>(schema: ZodType<T, ZodTypeDef, unknown>, text: string, label: string): T {
  let data: unknown;
  try {
    data = extractJson(text);
  } catch (e) {
    throw new ValidationError(label, [`not valid JSON: ${(e as Error).message}`]);
  }
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new ValidationError(
      label,
      r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    );
  }
  return r.data;
}
