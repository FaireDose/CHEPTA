/**
 * Hashes for the reproduction block of a result (proposal 0015, section 9, contract 6): the same input, databank and
 * user's data give the same hash in Node and in the browser, synchronously.
 *
 * canonicalJson: JSON with the keys of every object sorted, so the order in which a file lists them does not change
 * the hash. hash64: the 64-bit FNV-1a hash of that text's UTF-16 code units (Fowler, Noll and Vo; the parameters of
 * the FNV reference page, http://www.isthe.com/chongo/tech/comp/fnv/, offset basis 0xcbf29ce484222325, prime
 * 0x100000001b3), as 16 hexadecimal digits. It tells two inputs apart; it is not a cryptographic hash.
 */

/** JSON text with sorted keys; undefined values and functions are left out, as JSON.stringify does. */
export function canonicalJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(x => (x === undefined || typeof x === "function" ? "null" : canonicalJson(x))).join(",")}]`;
  const keys = Object.keys(v).filter(k => v[k] !== undefined && typeof v[k] !== "function").sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
}

/** The 64-bit FNV-1a hash of a value's canonical JSON, as 16 hex digits (in four 16-bit pieces: the build targets
 *  ES2019, which has no BigInt). The prime 2^40 + 0x1b3: h * 0x1b3, plus h shifted by 40 bits. */
export function hash64(value) {
  const text = typeof value === "string" ? value : canonicalJson(value);
  let h0 = 0x2325, h1 = 0x8422, h2 = 0x9ce4, h3 = 0xcbf2;
  for (let i = 0; i < text.length; i++) {
    h0 ^= text.charCodeAt(i);
    const t0 = h0 * 0x1b3;
    const t1 = h1 * 0x1b3 + (t0 >>> 16);
    const t2 = h2 * 0x1b3 + (h0 << 8) + (t1 >>> 16);
    const t3 = h3 * 0x1b3 + (h1 << 8) + (t2 >>> 16);
    h0 = t0 & 0xffff; h1 = t1 & 0xffff; h2 = t2 & 0xffff; h3 = t3 & 0xffff;
  }
  return [h3, h2, h1, h0].map(x => x.toString(16).padStart(4, "0")).join("");
}
