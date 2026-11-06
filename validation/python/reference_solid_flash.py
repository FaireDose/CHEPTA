"""
Independent reference for solids in equilibrium in every stream (src/equilibrium/solid-flash.js; proposal 0015, Part I,
section 5) and the terephthalic acid example (examples/tpa-recrystallization.chepta.json). It shares no code with the
JavaScript engine.

Water and terephthalic acid (nonvolatile), the ideal solution (Raoult's law with the vapour-pressure record of water;
TPA's vapour pressure 1e-20 kPa, docs/DATA_RULES.md section 10). TPA's solubility: the measured curve of
src/data/components.json (Apelblat form, validation/python/solubility_curves.py), x_sat = exp(A + B/T + C ln T); the
solid's enthalpy h_s = h_L,TPA(T) - dH_sol(T), dH_sol = R (C T - B) (the curve's van't Hoff slope). Liquid enthalpies of
reference_enthalpy.py (water's records; TPA's liquid heat capacity integrated from 298.15 K), water's ideal-gas vapour.

The chain: a 20 % slurry at 360 K and 8 MPa; heated at 8 MPa to 547 K (all dissolves); three adiabatic flash drums at
4, 2 and 0.8 MPa (each takes the liquid and the solid of the one before; its vapour leaves); then a cooling
crystallizer at 373.15 K and 0.8 MPa, whose crystals and mother liquor leave. Each state: unknowns T, the vapour V and
the solid c (kmol/h), solved with scipy.optimize.root from
    x_w p_w(T) = P                                  (a vapour forms; V = 0 otherwise)
    x_TPA = x_sat(T)                                (a solid forms; c = 0 otherwise)
    H_in = V h_V(T) + L h_L(x, T) + c h_s(T)        (adiabatic; or T given)
Writes validation/fixtures/solid_flash.json. Usage: python validation/python/reference_solid_flash.py
"""
import json
from pathlib import Path

import numpy as np
from scipy.integrate import quad
from scipy.optimize import brentq, root

from reference_model import COMPONENTS, psat_kpa
from reference_enthalpy import h_liquid_pure, h_ig, cp_liquid, T_REF

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "validation" / "fixtures" / "solid_flash.json"
R = 8.314462618
IDS = ["water", "terephthalic-acid"]
MW = np.array([COMPONENTS[c]["MW"] for c in IDS])
CURVE = next(c for c in COMPONENTS["terephthalic-acid"]["solubility"] if c["solvent"] == "water")


def x_sat(T):
    assert CURVE["Tmin_K"] - 1e-9 <= T <= CURVE["Tmax_K"] + 1e-9, T
    return np.exp(CURVE["A"] + CURVE["B"] / T + CURVE["C"] * np.log(T))


def h_w(T):
    return h_liquid_pure("water", T, None, 0, 2, COMPONENTS["water"])


def h_t(T):
    return quad(lambda t: cp_liquid("terephthalic-acid", t), T_REF, T, epsabs=1e-9, epsrel=1e-12)[0]


def h_solid(T):
    return h_t(T) - R * (CURVE["C"] * T - CURVE["B"])


def H_state(n, T, V, c):
    """kW: vapour V (water), solid c, liquid the rest."""
    L = np.array([n[0] - V, n[1] - c])
    x = L / L.sum()
    hl = x[0] * h_w(T) + x[1] * h_t(T)
    return (V * h_ig("water", T) + L.sum() * hl + c * h_solid(T)) / 3600


def p_w(T):
    return psat_kpa(COMPONENTS["water"], T)


