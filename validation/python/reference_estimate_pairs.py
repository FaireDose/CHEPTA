"""Reference values for missing pairs estimated from Modified UNIFAC 2.0 (decision 2026-11-13-05), written to
validation/fixtures/estimated_pairs.json.

    python validation/python/reference_estimate_pairs.py

An independent calculation, sharing no code with src/thermo/activity/estimate-pairs.js:
  - the reference activity coefficients: the thermo library's modified UNIFAC (Dortmund) implementation (UNIFAC
    version 1, MIT licence) with the Modified UNIFAC 2.0 tables read from the arXiv CSV files
    (validation/data/unifac/mod-unifac-2.0/, CC BY 4.0) and the groups of src/data/components.json, as
    mod_unifac_2.py does for its fixtures;
  - the models: thermo's NRTL, UNIQUAC and Wilson classes (thermo.nrtl.NRTL, thermo.uniquac.UNIQUAC,
    thermo.wilson.Wilson), with tau_ij = b_ij / T (NRTL, alpha 0.3), tau_ij = exp(b_ij / T) (UNIQUAC),
    Lambda_ij = exp(b_ij / T) (Wilson);
  - the regression: scipy.optimize.least_squares on the residuals ln gamma(model) - ln gamma(Mod. UNIFAC 2.0) at the
    same temperatures and compositions as the engine's scheme (written out again below), from the same starting
    points, the best kept.

For each case the fixture holds the parameters, the root-mean-square residual, and at check points that the
regression did not use (x_1 = 0.15, 0.45, 0.85 at temperatures between the regression temperatures) ln gamma of the
estimate and of Modified UNIFAC 2.0. Requires numpy, scipy and thermo (0.6.1 when written).
"""
import csv
import json
import warnings
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares

warnings.filterwarnings("ignore")
import thermo  # noqa: E402
import thermo.unifac as u  # noqa: E402
from thermo.nrtl import NRTL  # noqa: E402
from thermo.uniquac import UNIQUAC  # noqa: E402
from thermo.wilson import Wilson  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "validation" / "data" / "unifac" / "mod-unifac-2.0"
OUT = ROOT / "validation" / "fixtures" / "estimated_pairs.json"
COMPS = json.loads((ROOT / "src" / "data" / "components.json").read_text())["components"]

# (model, component 1, component 2): pairs with no stored set of the model, chosen to cover a nearly ideal pair, a
# polar pair, two pairs that Modified UNIFAC 2.0 splits, and the three models
CASES = [
    ("NRTL", "acetone", "ethyl-acetate"),
    ("NRTL", "methanol", "ethylene-glycol"),
    ("NRTL", "benzene", "ethylene-glycol"),
    ("WILSON", "dichloromethane", "methanol"),
    ("UNIQUAC", "ethyl-acetate", "toluene"),
    ("UNIQUAC", "water", "toluene"),
]
X = [0.001, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.999]
X_CHECK = [0.15, 0.45, 0.85]
STARTS = [(0, 0), (300, 300), (-300, 600), (600, -300), (-200, -200), (1000, 1000)]


def temperatures(tb1, tb2):
    """The scheme of the engine: the normal boiling points and their mean, clamped to 250-550 K, at least 30 K wide."""
    tbs = [t for t in (tb1, tb2) if t is not None]
    if len(tbs) == 2:
        lo, hi = min(tbs), max(tbs)
    elif len(tbs) == 1:
        lo, hi = min(298.15, tbs[0]), max(373.15, tbs[0])
    else:
        lo, hi = 298.15, 373.15
    lo, hi = min(max(lo, 250), 550), min(max(hi, 250), 550)
    if hi - lo < 30:
        m = min(max((lo + hi) / 2, 265), 535)
        lo, hi = m - 15, m + 15
    return [round(lo, 2), round((lo + hi) / 2, 2), round(hi, 2)]


