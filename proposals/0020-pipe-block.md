# 0020: The Pipe block: pressure drop and heat in a pipe

- **Status:** Accepted for steps 1-2 (the maintainer, 2026-11-10; the engine, the Pipe workspace under Unit models, and
  with them the flowsheet palette and the project file, docs/decisions/2026-11-10-05-pipe-palette-save.md). Steps 3-6
  are the plan: the two-phase flow comes in its own pull request, Lockhart-Martinelli first, then Beggs-Brill, once
  open sources for them are found; Lockhart-Martinelli is built (step 4, to review,
  docs/decisions/2026-11-10-06-pipe-two-phase.md). The maintainer asked for the workspace on 2026-11-07: "put it in the model tab so
  I can check a pipe without doing a flowsheet"
- **Author(s):** a coding agent for the maintainer (Claude Code sessions of 2026-11-07 and 2026-11-10)
- **Discussion:** the pull request that adds this file; docs/decisions/2026-11-10-02-pipe-block.md
- **Roadmap item:** A6 (unit operations) and v0.6 "Further units towards models of all the common unit operations"

## Problem

CHEPTA's flowsheet moves streams from block to block without any pressure loss between them, unless the person types
one into a heater or a valve. A designer sizing a line, a student checking a pump's suction, or a flowsheet whose
pressures matter (a gas line, a long liquid transfer, a line uphill) has no way to compute the pressure drop of a pipe,
its fittings and its elevation, nor what a gas does to its temperature and velocity along the line. Every common
simulator has such a block (DWSIM's "Pipe Segment", for example), and a pump or compressor is sized from it (roadmap
E1).

## Proposal

A unit `pipe` (layer 4, `src/units/pipe.js`), registered with `registerUnit` like every other block: one inlet `in`,
one outlet `out`, a duty (the heat to or from the surroundings).

```js
runUnit("pipe", { sys, inlets: { in: s }, spec: {
  length_m: 100, diameter_m: 0.05, roughness_m: 5e-5,      // required (or friction_factor in place of the roughness)
  elevation_m: 10,                                         // outlet minus inlet height, at most the length
  fittings: [{ fitting: "elbow-90", count: 4 }, { K: 0.5 }, { L_D: 30, label: "check valve" }],
  heat: "adiabatic" | "isothermal" | "U", U_W_m2K: 5, T_ambient_K: 283.15,   // the last two with heat "U" only
  segments: 20, friction_factor: null, viscosity_Pa_s: null,                // options: the person's own f and viscosity
} })
// → outlets.out (a P-H flash at the inlet's enthalpy plus the heat), duty_kW, warnings, notes,
//   profile: [{ x_m, z_m, P_kPa, T_K, rho_kg_m3, velocity_m_s, Re, friction_factor, regime }, ...],
//   state: { dP_kPa, dP_friction_kPa, dP_fittings_kPa, dP_elevation_kPa, dP_acceleration_kPa, P_out_kPa, T_out_K,
//            velocity_in_m_s, velocity_out_m_s, Re_in, Re_out, friction_factor_in, friction_factor_out, regime, ... }
```

The pipe is split into equal segments; over each, the properties are the mean of its two ends and the outlet pressure
is iterated until the momentum balance closes. Water at 10 °C, 0.0100 m³/s through 100 m of a 5 cm pipe with a
roughness of 0.05 mm gives f = 0.02107 and 546 kPa, as Cimbala's worked example (below).

**A Pipe workspace under Unit models** (`src/ui/pipe-logic.js`, `src/ui/pipe-view.js`, `pipeView` in
`src/ui/app-views.js`), at the maintainer's request of 2026-11-07, so a pipe can be checked without a flowsheet:
components and method as in the other unit workspaces; the inlet's flow (kmol/h or kg/h), temperature, pressure and
composition; length, inner diameter, roughness, elevation; a list of fittings (a type of the DOE table, or a K or an
Leq/D of one's own, with a count); heat (adiabatic, isothermal, or a loss with U and the surroundings' temperature);
segments, and the person's own friction factor or viscosity. Results: the pressure drop as the headline, split into
friction, fittings, elevation and acceleration with each part's share; outlet pressure and temperature, velocity,
Reynolds number and friction factor at inlet and outlet, regime, density, mass flux, heat; the warnings and notes of
the block. The canvas draws the pressure along the pipe and lists the profile, with the Excel download. A refusal of
the engine is shown as a refusal (amber, its reason and what to change), not as an error.

