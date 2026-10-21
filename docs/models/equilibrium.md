# Equilibrium algorithms (layer 2)

How CHEPTA finds the phases. Every algorithm here takes a system from
[thermodynamics.md](thermodynamics.md) and gets its numbers only by asking that system:

- activity coefficients;
- K-values;
- fugacity coefficients;
- enthalpies.

The algorithms never read the parameters (NRTL a, b and α, or the k_ij) and never repeat a
model's equations. They do check which family the system belongs to, activity model or
equation of state, because the two need different steps. For example, an equation of state
uses Michelsen's stability test and has no two-liquid flash yet. So a fix to NRTL, or a new
parameter set, needs no change here, and a new activity model works with these algorithms once
it answers the same questions. Each file's header comment
states its method and open references; this page maps them. Errors carry codes
([src/util/errors.js](../../src/util/errors.js)): a solver that does not converge throws and says
why, and never returns a wrong answer silently.

## Bubble and dew points

| Models | Bubble | Dew | Method |
|---|---|---|---|
| NRTL, UNIQUAC, ideal | [bubble.js](../../src/equilibrium/bubble.js) | [dew.js](../../src/equilibrium/dew.js) | Gamma-phi. The dew point by successive substitution on the liquid; at fixed P, Brent's method on T. Several solutions are possible with partial miscibility: unstable liquids are discarded and the lowest-pressure solution is kept. |
| PR, SRK | [phi-phi.js](../../src/equilibrium/phi-phi.js) | same | Wilson K-values as the start. A Newton step on ln P or T, with successive substitution on the incipient phase. Near the critical region, a scan and Brent's method. Michelsen's test on the liquid. |
| any | [bubble-any.js](../../src/equilibrium/bubble-any.js) | | Picks the right solver, so every diagram works with every model. |

Independent checks:
- thermo's `FlashVL`, in [validation/python/reference_dew.py](../../validation/python/reference_dew.py) and
  [reference_eos.py](../../validation/python/reference_eos.py).

## Flash

[`flash.js`](../../src/equilibrium/flash.js): `sys.flash({ z, T, P })`, `{ z, P, H }`, `{ z, P, S }` (proposal 0013,
step 6: the P-H search on the entropy), `{ z, P, VF }` and `{ z, T, VF }`, with the optional heat duty and entropy.

- **Rachford–Rice:** Newton steps kept inside the bracket, with bisection as a fallback.
- **K-values:**
  - activity models: K_i = γ_i P_i^sat φ_i^sat Poynting_i / (φ_i^V P);
  - equations of state: K_i = φ_i^L / φ_i^V, started from Wilson's K-values.
- **Which phases exist:**
  - activity models: the feed's bubble and dew pressures, plus tangent-plane checks;
  - equations of state: Michelsen's test on the feed.
  - Every liquid returned is tested against a second liquid.
- **Two liquids and vapour + two liquids:** activity models only.
  - Liquid-liquid by successive substitution.
  - Three phases by the phase-fraction function of Okuno, Johns and Sepehrnoori, then Newton.
  - Refused with PHASE_SPLIT: two liquids with an equation of state or with the acid chemical
    theory, and a third liquid. This follows the selection rules: a plain cubic equation is not
    used where a second liquid forms.
- **Enthalpy and vapour-fraction specifications:** Brent's method on T (or ln P), bracketed by the
  bubble and dew points.
- **Equations of state, convergence:**
  - on main today: successive substitution with GDEM acceleration (Crowe and Nishio 1975) when it
    is slow; a P-H flash that fails is retried from another start.
  - **pull request #86 (open)** replaces this:
    - Newton's method on ln K after ten substitution steps (the formulation of thermo's
      `nonlin_2P_newton`);
    - a P-H search that starts from the bubble point only when that liquid passes the stability
      test, so the retry is no longer needed;
    - enthalpy memoized within a search, so the tolerance workaround is no longer needed.
  - Its check: `validation/python/reference_flash_hard.py`
    covers hard cases near the critical region and the cricondenbar.
- **Tests:** [test/flash.test.js](../../test/flash.test.js), [test/three-phase.test.js](../../test/three-phase.test.js).

## Phase stability

- **Activity models** ([stability.js](../../src/equilibrium/stability.js)):
  - local stability: the Hessian of the Gibbs energy of mixing (the spinodal);
  - in flash.js, tangent-plane tests against a second liquid.
- **Equations of state** ([eos-stability.js](../../src/equilibrium/eos-stability.js)): Michelsen's
  tangent-plane-distance test (Fluid Phase Equilib. 9 (1982) 1), with near-pure and Wilson trial
  phases.

## Diagrams, azeotropes and residue curves

- **Diagrams** ([diagrams.js](../../src/equilibrium/diagrams.js)): T-x-y, P-x-y and the ternary
  bubble-temperature grid, for any model.
