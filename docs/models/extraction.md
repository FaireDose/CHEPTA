# Extraction: countercurrent liquid-liquid stages

The Extraction block ([proposal 0015](../../proposals/0015-separation-units.md), Part I sections 1, 4 and 6; milestone
M3, step 8; workstream W2). Code: `src/units/columns/extraction.js` (the liquid-liquid cascade of the column engine,
`solveCascade({ phases: "LL" })`, contract 3), `src/units/extraction.js` (the block), `src/ui/extraction-view.js` (its
view). Written against **contracts v1**.

```js
CHEPTA.runUnit("extraction", { sys, inlets: { feed: [feed], solvent: [solvent] }, spec: { stages: 5, T_K: 298.15 } })
CHEPTA.run({ capability: "solve_extraction", input: { components, thermo, feed, solvent, extraction: { stages: 5 } } })
```

In the Flowsheet workspace it is under the **Separator** button. The command line (`chepta request`) and the local MCP
server (`chepta-mcp`, tool `solve_extraction`) take the same request. Example: `examples/extraction-acetic-acid.chepta.json`
(acetic acid from water by ethyl acetate, five stages at 25 °C).

## The model

N equilibrium stages, numbered 1 to N. The feed enters stage 1 and the solvent stage N. The raffinate flows from stage
1 to N, where it leaves; the extract flows from N to 1, where it leaves. On every stage the two liquids leaving it are
in equilibrium: each component has the same activity in both. The equations, in the variables of Naphtali and Sandholm
(the component flows of both liquids leaving each stage), are those of the vapour-liquid column (`engine.js`) with the
vapour replaced by the second liquid:

- material: d_ij + u_ij − d_i,j−1 − u_i,j+1 − f_ij = 0;
- equilibrium: ln(x_ij γ_i(x_j, T)) − ln(y_ij γ_i(y_j, T)) = 0.

All stages are at the block's temperature (default: the feed's), so there is no energy balance among the equations. The
**duty** is the heat that holds that temperature, H_out − H_in. The pressure does not enter, because the activity
coefficients of NRTL, UNIQUAC and Modified UNIFAC 2.0 do not depend on it, and neither does the vapour model: the
chemical theory of the acids is not used.

**The solver.** It starts from one liquid-liquid split of all the feeds mixed (`splitLL`), with the tangent-plane test's
trial phase as a fallback. The isothermal sum-rates method then runs: at fixed distribution coefficients, one
tridiagonal balance per component, then the flows and the K-values again, 40 times. Newton's method finishes on all 2CN
equations, in the logarithms of the flows, with the Jacobian by central differences stage by stage and the step halved
until the residual falls. Tolerances: 1e-10 of the feed in the balances, 1e-10 in ln activity.

**Refused, with the reason:**
- feeds that mix to one liquid (no split at all);
- a solution whose two liquids have one composition on a stage (the trivial solution: there the streams dissolve in
  each other);
- an equation of state as the liquid method;
- a feed or solvent that is partly vapour.

## The liquid method

By default, the block uses the flowsheet's activity model. For a ternary whose three pairs each have a set fitted
jointly to its tie lines (named `fitted-lle-…`, `validation/python/fit_ternary_lle.py`), it uses those sets: they are
the block's default for that ternary (the maintainer, 2026-11-04; today water + acetic acid + ethyl acetate,
`fitted-lle-roque2018`). Elsewhere the default sets stay. `method: { model, sets, prefer }` gives the block a method of
your own.

The outlets are calculated in the block's method, as the liquids of the first and the last stage. Where the flowsheet's
own sets would split an outlet into two liquids, the block warns (`METHOD_SPLIT`), because a block after it that uses
the flowsheet's method may refuse that stream. The remedy is the same sets in the flowsheet's thermo. This is the case
for the example's extract: the default sets of this ternary miss its tie lines by up to 0.16 in mole fraction (see
`docs/decisions/2026-10-30-08-extraction.md`).

## Results

- **The block:** the extract and the raffinate; the recovery of every component into the extract; the solvent-to-feed
  ratio (molar and by mass); the liquid method and its sets.
- **Every stage:** both liquids' flows and compositions, and the distribution coefficients K_i = y_i / x_i.
- **The view** (the block selected, three components): a ternary diagram in mole fractions. It shows the binodal curve
  and the tie lines of the block's method (traced by liquid-liquid flashes from the binary edge toward the solute's
  corner, up to the plait point), every stage's tie line, the paths of the raffinate and the extract through the
  stages, and the feed and the solvent. Below it, the profile table.

## Checks (test/extraction.test.js)

- **Against an independent implementation:** `validation/python/reference_extraction.py` (numpy and scipy, its own
  stage-by-stage start, the same activity coefficients as `reference_model.py`) on six cascades: 1 to 6 stages, 293 to
  303 K, NRTL and UNIQUAC, with the jointly fitted sets. Every stage's flows agree within 1e-7.
- **A published worked example:** D. J. Glatz and W. Parker, "Troubleshooting liquid-liquid extraction columns:
  evaluating column efficiency", AIChE Spring National Meeting 2004, paper 232a, free to read in the meeting's
  proceedings (https://folk.ntnu.no/skoge/prost/proceedings/aiche-2004/pdffiles/papers/232a.pdf). It applies the
  Kremser equation with a constant distribution coefficient of 1.06, S/F 1.24, a feed of 14.2 % and a solvent of
  0.07 %:
  - Run 1: 10.6 theoretical stages for a raffinate of 0.26 %;
  - Run 3: 13.0 stages for 0.1 % with pure solvent.

  The Kremser equation is exact for a straight equilibrium line and constant flows. The test gives the engine an
  algebraic stand-in for the activity coefficients, not a chemical system: two immiscible liquids whose solute follows
  Y = mX in solute ratios. On that stand-in the engine reproduces the Kremser equation to 1e-6 for 1 to 13 stages. 10
  and 11 stages bracket the paper's 0.26 % (0.297 % and 0.240 %), and 13 stages with pure solvent give 0.0993 %
  against the paper's 0.1 %.
- **The block:** balances closed, the joint sets taken by default, the `METHOD_SPLIT` warning, your own sets replacing
  the joint ones, the refusals, `solve_extraction`, and the workbench (the Separator menu; saved and reopened in project
  format 6).

## Not built

- Temperature profiles from an energy balance (an adiabatic cascade).
- Side feeds between the ends (the engine takes them, the block does not).
- Stage efficiencies.
- The column's hydraulics (flooding of an extraction column).
- An equation of state with two liquids (CPA; DECISIONS.md, "Engineering", item 7).

## Adiabatic, boiling liquids and a feed with vapour (2026-11-12)

`adiabatic: true` (without `T_K`) finds one temperature for all stages so that the outlets carry the inlets' enthalpy; the duty is zero. It is not a stage-by-stage energy balance. A liquid of any stage at or above its bubble point at the block's pressure is refused (`OUT_OF_RANGE`, with its bubble temperature): raise `P_kPa`. A feed or solvent with a vapour fraction up to 0.1 is condensed into the stages with a `FEED_VAPOUR` warning; more is refused. See docs/decisions/2026-11-12-03-extraction-lab-requests.md.