def unifac_tables():
    def matrix(name):
        rows = list(csv.reader((SRC / name).read_text().splitlines(), delimiter=";"))
        cols = [int(c) for c in rows[0][1:]]
        return {int(r[0]): {c: float(v) for c, v in zip(cols, r[1:])} for r in rows[1:]}
    a, b = matrix("a_Parameters_modUNIFAC20.csv"), matrix("b_Parameters_modUNIFAC20.csv")
    return {m: {n: (a[m][n], b[m][n], 0.0) for n in a} for m in a}


IP = unifac_tables()


def ln_unifac(ids, T, x):
    groups = [{int(g): n for g, n in COMPS[i]["modUnifac"]["groups"].items()} for i in ids]
    g = u.UNIFAC.from_subgroups(T=T, xs=[x, 1 - x], chemgroups=groups, version=1, interaction_data=IP, subgroups=u.DOUFSG)
    return np.log(g.gammas())


def ln_model(model, ids, b12, b21, T, x):
    xs = [x, 1 - x]
    if model == "NRTL":
        g = NRTL(T=T, xs=xs, tau_bs=[[0, b12], [b21, 0]], alpha_cs=[[0, 0.3], [0.3, 0]])
    elif model == "UNIQUAC":
        rq = [COMPS[i]["uniquac"] for i in ids]
        g = UNIQUAC(T=T, xs=xs, rs=[c["r"] for c in rq], qs=[c["q"] for c in rq], tau_bs=[[0, b12], [b21, 0]])
    else:
        g = Wilson(T=T, xs=xs, lambda_bs=[[0, b12], [b21, 0]])
    return np.log(g.gammas())


def estimate(model, ids):
    T = temperatures(COMPS[ids[0]].get("Tb_K"), COMPS[ids[1]].get("Tb_K"))
    pts = [(t, x, ln_unifac(ids, t, x)) for t in T for x in X]

    def res(p):
        return np.concatenate([ln_model(model, ids, p[0], p[1], t, x) - ref for t, x, ref in pts])

    best = None
    for s in STARTS:
        r = least_squares(res, s, method="lm", xtol=1e-14, ftol=1e-14, gtol=1e-14, max_nfev=5000)
        if best is None or r.cost < best.cost:
            best = r
    p = best.x
    r = res(p)
    checks = []
    for t in [(T[0] + T[1]) / 2, (T[1] + T[2]) / 2]:
        for x in X_CHECK:
            checks.append({"T_K": round(t, 3), "x": x, "lnGamma_estimate": [float(v) for v in ln_model(model, ids, p[0], p[1], t, x)],
                           "lnGamma_mod_unifac_2": [float(v) for v in ln_unifac(ids, t, x)]})
    return {"model": model, "components": ids, "T_K": T, "b_ij": float(p[0]), "b_ji": float(p[1]),
            "rms_ln_gamma": float(np.sqrt(np.mean(r ** 2))), "max_ln_gamma": float(np.max(np.abs(r))), "checks": checks}


def main():
    cases = [estimate(m, [a, b]) for m, a, b in CASES]
    OUT.write_text(json.dumps({
        "description": "Missing pairs estimated from Modified UNIFAC 2.0: the parameters regressed by scipy with thermo's "
                       "models and modified UNIFAC (an independent calculation), and ln gamma at check points the regression "
                       "did not use (validation/python/reference_estimate_pairs.py; decision 2026-11-13-05)",
        "thermo_version": thermo.__version__, "scheme": {"x": X, "x_check": X_CHECK, "alpha_NRTL": 0.3, "starts": STARTS},
        "cases": cases}, indent=1) + "\n")
    for c in cases:
        print(f"{c['model']:8s} {' + '.join(c['components']):35s} T {c['T_K']} b_ij {c['b_ij']:10.3f} b_ji {c['b_ji']:10.3f} "
              f"rms {c['rms_ln_gamma']:.4f} max {c['max_ln_gamma']:.4f}")


if __name__ == "__main__":
    main()
