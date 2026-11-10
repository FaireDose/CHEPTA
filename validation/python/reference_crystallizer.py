"""
Independent reference for the Crystallizer block (src/units/crystallizer.js; proposal 0015, Part I, section 4;
milestone M3, step 10). It shares no code with the JavaScript engine.

Succinic acid crystallized from water, NRTL with the set fitted to its measured solubilities (fitted-sle-thermoml,
validation/python/fit_sle.py). The solubility: the open-source `chemicals` library, solubility_eutectic (as
reference_sle.py), with gamma from reference_model.System, solved for x by brentq (the solvent-rich root). Then:

  cooling       C = n_s - x_s n_w / (1 - x_s)                     (the solvent's flow unchanged)
  evaporative   the vapour is water (succinic acid is nonvolatile, 1e-20 kPa): n_w -> n_w - E / M_w, then as cooling;
                at T the pressure is the mother liquor's bubble pressure, x_w gamma_w p_w(T); at P, T is found by brentq
  energy        duty = H(mother liquor) + H(crystals) + H(vapour) - H(feed), with the liquid enthalpy of
                reference_enthalpy.py (water's record, the nonvolatile acid's liquid heat capacity integrated from
                298.15 K, the NRTL excess enthalpy of the thermo library), water's ideal-gas vapour, and the crystals
                h_L,acid(T) - dH_fus (the block's stated rule)

Writes validation/fixtures/crystallizer.json. Usage: python validation/python/reference_crystallizer.py
"""
import json
from pathlib import Path

import numpy as np
from chemicals.solubility import solubility_eutectic
from scipy.integrate import quad
from scipy.optimize import brentq

from reference_model import System, COMPONENTS, psat_kpa
from reference_enthalpy import h_liquid_pure, h_excess, h_ig, cp_liquid, T_REF

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "validation" / "fixtures" / "crystallizer.json"
IDS = ["water", "succinic-acid"]
S = System(IDS, "NRTL")
MW = np.array([COMPONENTS[c]["MW"] for c in IDS])
TM, HFUS = COMPONENTS["succinic-acid"]["fusion"]["Tm_K"], COMPONENTS["succinic-acid"]["fusion"]["Hfus_J_mol"]


def h_pure(k, T):
    if COMPONENTS[IDS[k]].get("class") == "nonvolatile":
        return quad(lambda t: cp_liquid(IDS[k], t), T_REF, T, epsabs=1e-9, epsrel=1e-12)[0]
    return h_liquid_pure(IDS[k], T, None, k, 2, COMPONENTS[IDS[k]])


def H_liquid(n, T):
    """kW for flows n (kmol/h)."""
    F = sum(n)
    x = np.asarray(n) / F
    h = sum(x[k] * h_pure(k, T) for k in range(2) if x[k] > 0) + h_excess(S, x, T)
    return F * h / 3600


def solubility(T):
    rhs = solubility_eutectic(T, TM, HFUS)

    def f(lx):
        xs = np.exp(lx)
        return lx + np.log(S.gamma(np.array([1 - xs, xs]), T)[1]) - np.log(rhs)
    grid = np.linspace(np.log(1e-12), 0.0, 241)
    fs = [f(u) for u in grid]
    for k in range(len(grid) - 1):
        if fs[k] < 0 <= fs[k + 1]:
            return float(np.exp(brentq(f, grid[k], grid[k + 1], xtol=1e-15)))
    raise RuntimeError("no root")


def crystallize(n, T):
    xs = solubility(T)
    sat = xs * n[0] / (1 - xs)
    C = max(0.0, n[1] - sat)
    return C, np.array([n[0], n[1] - C]), xs


def bubble_P(ml, T):
    x = ml / ml.sum()
    return x[0] * S.gamma(x, T)[0] * psat_kpa(COMPONENTS["water"], T) + x[1] * 1e-20


def solve(case):
    F = np.array([case["feed_kg_h"][c] for c in IDS]) / MW
    Hf = H_liquid(F, case["feed_T_K"])
    E = case.get("evaporated_kg_h", 0.0)
    V = E / MW[0]
    L0 = F - np.array([V, 0.0])
    if E > 0 and "T_K" in case:
        T = case["T_K"]
    elif E > 0:
        T = brentq(lambda t: bubble_P(crystallize(L0, t)[1], t) - case["P_kPa"], 280.0, 400.0, xtol=1e-12)
    else:
        T = case["T_K"]
    C, ml, xs = crystallize(L0, T)
    P = bubble_P(ml, T) if E > 0 else case.get("P_kPa", 101.325)
    h_cr = h_pure(1, T) - HFUS
    duty = H_liquid(ml, T) + C * h_cr / 3600 + V * h_ig("water", T) / 3600 - Hf
    return {"T_K": T, "P_kPa": P, "solubility_x": xs, "crystals_kmol_h": C, "yield": C / F[1], "duty_kW": duty,
            "mother_liquor_kmol_h": ml.tolist(), "vapour_kmol_h": [V, 0.0]}


FEED = {"water": 800.0, "succinic-acid": 200.0}
CASES = [
    dict(name="cooling to 288.15 K", feed_kg_h=FEED, feed_T_K=343.15, T_K=288.15),
    dict(name="cooling to 298.15 K", feed_kg_h=FEED, feed_T_K=343.15, T_K=298.15),
    dict(name="evaporative at 333.15 K", feed_kg_h=FEED, feed_T_K=343.15, T_K=333.15, evaporated_kg_h=300.0),
    dict(name="evaporative at 20 kPa", feed_kg_h=FEED, feed_T_K=343.15, P_kPa=20.0, evaporated_kg_h=300.0),
]


def main():
    out = {"_about": "validation/python/reference_crystallizer.py: succinic acid crystallized from water, NRTL (fitted-sle-thermoml), "
                     "chemicals.solubility_eutectic; test/crystallizer.test.js", "cases": []}
    for c in CASES:
        r = solve(c)
        print(f"{c['name']}: T {r['T_K']:.4f} K, x {r['solubility_x']:.6g}, yield {r['yield']:.6f}, duty {r['duty_kW']:.4f} kW")
        out["cases"].append({**c, "result": r})
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
