/**
 * The Column block in the flowsheet's Excel workbook (proposal 0015, M2b; roadmap B1): one sheet per column with its
 * inputs, its results and its profile, and the source of each number. A column cannot be an Excel formula (every stage
 * needs phase equilibrium), so every number is a value from CHEPTA (grey italics), as the flash drums' outlets of the
 * ordinary export are; its inputs are listed as given in CHEPTA. DOM-free (test/column-workspace.test.js).
 */
const val = v => (v == null || (typeof v === "number" && !Number.isFinite(v)) ? null : { v, s: "value" });
const bold = v => ({ v, s: "bold" });

/** The column's inputs: label, value, unit. */
const SPEC_ROWS = [
  ["mode", "Method", ""], ["light_key", "Light key", ""], ["heavy_key", "Heavy key", ""],
  ["recovery_light_key_in_distillate", "Light key recovered in the distillate", "fraction"],
  ["recovery_heavy_key_in_bottoms", "Heavy key recovered in the bottoms", "fraction"],
  ["reflux_ratio", "Reflux ratio", "L/D"], ["reflux_over_minimum", "Reflux over the minimum", "R/R_min"],
  ["stages", "Stages (1 the condenser, the last the reboiler)", ""], ["feed_stage", "Feed stage", "from the top"],
  ["boilup_ratio", "Boil-up ratio", "V/B"], ["distillate_kmol_h", "Distillate flow", "kmol/h"], ["bottoms_kmol_h", "Bottoms flow", "kmol/h"],
  ["condenser_duty_kW", "Condenser duty (removed)", "kW"], ["reboiler_duty_kW", "Reboiler duty", "kW"],
  ["condenser", "Condenser", ""], ["P_kPa", "Pressure", "kPa"], ["max_iterations", "Newton iterations at most", ""],
];

/** The results of each mode: key in `state`, label, unit, source. */
const SHORTCUT = "Shortcut column (src/units/columns/shortcut.js; docs/models/columns.md)";
const RESULT_ROWS = {
  shortcut: [
    ["q", "Feed liquid fraction q", "", "the feed's enthalpy between its saturated liquid and vapour at P, CHEPTA's method"],
    ["N_min", "Minimum stages (total reflux)", "", "Fenske's equation"],
    ["R_min", "Minimum reflux ratio", "L/D", "Underwood's equations"],
    ["theta", "Underwood's root θ", "", "Underwood's equations"],
    ["R", "Reflux ratio", "L/D", "as given, or R_min times the given multiple"],
    ["N", "Equilibrium stages (reboiler included, a total condenser not)", "", "Gilliland's correlation in Eduljee's form: an estimate"],
    ["stages", "Whole stages (1 the condenser)", "", "N rounded up"],
    ["feed_stage", "Feed stage", "from the top", "Fenske's equation between the feed and the bottoms (Kirkbride is not used)"],
    ["D_kmol_h", "Distillate flow", "kmol/h", "the keys' recoveries, the non-keys by Fenske"],
    ["B_kmol_h", "Bottoms flow", "kmol/h", "the material balance"],
    ["condenser_kW", "Condenser duty (removed)", "kW", "saturated vapour to saturated liquid of the top, CHEPTA's method"],
    ["reboiler_kW", "Reboiler duty", "kW", "the column's energy balance"],
    ["T_distillate_K", "Distillate temperature", "K", "its bubble (or dew) point at P"],
    ["T_bottoms_K", "Bottoms temperature", "K", "its bubble point at P"],
  ],
  rigorous: [
    ["reflux_ratio", "Reflux ratio", "L/D", "the solved column"],
    ["boilup_ratio", "Boil-up ratio", "V/B", "the solved column"],
    ["D_kmol_h", "Distillate flow", "kmol/h", "the solved column"],
    ["B_kmol_h", "Bottoms flow", "kmol/h", "the solved column"],
    ["condenser_kW", "Condenser duty (removed)", "kW", "the condenser's energy balance"],
    ["reboiler_kW", "Reboiler duty", "kW", "the reboiler's energy balance"],
    ["T_distillate_K", "Top stage temperature", "K", "the solved column"],
    ["T_bottoms_K", "Reboiler temperature", "K", "the solved column"],
    ["iterations", "Newton iterations", "", "the solver"],
  ],
};

