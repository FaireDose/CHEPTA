/**
 * The kinetics of a reaction on the Reactions page (proposal 0010, sections 1 and 4, steps 5 and 9): a rate form of
 * src/reactions/kinetics.js and its constants, or "Write your own kinetics", a text box for a formula
 * (src/reactions/expression.js). It edits the reaction's `rate` as written in the project; the engine checks it
 * (checkReaction), and the Reactions page shows what it says. A view (layer 6): no calculation here.
 */
import { h } from "./dom.js";
import { RATE_BASES } from "../reactions/kinetics.js";
import { INDEXED, SCALARS } from "../reactions/expression.js";

export const FORM_LABEL = { "power-law": "Power law (orders, optional reverse)", LHHW: "LHHW (adsorption)", "michaelis-menten": "Michaelis–Menten",
  monod: "Monod (growth)", growth: "Growth: Blackman, Tessier, Moser, Contois", expression: "Your own formula" };
const BASIS_LABEL = { concentration: "Concentrations, mol/m³", "mole-fraction": "Mole fractions", activity: "Activities", "partial-pressure": "Partial pressures, kPa", fugacity: "Fugacities, kPa" };
const num = t => { const s = String(t).trim().replace(",", "."); if (s === "") return null; const v = Number(s); return Number.isFinite(v) ? v : undefined; };

/** A rate constant as k0 and Ea (kJ/mol): a number when Ea is empty, else { k0, Ea_J_mol }. */
function constantFields(label, c, onC, { id, uid, numberField, unit = "" }) {
  const k0 = typeof c === "number" ? c : c?.k0, Ea = typeof c === "object" && c ? c.Ea_J_mol : null;
  const put = (a, e) => onC(a == null ? null : e == null ? a : { k0: a, Ea_J_mol: e });
  return h("div", { class: "fa-rx-const" },
    numberField(`${label}${Ea != null ? ", k0" : ""}`, k0 == null ? "" : String(k0), t => { const v = num(t); if (v === undefined) return false; put(v, Ea); }, { id: `${id}-k0`, uid, unit, placeholder: "–" }),
    numberField("Ea", Ea == null ? "" : String(Ea / 1000), t => { const v = num(t); if (v === undefined) return false; put(k0 ?? 0, v == null ? null : v * 1000); }, { id: `${id}-ea`, uid, unit: "kJ/mol", placeholder: "none" }));
}

/**
 * The kinetics editor of reaction r.
 * @param {{r:object, setRate:(rate:object|null, extra?:object)=>void, uid:string, numberField:Function, selectField:Function, segRow:Function, nameOf:Function}} env
 */
