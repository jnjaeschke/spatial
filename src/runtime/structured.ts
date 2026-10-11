import type { LlmSelection } from "../shared/types.ts";
import type { LlmPrompt, LlmRunResult } from "./llm/types.ts";

/** The JSON schema subset task schemas use. */
export interface JsonSchema { type?: string | string[]; enum?: unknown[]; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema; anyOf?: JsonSchema[]; minimum?: number; maximum?: number; minItems?: number; maxItems?: number; [key: string]: unknown }

const typeOf = (value: unknown) => value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;

/** Where `value` breaks `schema`: types (`integer` included), `enum`, `required`, nested `properties` and `items`, `anyOf`, numeric and length bounds. `additionalProperties` is not checked. */
export function schemaErrors(schema: JsonSchema, value: unknown, path = "$"): string[] {
  if (schema.anyOf) return schema.anyOf.some((option) => schemaErrors(option, value, path).length === 0) ? [] : [`${path} matches none of the allowed shapes`];
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    if (!types.some((type) => type === actual || (type === "number" && actual === "integer"))) return [`${path} must be ${types.join(" or ")}, got ${actual}`];
  }
  const errors: string[] = [];
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} must be at most ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} must have at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} must have at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((item, index) => errors.push(...schemaErrors(schema.items!, item, `${path}[${index}]`)));
  }
  if (typeOf(value) === "object") {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in object)) errors.push(`${path}.${key} is missing`);
    for (const [key, sub] of Object.entries(schema.properties ?? {})) if (key in object) errors.push(...schemaErrors(sub, object[key], `${path}.${key}`));
  }
  return errors;
}

/** A structured LLM request. `validate` runs on replies that match `schema` (`attempt` counts from 0); an invalid reply is re-prompted with its errors up to `repairs` times (default 0). `label` names the reply in the final error. */
export interface StructuredPrompt extends LlmPrompt { schema: JsonSchema; label: string; validate?(json: unknown, attempt: number): string[]; repairs?: number; onRepair?(errors: string[]): void }

/** Runs `request` and returns its checked reply; throws `<label> failed validation:` with the errors of the last attempt. */
export async function runStructured<T>(llm: { run(prompt: LlmPrompt, selection?: LlmSelection): Promise<LlmRunResult> }, request: StructuredPrompt, selection?: LlmSelection): Promise<{ json: T; result: LlmRunResult }> {
  const { label, validate, repairs = 0, onRepair, ...prompt } = request;
  let result = await llm.run(prompt, selection);
  for (let attempt = 0; ; attempt++) {
    const shape = schemaErrors(prompt.schema, result.json);
    const errors = shape.length ? shape : validate?.(result.json, attempt) ?? [];
    if (!errors.length) return { json: result.json as T, result };
    if (attempt >= repairs) throw new Error(`${label} failed validation:\n${errors.join("\n")}`);
    onRepair?.(errors);
    result = await llm.run({ ...prompt, prompt: [prompt.prompt, "", "Your previous answer was invalid:", ...errors.map((error) => `- ${error}`), "", "Previous answer:", JSON.stringify(result.json), "", "Return a corrected, complete answer."].join("\n") }, selection);
  }
}
