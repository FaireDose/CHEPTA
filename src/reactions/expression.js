/**
 * A rate written by the user as a formula (proposal 0010, section 4 and step 9): a small parser and evaluator, without
 * the browser's eval or Function, so that a formula in a project file (from another person or an AI chat) cannot run
 * code. It knows numbers, + - * / ^, parentheses, the functions exp, ln, log10, sqrt, abs, min and max, and the names
 *   T (K), P (kPa), R (8.314462618 J/(mol K)), K (the reaction's equilibrium constant at T, activities),
 *   C['component'] (mol/m3), x['component'] (mole fraction), p['component'] (partial pressure, kPa),
 *   f['component'] (fugacity, kPa), a['component'] (activity),
 *   and the user's own constants (a number, or k0 T^B exp(-Ea/RT) with { k0, Ea_J_mol, B }).
 * A component is named in quotes, by any of its names, ids or CAS number. ^ binds tighter than a sign and is right
 * associative: -2^2 = -4, 2^3^2 = 512.
 *
 * parseExpression(text, names) returns the tree, or throws BAD_INPUT with the position of the error ("unknown name
 * 'conc' at character 12; known: ..."); evaluate(tree, env) computes it.
 */
import { fail } from "../util/errors.js";

export const INDEXED = Object.freeze({ C: "concentration, mol/m3", x: "mole fraction", p: "partial pressure, kPa", f: "fugacity, kPa", a: "activity" });
export const SCALARS = Object.freeze({ T: "temperature, K", P: "pressure, kPa", R: "gas constant, J/(mol K)", K: "equilibrium constant of the reaction at T" });
const FUNCTIONS = { exp: [1, 1], ln: [1, 1], log10: [1, 1], sqrt: [1, 1], abs: [1, 1], min: [1, Infinity], max: [1, Infinity] };

/** The tokens of a formula, each with its position (1-based character). */
function tokens(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    const at = i + 1;
    const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if (m) { out.push({ t: "num", v: Number(m[0]), at }); i += m[0].length; continue; }
    const w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
    if (w) { out.push({ t: "name", v: w[0], at }); i += w[0].length; continue; }
    if (c === "'" || c === "\"") {
      const end = text.indexOf(c, i + 1);
      if (end < 0) throw fail("BAD_INPUT", `the quote at character ${at} is not closed.`);
      out.push({ t: "str", v: text.slice(i + 1, end), at }); i = end + 1; continue;
    }
    if (c === "*" && text[i + 1] === "*") { out.push({ t: "op", v: "^", at }); i += 2; continue; }
    if ("+-*/^()[],".includes(c)) { out.push({ t: "op", v: c, at }); i++; continue; }
    throw fail("BAD_INPUT", `unexpected character '${c}' at character ${at}.`);
  }
  out.push({ t: "end", v: "", at: text.length + 1 });
  return out;
}

/**
 * Parse a formula.
 * @param {string} text
 * @param {{constants?: string[], species?: (key:string, at:number) => string}} [names]  the user's constant names, and a
 *   lookup that turns a quoted component into its id (it throws for an unknown one)
 * @returns {object} the tree: { k: "num"|"var"|"idx"|"neg"|"bin"|"fn", ... }
 */