def state(n, P, H=None, T=None):
    """The equilibrium state of flows n (kmol/h) at P, with the enthalpy flow H (kW) or the temperature T."""
    n = np.asarray(n, float)
    best = None
    for vap in (False, True):
        for sol in (False, True):
            def res(u):
                k = 0
                t = T if T is not None else u[k] * 100; k += T is None
                V = u[k] * n.sum() if vap else 0.0; k += vap
                c = u[k] * n[1] if sol else 0.0; k += sol
                L = np.array([n[0] - V, n[1] - c]); x = L / L.sum()
                r = []
                if T is None:
                    r.append((H_state(n, t, V, c) - H) / 100)
                if vap:
                    r.append(x[0] * p_w(t) / P - 1)
                if sol:
                    r.append(np.log(x[1] / x_sat(t)))
                return np.array(r)
            m = (T is None) + vap + sol
            if m == 0:   # T given, one liquid: nothing to solve, only to check
                x = n / n.sum()
                if x[0] * p_w(T) <= P and x[1] <= x_sat(T):
                    best = {"T_K": T, "P_kPa": P, "vapour_kmol_h": 0.0, "solid_kmol_h": 0.0, "liquid_kmol_h": n.tolist(), "x_TPA": x[1]}
                    break
                continue
            # start: T at water's boiling point at P (inside the curve's range), the solid from saturation there
            Tb = brentq(lambda t: p_w(t) - P, 300.0, 640.0)
            t0 = T if T is not None else min(max(Tb, CURVE["Tmin_K"] + 1), CURVE["Tmax_K"] - 1)
            c0 = min(0.999999, max(1e-6, 1 - x_sat(t0) * n[0] / n[1]))
            u0 = ([t0 / 100] if T is None else []) + ([0.05] if vap else []) + ([c0] if sol else [])
            try:
                s = root(res, u0, method="hybr", options={"xtol": 1e-14})
            except (AssertionError, ValueError):
                continue
            if np.max(np.abs(res(s.x))) > 1e-11:   # (hybr may stop at its xtol with the residual already met)
                continue
            k = 0
            t = T if T is not None else s.x[k] * 100; k += T is None
            V = s.x[k] * n.sum() if vap else 0.0; k += vap
            c = s.x[k] * n[1] if sol else 0.0; k += sol
            L = np.array([n[0] - V, n[1] - c]); x = L / L.sum()
            # admissible: positive amounts; without vapour the liquid below its bubble point; without solid unsaturated
            if V < -1e-12 or c < -1e-12 or L.min() < 0:
                continue
            if not vap and x[0] * p_w(t) > P * (1 + 1e-9):
                continue
            if not sol and x[1] > x_sat(t) * (1 + 1e-9):
                continue
            best = {"T_K": t, "P_kPa": P, "vapour_kmol_h": V, "solid_kmol_h": c, "liquid_kmol_h": L.tolist(), "x_TPA": x[1]}
            break
        if best:
            break
    assert best, (n, P, H, T)
    best["H_kW"] = H_state(n, best["T_K"], best["vapour_kmol_h"], best["solid_kmol_h"])
    return best


def main():
    F = np.array([800.0, 200.0]) / MW
    out = {"_about": "validation/python/reference_solid_flash.py: TPA recrystallized from water, ideal solution, the measured solubility "
                     "curve; test/solids.test.js", "feed_kg_h": {"water": 800.0, "terephthalic-acid": 200.0}, "states": []}
    feed = state(F, 8000.0, T=360.0)
    heated = state(F, 8000.0, T=547.0)
    out["states"] += [{"name": "feed", **feed}, {"name": "heated", **heated, "duty_kW": heated["H_kW"] - feed["H_kW"]}]
    n, H = F.copy(), heated["H_kW"]
    for P in (4000.0, 2000.0, 800.0):
        s = state(n, P, H=H)
        out["states"].append({"name": f"drum at {P / 1000:g} MPa", **s})
        n = np.array([n[0] - s["vapour_kmol_h"], n[1]])          # the liquid and the solid go on
        H = s["H_kW"] - s["vapour_kmol_h"] * h_ig("water", s["T_K"]) / 3600
    cr = state(n, 800.0, T=373.15)
    out["states"].append({"name": "crystallizer at 373.15 K", **cr, "duty_kW": cr["H_kW"] - H})
    out["yield"] = cr["solid_kmol_h"] / F[1]
    for s in out["states"]:
        print(f"{s['name']:28s} T {s['T_K']:9.4f} K  V {s['vapour_kmol_h']:9.5f}  solid {s['solid_kmol_h']:9.6f}  x_TPA {s['x_TPA']:.6g}")
    print("yield", out["yield"])
    OUT.write_text(json.dumps(out, indent=1, default=float) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