/**
 * The sheet of one column: { name, rows, cols }. b: the block; r: its result (runFlowsheet's blocks[id]); comps, nameOf:
 * the flowsheet's components and their names; model: the flowsheet's method, as written on the Inputs sheet.
 */
export function columnSheet(b, r, { comps, nameOf, model }) {
  const st = r.state ?? {}, mode = st.mode ?? b.spec?.mode ?? "shortcut", spec = b.spec ?? {};
  const rows = [
    [{ v: `Column ${b.label || b.id}: ${mode === "rigorous" ? "the rigorous column, stage by stage" : "the shortcut column"}`, s: "head" }],
    ["Grey italics: calculated by CHEPTA. A column cannot be an Excel formula (every stage needs phase equilibrium): change its inputs in CHEPTA and export again."],
    [],
    [bold("Inputs (as given in CHEPTA)"), bold("Value"), bold("Unit")],
  ];
  for (const [k, label, unit] of SPEC_ROWS) {
    if (spec[k] == null) continue;
    const v = Array.isArray(spec[k]) ? spec[k].join(", ") : spec[k];
    rows.push([label, k === "light_key" || k === "heavy_key" ? nameOf(v) : v, unit]);
  }
  if (spec.P_kPa == null) rows.push(["Pressure", val(st.P_kPa), "kPa (the feed's)"]);
  rows.push([`Method: ${model}`], []);
  rows.push([bold("Results"), bold("Value"), bold("Unit"), bold("Source")]);
  for (const [k, label, unit, src] of RESULT_ROWS[mode] ?? []) if (st[k] != null) rows.push([label, val(st[k]), unit, src]);
  if (mode === "shortcut") {
    for (const [where, a] of Object.entries(st.alpha_keys ?? {})) rows.push([`Relative volatility of the keys, ${where}`, val(a), "", "K-values of CHEPTA's method at the bubble point there"]);
  } else if (st.residuals) {
    for (const [g, v] of Object.entries(st.residuals)) rows.push([`Largest residual: ${g}`, val(v), "", `within the tolerance ${st.tolerances?.[g] ?? ""}`]);
  }
  rows.push([]);
  const p = r.profile ?? [];
  const hasY = p.some(s => s.y);
  rows.push([bold(mode === "rigorous"
    ? `Profile: the liquid and vapour leaving each stage. Source: the MESH equations of every stage solved together (Naphtali-Sandholm, Newton's method) with ${model}; converged is not validated against data.`
    : "Profile: the condenser, the feed stage and the reboiler. Source: the shortcut, with the flows by constant molar overflow; the feed stage's composition is not calculated.")]);
  rows.push([bold("Stage"), bold("Name"), bold("T, K"), bold("P, kPa"), bold("Liquid, kmol/h"), bold("Vapour, kmol/h"), bold("Duty, kW (+ heat in)"),
    ...(mode === "shortcut" ? [bold("Relative volatility of the keys")] : []),
    ...comps.map(c => bold(`x ${nameOf(c)}`)), ...(hasY ? comps.map(c => bold(`y ${nameOf(c)}`)) : [])]);
  for (const s of p) {
    rows.push([s.stage, s.name, val(s.T_K), val(s.P_kPa), val(s.L_kmol_h), val(s.V_kmol_h), val(s.duty_kW),
      ...(mode === "shortcut" ? [val(s.alpha_keys)] : []),
      ...comps.map(c => (s.x ? val(s.x[c]) : null)), ...(hasY ? comps.map(c => (s.y ? val(s.y[c]) : null)) : [])]);
  }
  for (const w of r.warnings ?? []) rows.push([], [bold(`Warning ${w.code ?? ""}`.trim()), w.message]);
  // Excel's sheet names: at most 31 characters, none of []:*?/\
  const name = `Column ${b.label || b.id}`.replace(/[[\]:*?/\\]/g, " ").slice(0, 31);
  return { name, rows, cols: [44, 14, 12, 40, 13, 13, 16, ...comps.flatMap(() => [12, 12])] };
}