## Engineering basis

All in the header of `src/units/pipe.js`, every source free to read:

- Momentum: G. Bar-Meir, *Fundamentals of Compressible Fluid Mechanics*, v0.5.0 (2021), eq. (9.9), p. 239 (GNU FDL;
  zenodo.org/record/5523349), with the Darcy factor (its footnote 2, p. 238) and the static head:
  −dP = f (dx/D) G²/(2ρ) + ρ g dz + G² d(1/ρ), G = ṁ/A.
- Fittings: Darcy's equation h = K v²/2g and the equivalent length K = f Leq/D, and Table 1 "Typical Values of
  Leq/D" (p. 34) of the U.S. DOE Fundamentals Handbook, *Thermodynamics, Heat Transfer, and Fluid Flow*, Vol. 3,
  DOE-HDBK-1012/3-92 (1992), module HT-03, eqs. (3-14) to (3-17), pp. 32-34 (public domain).
- Regimes: laminar below Re 2000, turbulent above 3500 (same handbook, p. 19); laminar f = 64/Re; turbulent Colebrook,
  solved exactly (Newton from Haaland's value; J. M. Cimbala, ME 320 Lecture 21, Penn State, 2015, p. 2); between,
  Churchill (1977), as DWSIM writes it (FlowPackageBaseClass.vb, `FrictionFactor`, read on 2026-11-10: the same
  formula between Re 2100 and 4000), with a FLOW_TRANSITION warning.
- Heat: Q = U A ΔT_lm over each segment, A the inner surface (DWSIM's Pipe.vb does the same with the outer one).
- Gas-liquid flow (step 4): Lockhart-Martinelli in Chisholm's form, with the homogeneous density for elevation and
  acceleration; sources and scope in step 4 below and in the header of `src/units/pipe.js`.
- Fluid properties: a gas's density from the system's own vapour model and Wilke's rule on the pure vapours'
  low-pressure viscosities; a liquid's from the pure liquids' density records (volumes add up) and the logarithmic
  mole-fraction rule for its viscosity.

Validation (`test/pipe.test.js`, `test/pipe-workspace.test.js`):

- an independent Python reference, `validation/python/reference_pipe.py` (CoolProp's IAPWS-95 water and PR methane,
  2000 segments, brentq on the segment pressure and on Colebrook, checked against the `fluids` library when it is installed), six cases in
  `validation/fixtures/pipe.json` (rough pipe uphill with fittings, laminar, transition, methane isothermal, adiabatic,
  and losing heat): the pressure drop and its parts within 0.2 %;
- three open worked examples: Cimbala, Lecture 21, pp. 3-4 (water, f = 0.02107 and 546 kPa rough, 0.0157 and 408 kPa
  smooth; within 0.2-0.3 %); DOE-HDBK-1012/3-92, HT-03, pp. 32-33 (v = 5.35 ft/s, N_R = 8.4e7, H_f = 0.32 ft with the
  chart's f = 0.012); Bar-Meir Example 9.2, pp. 248-249 (isothermal gas, 5 km: 2.566 bar to 1 bar with the book's
  Mach numbers);
- the Cimbala example again through the workspace (kg/h basis), and the refusals.

## Effect on existing work

A new block and a new workspace; nothing else changes. Flowsheet files gain a block type (`pipe`; the flowsheet
drawing's palette offers it since step 3), so a flowsheet with a
pipe does not open in an older version (as for every new block). The Pipe workspace's settings are not saved in the
project file yet (decision below), so the project format is unchanged. Two tests that list the workspaces were updated
to include it.

## Alternatives considered

- **An explicit friction factor** (Haaland, Swamee-Jain, or Chen as DWSIM uses above Re 4000): within about 1-2 % of
  Colebrook, but Colebrook is the equation the open worked examples use, and solving it costs nothing.
- **One segment** (the classic hand calculation): wrong for a gas whose density changes along the line; 20 segments
  are the default, 1 to 1000 allowed.
- **Pressure drop as a number on a heater or valve**: exists, but gives no friction, elevation or velocity.

## Steps

1. Engine: single-phase friction, fittings, elevation and heat, wired into the flowsheet; independent Python reference
   and worked examples (2026-11-07, branch `claude/pipe-block`).
2. The Pipe workspace under Unit models, with its tests (2026-11-10, same branch). **This pull request holds steps 1
   and 2.**
3. The Pipe in the flowsheet drawing: the palette, its icon on the canvas and its block panel (fittings and heat as in
   the workspace). **Built** with the project file (format 8) in #219, merged on 2026-11-10
   (docs/decisions/2026-11-10-05-pipe-palette-save.md).
4. Two-phase flow: a liquid that flashes, a gas that condenses, a gas-liquid inlet. DWSIM offers Beggs and Brill and
   Lockhart-Martinelli (its files BeggsBrill.vb and LockhartMartinelli.vb, read on 2026-11-10); both need open
   sources for their correlations before they are built. The maintainer (2026-11-10): in its own pull request,
   Lockhart-Martinelli first, then Beggs-Brill.
   - **Lockhart-Martinelli: built** (2026-11-10, branch `claude/pipe-two-phase`; to review,
     docs/decisions/2026-11-10-06-pipe-two-phase.md). The phases at each node from the system's flash; the frictional
     gradient of Lockhart and Martinelli in Chisholm's form, C = 5, 10, 12, 20 by the regimes of the phases flowing
     alone ("viscous" below Re 1500), from Filip, Băltăreţu and Damian, *Math. Model. Civ. Eng.* 10(4) (2014)
     19-27, eqs. (10)-(17), pp. 21-22 (open access, CC BY-NC-ND 3.0, doi:10.2478/mmce-2014-0019), the same C in
     Wambsganss, Jendrzejczyk and France, ANL/CP-74646 (1992), eq. (4) p. 13 and Table 1 p. 20 (U.S. government
     report, OSTI 10119434); each phase alone with the block's own friction factor and the wall's roughness, as
     DWSIM. Elevation and acceleration with the homogeneous (no-slip) density (Filip et al., eqs. (5)-(6); DWSIM's
     Lockhart-Martinelli takes the no-slip holdup too). Scope and accuracy stated in the block's note from C. E.
     Brennen, *Fundamentals of Multiphase Flow* (2005), section 8.3.1, pp. 210-211 (the author's free copy on
     CaltechAUTHORS): horizontal, two-component, isothermal data; scatter about a factor of 3 in φ; often an
     overestimate; best when both phases alone are turbulent. A phase change along the pipe uses the correlation at
     each node's quality. Warnings: an elevation change (the no-slip holdup underestimates the liquid uphill), a
     viscous phase (C other than 20). Refused, with the reason: fittings in gas-liquid flow (no open two-phase loss
     coefficients found), your own friction factor or viscosity in gas-liquid flow, two liquid phases, and critical
     (choked) gas-liquid flow (no outlet pressure balances a segment's momentum). Checked against the independent
     reference `validation/python/reference_pipe.py` (`validation/fixtures/pipe-two-phase.json`: five
     two-component cases within 0.2 %, all four regimes; steam and water against CoolProp's IAPWS-95 within 2.6 %, the
     vapour's ideal gas against IAPWS-95 accounting for the rest) and the open `fluids` library's Lockhart_Martinelli
     (to 4e-16 with its friction factor); `test/pipe-two-phase.test.js`. No open worked example with numbers was found.
   - **Beggs and Brill** (inclined pipes, flow patterns, holdup with slip): a later pull request, once open sources
     for its correlations are found.
5. Choked flow of a gas (today refused at ρu² = P, the isothermal limit), and the pressure effect on a liquid's
   density.
6. Sizing (roadmap E1): the diameter for an allowed pressure drop or velocity.
