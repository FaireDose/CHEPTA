"""
Independent reference for the Membrane block (proposal 0015, Part I, section 4; milestone M3, step 9): gas permeation
by the solution-diffusion model over well-mixed cells, co-current or counter-current. It shares no code with the
JavaScript engine (src/units/membrane.js) and is written in another form: its unknowns are the retentate flows leaving
each cell, where the engine's are the flows permeated in each cell, and it is solved by scipy.optimize.root (MINPACK's
hybrid method) with a continuation in the area, where the engine uses its own Newton method.

The model (K. Aziaba, C. Jordan, B. Haddadi and M. Harasek, "Design of a gas permeation and pervaporation membrane
model for an open source process simulation tool", Membranes 12 (2022) 1186, doi:10.3390/membranes12121186, CC BY 4.0;
read in its open full text at Europe PMC, PMC9784710): the local flux of each component is its permeance times its
partial-pressure difference across the membrane (Equation (1), d(x n) = -Q A (x P - y p), Dalton's partial pressures);
the stage cut is the permeate flow over the feed flow (Equation (3)); "perfect mixing in every compartment", no
pressure variation along the module, permeances independent of composition, temperature and pressure (section 1.3).
Cell k (k = 1..N along the feed side, area A/N each) is well mixed on both sides:

    R_{k-1,i} - R_{k,i} = (A/N) Q_i (P x_{k,i} - p y_{k,i}),   x_k = R_k / sum(R_k)

with R_0 the feed. The permeate side's composition in cell k, y_k, is that of the permeate gathered there: from cells
1..k (co-current: the permeate flows along with the feed and leaves after cell N) or from cells k..N (counter-current:
it flows against the feed and leaves at cell 1). With one cell both are the complete-mixing model; with many cells they
approach the plug-flow co- and counter-current models.

Checks (the cases of validation/fixtures/membrane.json):
  - H. Binous, "Gas permeation computations with Mathematica", Chemical Engineering Education 40 (2006) 140-144,
    free to read on the journal's archive (https://journals.flvc.org/cee/article/view/122538): the ternary mixture by
    complete mixing (p. 140-141) and the enrichment of air in oxygen by complete mixing, cross flow, counter-current and
    co-current flow (p. 141-144), with the areas, permeate and reject compositions it prints;
  - a four-component case with the permeances and pressures of Aziaba et al.'s test case 3 (Table 1), at an area and
    feed flow chosen here (the article gives them only as figures), engine against this reference.

The worked example's units are kept (cm3(STP)/s, cmHg, cm2, permeance = permeability / thickness in cm3(STP)/(s cm2
cmHg)): the model is homogeneous in them, so an area found in these units is the area in cm2 whatever unit converts the
flows and the permeances, as long as the same one converts both.

Usage: python validation/python/reference_membrane.py          (prints the cases)
       python validation/python/reference_membrane.py --write  (also writes validation/fixtures/membrane.json)
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import brentq, root

ROOT = Path(__file__).resolve().parents[2]


def cells(F, Q, P, p, A, N, flow, R0=None):
    """Retentate flows R (N x c) leaving each cell for area A; R0 a start (N x c) or None.

    With the retentate flows as unknowns the permeate gathered in cell k is closed in form: F - R_k (co-current, cells
    1..k) or R_{k-1} - R_N (counter-current, cells k..N), which gives the Jacobian below in closed form."""
    F = np.asarray(F, float)
    Q = np.asarray(Q, float)
    c = len(F)
    co = flow == "co-current"
    scale = F.sum()

    def parts(v):
        R = v.reshape(N, c)
        prev = np.vstack([F, R[:-1]])
        S = (F - R) if co else (prev - R[-1])
        return R, prev, S

    def resid(v, a):
        R, prev, S = parts(v)
        x = R / R.sum(axis=1, keepdims=True)
        y = S / S.sum(axis=1, keepdims=True)
        return ((prev - R - a * Q * (P * x - p * y)) / scale).ravel()

    def jac(v, a):
        R, prev, S = parts(v)
        J = np.zeros((N * c, N * c))
        I = np.eye(c)
        for k in range(N):
            rk, sk = R[k].sum(), S[k].sum()
            x, y = R[k] / rk, S[k] / sk
            dx = (I - x[:, None]) / rk          # d x_i / d R_{k,l}
            dy = (I - y[:, None]) / sk          # d y_i / d S_{k,l}
            row = slice(k * c, (k + 1) * c)
            blk = lambda m: slice(m * c, (m + 1) * c)
            J[row, blk(k)] += -I - a * Q[:, None] * P * dx
            if k > 0:
                J[row, blk(k - 1)] += I
            if co:
                J[row, blk(k)] += a * Q[:, None] * p * (-dy)
            else:
                if k > 0:
                    J[row, blk(k - 1)] += a * Q[:, None] * p * dy
                J[row, blk(N - 1)] += a * Q[:, None] * p * (-dy)
        return J / scale

    def solve(start, a):
        sol = root(resid, start.ravel(), args=(a,), jac=jac, method="hybr", options={"xtol": 1e-14})
        R = sol.x.reshape(N, c)
        ok = np.max(np.abs(resid(sol.x, a))) < 1e-12
        return R, ok and np.all(R > -1e-14)

    if R0 is not None:
        R, ok = solve(R0, A / N)
        if ok:
            return R
    # continuation in the area from a tenth of a percent of it: the start there is the feed minus the fluxes at the
    # feed's composition
    R = None
    for f in np.geomspace(1e-3, 1.0, 13):
        a = A * f / N
        if R is None:
            n0 = a * Q * P * F / F.sum()
            R = F - np.cumsum(np.tile(n0, (N, 1)), axis=0)
        R, ok = solve(R, a)
        if not ok:
            raise RuntimeError(f"no solution at {f:.3g} of the area")
    return R


def outlets(F, R, N, flow):
    F = np.asarray(F, float)
    perm = F - R[-1]
    return perm, R[-1]


def area_for(F, Q, P, p, N, flow, stage_cut=None, recovery=None):
    """The area for a stage cut (permeate / feed) or a recovery (component index, fraction into the permeate)."""
    F = np.asarray(F, float)

    last = {}

    def measure(A):
        R = cells(F, Q, P, p, A, N, flow, last.get("R"))
        last["R"] = R
        perm = F - R[-1]
        return (perm.sum() / F.sum()) if stage_cut is not None else perm[recovery[0]] / F[recovery[0]]

    target = stage_cut if stage_cut is not None else recovery[1]
    A0 = target * F.sum() / np.sum(np.asarray(Q) * P * F / F.sum())
    lo, hi = A0 / 4, A0
    while measure(hi) < target:
        lo, hi = hi, hi * 2
    while measure(lo) > target:
        lo /= 2
    return brentq(lambda A: measure(A) - target, lo, hi, xtol=1e-14 * hi, rtol=1e-13, maxiter=500)


def binous_ternary():
    # p. 140-141: x_f = 0.25, 0.55, 0.20; q_f = 1.0e4 cm3(STP)/s; stage cut 0.25; permeabilities 200, 50, 25 x 1e-10
    # cm3(STP) cm/(s cm2 cmHg); t = 2.54e-3 cm; p_h = 300 cmHg, p_l = 30 cmHg; complete mixing
    t = 2.54e-3
    return dict(F=[0.25e4, 0.55e4, 0.20e4], Q=[200e-10 / t, 50e-10 / t, 25e-10 / t], P=300.0, p=30.0)


def binous_air():
    # p. 141-142: x_fA = 0.209 (oxygen), 0.791 (nitrogen); q_f = 1.0e6 cm3(STP)/s; stage cut 0.2; P'_A = 500e-10,
    # alpha* = 10 (so P'_B = 50e-10); t = 2.54e-3 cm; p_h = 190 cmHg, p_l = 19 cmHg
    t = 2.54e-3
    return dict(F=[0.209e6, 0.791e6], Q=[500e-10 / t, 50e-10 / t], P=190.0, p=19.0)


def aziaba_case3():
    # Aziaba et al. 2022, Table 1, test case 3 (Chowdhury et al. 2005): H2, N2, CH4, Ar 51.78, 24.69, 19.57, 3.96 %;
    # feed 69.64 bar, permeate 11230 mbar; permeances 284, 2.95, 2.84, 70 x 1e-10 mol/(s m2 Pa) (as printed). The feed
    # flow (1 mol/s) and the area (5 m2) are this project's choices.
    return dict(F=[0.5178, 0.2469, 0.1957, 0.0396], Q=[284e-10, 2.95e-10, 2.84e-10, 70e-10], P=69.64e5, p=11.230e5)


def case(name, d, N, flow, A=None, stage_cut=None, recovery=None, published=None):
    if A is None:
        A = area_for(d["F"], d["Q"], d["P"], d["p"], N, flow, stage_cut=stage_cut, recovery=recovery)
    R = cells(d["F"], d["Q"], d["P"], d["p"], A, N, flow)
    perm, ret = outlets(d["F"], R, N, flow)
    out = {"name": name, "flow": flow, "cells": N, "feed": d["F"], "permeance": d["Q"], "P_feed": d["P"], "P_permeate": d["p"],
           "A": A, "stage_cut": float(perm.sum() / np.sum(d["F"])),
           "permeate": perm.tolist(), "retentate": ret.tolist(),
           "y_permeate": (perm / perm.sum()).tolist(), "x_retentate": (ret / ret.sum()).tolist(),
           "retentate_by_cell": R.tolist()}
    if stage_cut is not None:
        out["target"] = {"stage_cut": stage_cut}
    if recovery is not None:
        out["target"] = {"recovery": {"component": recovery[0], "value": recovery[1]}}
    if published:
        out["published"] = published
    return out


def cases():
    tern, air = binous_ternary(), binous_air()
    src = "Binous 2006, Chem. Eng. Educ. 40, 140-144"
    return [
        case("binous-ternary-complete-mixing", tern, 1, "counter-current", stage_cut=0.25,
             published={"source": src + ", p. 141", "A_cm2": 3.54176e6, "y_permeate": [0.455281, 0.450286, 0.0944335],
                        "x_retentate": [0.181573, 0.583238, 0.235189]}),
        case("binous-air-complete-mixing", air, 1, "co-current", stage_cut=0.2,
             published={"source": src + ", p. 142", "A_cm2": 3.228e8, "y_permeate_O2": 0.5067, "x_retentate_O2": 0.1346}),
        case("binous-air-counter-current", air, 200, "counter-current", stage_cut=0.2,
             published={"source": src + ", p. 143 (plug flow)", "A_cm2": 2.859e8, "y_permeate_O2": 0.5763, "x_retentate_O2": 0.1171}),
        case("binous-air-co-current", air, 200, "co-current", stage_cut=0.2,
             published={"source": src + ", p. 144 (plug flow)", "A_cm2": 2.955e8, "y_permeate_O2": 0.5584, "x_retentate_O2": 0.1216}),
        case("aziaba-case3-counter-10-cells", aziaba_case3(), 10, "counter-current", A=5.0),
        case("aziaba-case3-co-10-cells", aziaba_case3(), 10, "co-current", A=5.0),
        case("aziaba-case3-recovery-H2", aziaba_case3(), 10, "counter-current", recovery=(0, 0.9)),
    ]


if __name__ == "__main__":
    res = cases()
    for r in res:
        pub = r.get("published", {})
        print(f'{r["name"]:36s} N={r["cells"]:4d} A={r["A"]:.6g} theta={r["stage_cut"]:.6f} '
              f'y={np.round(r["y_permeate"], 6).tolist()} x={np.round(r["x_retentate"], 6).tolist()}'
              + (f'  published A={pub.get("A_cm2")}' if pub else ""))
    if "--write" in sys.argv:
        doc = {"_about": "Membrane block (proposal 0015, M3, step 9): cells of the solution-diffusion model, from "
                         "validation/python/reference_membrane.py (scipy). Units of each case as in its source: the "
                         "Binous cases in cm3(STP)/s, cmHg, cm2 and cm3(STP)/(s cm2 cmHg); the Aziaba case 3 in mol/s, "
                         "Pa, m2 and mol/(s m2 Pa).",
               "cases": res}
        path = ROOT / "validation" / "fixtures" / "membrane.json"
        path.write_text(json.dumps(doc, indent=1) + "\n")
        print("wrote", path)