- **Azeotropes** ([azeotrope.js](../../src/equilibrium/azeotrope.js)): solves y = x by damped Newton.
- **Residue curves** ([residue.js](../../src/equilibrium/residue.js)): dx/dξ = x − y, integrated in
  both directions.

## Phase envelope of a gas mixture

[envelope.js](../../src/equilibrium/envelope.js), `CHEPTA.phaseEnvelope(sys, z)`, with an equation of state (Peng–Robinson
or SRK; proposal 0013, step 7). The dew curve and the bubble curve are one line, traced from a dew point at 50 kPa
through the cricondentherm, the cricondenbar and the mixture critical point, and down the bubble curve to 50 kPa. The
unknowns are ln K_i, ln T and ln P, with one of them specified at each point, after Michelsen (1980), as the
open-source thermopack (Apache 2.0) writes the equations: the unknown that changes fastest is specified, and near the
critical point (every |ln K| below 0.1) the largest ln K, which is stepped over zero to its mirror value; there the
parent phase becomes the liquid. The critical point is where that ln K passes zero (interpolated). Steps are at most
0.02 in ln T and 0.1 in ln P; a point far from its prediction is refused and the step halved.

Checked ([`test/envelope.test.js`](../../test/envelope.test.js)):
- against CoolProp 8.0.0's Peng–Robinson ([`validation/python/reference_envelope.py`](../../validation/python/reference_envelope.py),
  k_ij = 0 on both sides): methane + n-butane, every CoolProp point on the line within 0.4 %, the critical point within
  0.05 K and 0.1 %; a natural gas of ten components, the bubble temperatures of CoolProp's saturation solver within
  0.01 K and its dew temperatures within 0.1 K, the critical point between the pressures where CoolProp's bubble and
  dew temperatures meet (CoolProp's separate critical-point solver gives a point 0.2 K off its own flash curve);
- against the measured dew points of four natural gases (Zhang et al., ACS Omega 5 (2020) 8463, open access;
  [`validation/data/envelope/zhang2020_natural_gas.json`](../../validation/data/envelope/zhang2020_natural_gas.json)):
  three synthetic gases of 11 components and a real gas of 21 (with hydrogen and helium), with CHEPTA's k_ij: mean
  deviations 2.7-4.6 K (Peng–Robinson) and 1.3-2.5 K (SRK), as the paper's own Tables 4 and 5 (1.6-4.7 and 1.4-2.8 K).
  The four gases are the Examples of the envelope view, with their measured points drawn.
- a bubble curve that turns back up (hydrogen and helium dissolve less in the cold liquid, so the bubble pressure has
  a lowest point): the line ends at three times that lowest pressure, and says so.

## Property charts

[charts.js](../../src/equilibrium/charts.js), `CHEPTA.propertyChart(sys, z, opts)` (proposal 0013, step 7), with an
equation of state: the data of a pressure-enthalpy, temperature-entropy or enthalpy-entropy chart.
- **Dome:** for one component, its saturated liquid and vapour from the equation's vapour pressure up to the critical
  point, from 0.55 Tc or the melting point; for a mixture, the feed at its bubble and dew points along the phase
  envelope.
- **Lines:** isobars, isotherms (a pure fluid's flat inside the dome) and lines of constant vapour fraction, each
  point a flash with its enthalpy and entropy.
- **Compression:** the inlet, the isentropic outlet (P-S flash) and the outlet at the efficiency; the path between
  them is drawn straight.
- **Workbench:** the Charts workspace (formerly Steam): Water and steam (IAPWS-IF97, now also P-h and h-s) or Any fluid,
  per kg.
- **Checks** ([test/charts.test.js](../../test/charts.test.js)): the dome and isobars of propane and carbon dioxide
  within 0.5 % of an independent Peng–Robinson ([validation/python/reference_charts.py](../../validation/python/reference_charts.py)).

## Solids: solid-liquid equilibrium

[`sle.js`](../../src/equilibrium/sle.js) (proposal 0007):

- **Model:** a pure solid in equilibrium with the solution, using the equation of Gmehling et al.
  (2012) as implemented in `chemicals.solubility_eutectic`.
- **Results:** solubility, the liquidus and the eutectic.
- **Check reports:**
  - the ideal solution against measured data: [../SLE_CHECKS.md](../SLE_CHECKS.md);
  - NRTL fitted to solubilities: [../SLE_FITS.md](../SLE_FITS.md).

## Checks against measured and reference data

- Every test compares the engine with an independent calculation (`validation/python/`) or with open
  measured data (`validation/data/`). The tests choose their property method by
  [../METHOD_SELECTION.md](../METHOD_SELECTION.md).
- Known deviations are recorded in [src/data/known-issues.json](../../src/data/known-issues.json).