export function parseExpression(text, names = {}) {
  if (typeof text !== "string" || !text.trim()) throw fail("BAD_INPUT", "the formula is empty.");
  const consts = new Set(names.constants ?? []);
  const known = () => [...Object.keys(SCALARS), ...Object.keys(INDEXED).map(k => `${k}['component']`), ...consts, ...Object.keys(FUNCTIONS).map(f => `${f}()`)].join(", ");
  const tk = tokens(text);
  let p = 0;
  const peek = () => tk[p];
  const expect = v => {
    const t = tk[p];
    if (t.t !== "op" || t.v !== v) throw fail("BAD_INPUT", `expected '${v}' at character ${t.at}${t.t === "end" ? " (the end of the formula)" : `, found '${t.v}'`}.`);
    p++;
  };
  const expr = () => {
    let l = term();
    while (peek().t === "op" && (peek().v === "+" || peek().v === "-")) { const op = tk[p++].v; l = { k: "bin", op, l, r: term() }; }
    return l;
  };
  const term = () => {
    let l = unary();
    while (peek().t === "op" && (peek().v === "*" || peek().v === "/")) { const op = tk[p++].v; l = { k: "bin", op, l, r: unary() }; }
    return l;
  };
  const unary = () => {
    if (peek().t === "op" && (peek().v === "-" || peek().v === "+")) { const op = tk[p++].v; const e = unary(); return op === "-" ? { k: "neg", e } : e; }
    return power();
  };
  const power = () => {
    const b = primary();
    if (peek().t === "op" && peek().v === "^") { p++; return { k: "bin", op: "^", l: b, r: unary() }; }
    return b;
  };
  const primary = () => {
    const t = tk[p++];
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "op" && t.v === "(") { const e = expr(); expect(")"); return e; }
    if (t.t === "name") {
      if (FUNCTIONS[t.v] && peek().t === "op" && peek().v === "(") {
        p++;
        const args = [expr()];
        while (peek().t === "op" && peek().v === ",") { p++; args.push(expr()); }
        expect(")");
        const [lo, hi] = FUNCTIONS[t.v];
        if (args.length < lo || args.length > hi) throw fail("BAD_INPUT", `${t.v}() at character ${t.at} takes ${lo === hi ? lo : `at least ${lo}`} argument${lo === 1 && hi === 1 ? "" : "s"}, found ${args.length}.`);
        return { k: "fn", f: t.v, args };
      }
      if (INDEXED[t.v] && peek().t === "op" && peek().v === "[") {
        p++;
        const s = tk[p++];
        if (s.t !== "str") throw fail("BAD_INPUT", `${t.v}[...] at character ${t.at} needs a component in quotes, e.g. ${t.v}['water'].`);
        expect("]");
        const id = names.species ? names.species(s.v, s.at) : s.v;
        return { k: "idx", b: t.v, id };
      }
      if (consts.has(t.v)) return { k: "var", n: t.v, user: true };
      if (SCALARS[t.v]) return { k: "var", n: t.v };
      const hint = INDEXED[t.v] ? ` ${t.v} needs a component: ${t.v}['water'].` : "";
      throw fail("BAD_INPUT", `unknown name '${t.v}' at character ${t.at}.${hint} Known: ${known()}.`);
    }
    throw fail("BAD_INPUT", t.t === "end" ? `the formula ends too early (character ${t.at}).` : `unexpected '${t.v}' at character ${t.at}.`);
  };
  const tree = expr();
  if (peek().t !== "end") throw fail("BAD_INPUT", `unexpected '${peek().v}' at character ${peek().at}.`);
  return tree;
}

/** The components a tree reads, and how (C, x, p, f, a). */
export function expressionSpecies(tree) {
  const out = [];
  const walk = n => {
    if (n.k === "idx") out.push({ basis: n.b, id: n.id });
    for (const c of [n.e, n.l, n.r, ...(n.args ?? [])]) if (c) walk(c);
  };
  walk(tree);
  return out;
}

/**
 * Evaluate a tree.
 * @param {object} tree
 * @param {{T:number, P:number, R:number, K?:number, constants:Object<string, number>, values:{C,x,p,f,a}}} env
 */
export function evaluate(tree, env) {
  const ev = n => {
    switch (n.k) {
      case "num": return n.v;
      case "neg": return -ev(n.e);
      case "var": {
        const v = n.user ? env.constants[n.n] : env[n.n];
        if (v === undefined || v === null) throw fail("MISSING_DATA", `the formula needs ${n.n}${n.n === "K" ? " (the reaction has no equilibrium constant: give it in the reaction, or from formation data)" : ""}.`);
        return v;
      }
      case "idx": {
        const v = env.values?.[n.b]?.[n.id];
        if (v === undefined) throw fail("MISSING_DATA", `the formula needs ${n.b}['${n.id}'].`);
        return v;
      }
      case "bin": {
        const a = ev(n.l), b = ev(n.r);
        return n.op === "+" ? a + b : n.op === "-" ? a - b : n.op === "*" ? a * b : n.op === "/" ? a / b : a ** b;
      }
      case "fn": {
        const a = n.args.map(ev);
        switch (n.f) {
          case "exp": return Math.exp(a[0]);
          case "ln": return Math.log(a[0]);
          case "log10": return Math.log10(a[0]);
          case "sqrt": return Math.sqrt(a[0]);
          case "abs": return Math.abs(a[0]);
          case "min": return Math.min(...a);
          default: return Math.max(...a);
        }
      }
      default: throw new Error("Internal: unknown node in a formula. Please report this.");
    }
  };
  return ev(tree);
}
