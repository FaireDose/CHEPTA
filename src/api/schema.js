/**
 * The input schemas of the capabilities (proposal 0015, section 9, contract 6): a small subset of JSON Schema
 * (https://json-schema.org/, draft 2020-12): type (one name or a list), properties, required,
 * additionalProperties: false, enum, items, minLength, and description. A schema checks the form of a request; the
 * engine still checks the physics (a feed's temperature within the records, a specification the block can meet).
 */
import { fail } from "../util/errors.js";

const typeOf = v => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const fits = (v, t) => typeOf(v) === t || (t === "number" && typeof v === "number" && Number.isFinite(v));

/** The problems of a value against a schema, as { field, message } (field: a path such as "input.flowsheet"). */
export function schemaProblems(schema, value, field = "input") {
  const out = [];
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some(t => fits(value, t))) return [{ field, message: `${field} must be ${types.join(" or ")} (got ${typeOf(value)}).` }];
  }
  if (schema.enum && !schema.enum.includes(value)) out.push({ field, message: `${field} must be one of ${schema.enum.map(v => JSON.stringify(v)).join(", ")}.` });
  if (typeof value === "string" && schema.minLength != null && value.length < schema.minLength) out.push({ field, message: `${field} must not be empty.` });
  if (typeOf(value) === "object") {
    const props = schema.properties ?? {};
    for (const k of schema.required ?? []) if (value[k] === undefined) out.push({ field: `${field}.${k}`, message: `${field}.${k} is required.` });
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) out.push(...schemaProblems(props[k], v, `${field}.${k}`));
      else if (schema.additionalProperties === false) out.push({ field: `${field}.${k}`, message: `${field}: unknown key "${k}". Known: ${Object.keys(props).join(", ") || "none"}.` });
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => out.push(...schemaProblems(schema.items, v, `${field}[${i}]`)));
  return out;
}

/** Check a value against a schema; throws BAD_INPUT listing every problem, with the fields in details.where. */
export function checkSchema(schema, value, field = "input") {
  const problems = schemaProblems(schema, value, field);
  if (problems.length) throw fail("BAD_INPUT", problems.map(p => p.message).join(" "), { where: problems });
  return value;
}