export function kineticsEditor({ r, setRate, uid, numberField, selectField, segRow, nameOf }) {
  const rate = r.rate ?? null, form = rate?.form ?? "";
  const species = Object.keys(r.stoichiometry ?? {});
  const reactants = species.filter(c => r.stoichiometry[c] < 0);
  const id = `rx-${r.id}`;
  const patch = p => {
    const next = { ...(rate ?? {}), ...p };
    for (const k of Object.keys(next)) if (next[k] == null || next[k] === "") delete next[k];
    setRate(next);
  };
  const ctx = { uid, numberField };
  const parts = [selectField("Form", [["", "none (no kinetics)"], ...Object.entries(FORM_LABEL)], form, v => {
    if (!v) return setRate(null);
    const base = { form: v, ...(rate?.source ? { source: rate.source } : {}) };
    if (v === "power-law" || v === "LHHW") base.forward = { k: rate?.forward?.k ?? null };
    if (v === "LHHW") base.adsorption = [];
    if (v === "expression") Object.assign(base, { rate: "", constants: {} });
    if (["michaelis-menten", "monod", "growth"].includes(v)) base.substrate = reactants[0];
    if (v === "growth") base.law = "tessier";
    setRate(base, ["michaelis-menten", "monod", "growth"].includes(v) ? { reversible: false } : undefined);
  }, `fs-rx-form-${r.id}`, uid)];
  if (!form) return h("div", { class: "fa-rx-kin" }, ...parts, h("p", { class: "fa-in-hint" }, "The CSTR and the plug-flow reactor need kinetics; the conversion, yield and equilibrium reactors do not."));

  if (form !== "expression") {
    parts.push(segRow("Rate per", [["volume", "m³ of reactor"], ["catalyst-mass", "kg of catalyst"]], rate.per ?? "volume", v => patch({ per: v === "volume" ? null : v }), `fs-rx-per-${r.id}`));
  }
  if (form === "power-law" || form === "LHHW") {
    parts.push(selectField("Written in", Object.keys(RATE_BASES).map(k => [k, BASIS_LABEL[k]]), rate.basis ?? "concentration", v => patch({ basis: v === "concentration" ? null : v }), `fs-rx-basis-${r.id}`, uid));
    const fw = rate.forward ?? {};
    parts.push(constantFields("k (forward)", fw.k, k => patch({ forward: { ...fw, k } }), { id: `${id}-kf`, ...ctx }),
      h("div", { class: "fa-in-hint" }, "Orders (empty: the reactant's coefficient, as for an elementary reaction)"),
      ...species.map(c => numberField(`Order of ${nameOf(c)}`, fw.orders?.[c] == null ? "" : String(fw.orders[c]), t => {
        const v = num(t); if (v === undefined) return false;
        const o = { ...(fw.orders ?? Object.fromEntries(reactants.map(x => [x, -r.stoichiometry[x]]))) };
        if (v == null) delete o[c]; else o[c] = v;
        patch({ forward: { ...fw, orders: o } });
      }, { id: `${id}-o-${c}`, uid, placeholder: r.stoichiometry[c] < 0 ? String(-r.stoichiometry[c]) : "0" })));
    const rv = rate.reverse == null ? "none" : rate.reverse === "from-equilibrium" ? "K" : "given";
    parts.push(segRow("Reverse", [["none", "None"], ["K", "From K"], ["given", "Given"]], rv,
      v => setRate({ ...rate, reverse: v === "none" ? undefined : v === "K" ? "from-equilibrium" : { k: null } }, v === "none" ? undefined : { reversible: true }), `fs-rx-rev-${r.id}`));
    if (rv === "K") parts.push(h("p", { class: "fa-in-hint" }, "k_reverse = k / K, with K from the formation data (or the reaction's K): the rate is zero at equilibrium. Written in activities (or partial pressures or fugacities for a vapour)."));
    if (rv === "given") {
      const bw = rate.reverse;
      parts.push(constantFields("k (reverse)", bw.k, k => patch({ reverse: { ...bw, k } }), { id: `${id}-kr`, ...ctx }),
        h("div", { class: "fa-in-hint" }, "Reverse orders (empty: the forward orders plus the coefficients, so the rate is zero at equilibrium)"),
        ...species.map(c => numberField(`Reverse order of ${nameOf(c)}`, bw.orders?.[c] == null ? "" : String(bw.orders[c]), t => {
          const v = num(t); if (v === undefined) return false;
          const o = { ...(bw.orders ?? {}) }; if (v == null) delete o[c]; else o[c] = v;
          patch({ reverse: { ...bw, orders: Object.keys(o).length ? o : undefined } });
        }, { id: `${id}-ro-${c}`, uid, placeholder: "–" })));
    }
  }
  if (form === "LHHW") {
    const ads = rate.adsorption ?? [];
    parts.push(h("div", { class: "fa-in-hint" }, "Denominator 1 + Σ (K_j c_j)^m_j, to the power n; m = ½ for dissociative adsorption"),
      ...species.map(c => {
        const k = ads.findIndex(a => a.species === c), a = ads[k];
        const setA = next => patch({ adsorption: next == null ? ads.filter(x => x.species !== c) : k < 0 ? [...ads, next] : ads.map((x, j) => (j === k ? next : x)) });
        return h("div", { class: "fa-rx-ads" },
          constantFields(`K of ${nameOf(c)}`, a?.K, K => setA(K == null ? null : { species: c, ...(a ?? {}), K }), { id: `${id}-ka-${c}`, ...ctx }),
          a ? h("label", { class: "fa-check" }, h("input", { type: "checkbox", checked: !!a.dissociative, "data-fk": `fs-rx-diss-${r.id}-${c}`,
            on: { change: ev => setA({ ...a, dissociative: ev.target.checked || undefined }) } }), "dissociative") : null);
      }),
      numberField("Exponent n", rate.exponent == null ? "" : String(rate.exponent), t => { const v = num(t); if (v === undefined) return false; patch({ exponent: v }); }, { id: `${id}-n`, uid, placeholder: "1" }));
  }
  const pick = (label, key, options) => selectField(label, [["", "choose"], ...options.map(c => [c, nameOf(c)])], rate[key] ?? "", v => patch({ [key]: v || null }), `fs-rx-${key}-${r.id}`, uid);
  const constant = (label, key, unit) => constantFields(label, rate[key], k => patch({ [key]: k }), { id: `${id}-${key}`, unit, ...ctx });
  if (form === "michaelis-menten") parts.push(pick("Substrate", "substrate", reactants), constant("k", "k"), constant("K", "K", "m³/mol"));
  if (form === "monod" || form === "growth") {
    parts.push(pick("Substrate", "substrate", reactants), pick("Biomass (its concentration multiplies μ)", "biomass", species), constant("μmax", "mu_max", "1/s"));
    if (form === "growth") parts.push(selectField("Law", [["blackman", "Blackman"], ["tessier", "Tessier"], ["moser", "Moser"], ["contois", "Contois"]], rate.law ?? "tessier", v => patch({ law: v }), `fs-rx-law-${r.id}`, uid));
    if (form === "monod" || rate.law !== "contois") parts.push(constant("Ks", "Ks", "mol/m³"));
    if (form === "growth" && rate.law === "contois") parts.push(constant("Ksx", "Ksx"));
    if (form === "growth" && rate.law === "moser") parts.push(numberField("Exponent n", rate.n == null ? "" : String(rate.n), t => { const v = num(t); if (v === undefined) return false; patch({ n: v }); }, { id: `${id}-mn`, uid }));
    if (form === "monod") parts.push(constant("K1 (substrate inhibition, optional)", "K1"));
  }
  if (form === "expression") {
    const consts = rate.constants ?? {};
    const names = Object.keys(consts);
    parts.push(
      h("label", { class: "fa-field fa-field-stack" }, h("span", {}, "Rate, mol/(m³ s) (or per kg of catalyst)"),
        h("textarea", { rows: 3, spellcheck: "false", "data-fk": `fs-rx-expr-${r.id}`, placeholder: `k1 * C['${species[0] ?? "water"}'] - k1 / K * …`,
          on: { change: ev => patch({ rate: ev.target.value }) } }, rate.rate ?? "")),
      h("p", { class: "fa-in-hint" }, `Names: ${Object.entries(SCALARS).map(([k, v]) => `${k} (${v})`).join(", ")}; ${Object.entries(INDEXED).map(([k, v]) => `${k}['component'] (${v})`).join(", ")}; your constants; exp, ln, log10, sqrt, abs, min, max; + − * / ^.`),
      segRow("Rate per", [["volume", "m³ of reactor"], ["catalyst-mass", "kg of catalyst"]], rate.per ?? "volume", v => patch({ per: v === "volume" ? null : v }), `fs-rx-per-${r.id}`),
      ...names.map(n => h("div", { class: "fa-rx-ads" }, constantFields(n, consts[n], k => { const c = { ...consts }; if (k == null) delete c[n]; else c[n] = k; patch({ constants: c }); }, { id: `${id}-c-${n}`, ...ctx }))),
      h("label", { class: "fa-field fa-field-stack" }, h("span", {}, "Add a constant (its name)"),
        h("input", { type: "text", placeholder: "k1", "data-fk": `fs-rx-addc-${r.id}`, on: { change: ev => {
          const n = ev.target.value.trim(); if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) return;
          patch({ constants: { ...consts, [n]: 0 } });
        } } })));
  }
  parts.push(h("label", { class: "fa-field fa-field-stack" }, h("span", {}, "Source of the kinetics"),
    h("input", { type: "text", value: rate.source ?? "", placeholder: "article, table, page", "data-fk": `fs-rx-ksrc-${r.id}`, on: { change: ev => patch({ source: ev.target.value.trim() || null }) } })));
  return h("div", { class: "fa-rx-kin" }, ...parts);
}
