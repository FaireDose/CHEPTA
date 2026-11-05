"""
Independent reference for the Evaporator block (src/units/evaporator.js; proposal 0015, Part I, section 4; milestone
M3, step 10). It shares no code with the JavaScript engine.

A forward-feed evaporator of N effects, water and one nonvolatile solute, Raoult's law (the "ideal" model; the
nonvolatile component's vapour pressure 1e-20 kPa, docs/DATA_RULES.md section 10, so the vapour is water). Effect k
at pressure P_k; L_k and V_k (kmol/h) the liquid and the vapour leaving it, T_k its temperature. The unknowns T_k,
V_k (k = 1..N) and, for a product concentration, the steam S (kg/h) are solved together:

  bubble     x_w,k p_w(T_k) = P_k                      x_w,k = (F_w - sum_{j<=k} V_j) / (F_tot - sum_{j<=k} V_j)
  enthalpy   h_L(L_(k-1), T_(k-1)) + Q_k = V_k h_V(T_k) + h_L(L_k, T_k)       (the feed for k = 1, at its temperature)
  heating    Q_1 = S h_fg(steam) / 3600,  Q_(k+1) = V_k (h_V(T_k) - h_L,w(T_sat,w(P_k)))   (kW)
  target     the solute's mass fraction in L_N, when it is given (else S is given)

with scipy.optimize.root (hybrid Powell) to a residual below 1e-11 of the feed's scale. The thermodynamics, as
reference_mesh_absorber.IdealNonvolatile (the vapour-pressure records, reference_enthalpy.py's liquid enthalpy of water
and ideal-gas vapour, the integral of the solute's liquid heat capacity from 298.15 K), and the steam's latent heat
from the iapws library (IAPWS-IF97), never from the engine.

The cases include M. Subramanian, Heat Transfer: Evaporation, lecture notes, SSN College of Engineering (2019),
https://msubbu.in/ln/ht/HT-Lecture-17-Evaporation.pdf (free to read), Example 1 (slides 16-20): 30000 kg/h of a 10 %
solution of "solids" to 50 %, steam at 0.2 MPa, boiling at 323 K, U = 2.9 kW/(m2 K), feed at 293 K and at 308 K;
printed: steam 27708.4 and 26786.1 kg/h, economy 0.87 and 0.896, area 83.5 and 80.7 m2. The example takes a constant
heat capacity (3.98 kJ/(kg K)) and latent heats (2202 and 2383 kJ/kg) and no boiling-point rise; here the solids are
citric acid (a stand-in: the example does not name them), the pressure is water's saturation pressure at 323 K, and
the enthalpies are the records'. The printed values are compared in test/evaporator.test.js, within a tolerance that
says how far the example's simplifications are from the records.

Writes validation/fixtures/evaporator.json. Usage: python validation/python/reference_evaporator.py
"""
import json
from pathlib import Path

import numpy as np
from scipy.optimize import brentq, root
from iapws import IAPWS97

from reference_model import COMPONENTS, psat_kpa
from reference_mesh_absorber import IdealNonvolatile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "validation" / "fixtures" / "evaporator.json"


def tsat_water_kpa(P):
    return brentq(lambda T: psat_kpa(COMPONENTS["water"], T) - P, 250.0, 640.0, xtol=1e-13)


def psat_water_iapws(T):
    return IAPWS97(T=T, x=0).P * 1000


def steam_hfg(P_kPa):
    l, v = IAPWS97(P=P_kPa / 1000, x=0), IAPWS97(P=P_kPa / 1000, x=1)
    return v.h - l.h, l.T


def solve_case(case):
    ids = case["components"]
    th = IdealNonvolatile(ids, 101.325)
    MW = np.array([COMPONENTS[c]["MW"] for c in ids])
    w = 0 if ids[0] == "water" else 1
    s = 1 - w
    Fm = np.array([case["feed_kg_h"][c] for c in ids])
    F = Fm / MW                                    # kmol/h
    P = case["P_kPa"]
    N = len(P)
    hfg, Ts = steam_hfg(case["steam_P_kPa"])
    hL = lambda x, T: th.hL(x, T)                  # J/mol
    hV = lambda T: th.hV(np.eye(2)[w], T)
    kw = lambda kmol_h, h: kmol_h * h / 3600       # kmol/h * J/mol -> kW
    hF = kw(F.sum(), hL(F / F.sum(), case["feed_T_K"]))
    target = case.get("product_mass_fraction")

    def unpack(u):
        T = u[:N] * 100
        V = u[N:2 * N] * F.sum()
        S = u[2 * N] * 1e4 if target is not None else case["steam_kg_h"]
        return T, V, S

    def liquids(V):
        out, Lw = [], F[w]
        for k in range(N):
            Lw -= V[k]
            L = np.zeros(2); L[w] = Lw; L[s] = F[s]
            out.append(L)
        return out

    def residual(u):
        T, V, S = unpack(u)
        Ls = liquids(V)
        r = []
        Q = S * hfg / 3600
        Hin = hF
        for k in range(N):
            L = Ls[k]
            x = L / L.sum()
            r.append(x[w] * psat_kpa(COMPONENTS["water"], T[k]) / P[k] - 1)
            Hout = kw(V[k], hV(T[k])) + kw(L.sum(), hL(x, T[k]))
            r.append((Hin + Q - Hout) / 1e4)
            Tc = tsat_water_kpa(P[k])
            Q = kw(V[k], hV(T[k]) - hL(np.eye(2)[w], Tc))
            Hin = kw(L.sum(), hL(x, T[k]))
        if target is not None:
            L = Ls[-1]
            r.append(L[s] * MW[s] / (L * MW).sum() - target)
        return np.array(r)

    Tguess = [tsat_water_kpa(p) + 1 for p in P]
    evap = Fm.sum() * (1 - Fm[s] / Fm.sum() / (target or 0.3)) / MW[w]
    u0 = list(np.array(Tguess) / 100) + [evap / N / F.sum()] * N + ([Fm.sum() / N / 1e4] if target is not None else [])
    sol = root(residual, u0, method="hybr", options={"xtol": 1e-14})
    res = np.max(np.abs(residual(sol.x)))
    assert res < 1e-11, (case["name"], res, sol.message)
    T, V, S = unpack(sol.x)
    Ls = liquids(V)
    effects, Q, Theat = [], S * hfg / 3600, Ts
    for k in range(N):
        Tc = tsat_water_kpa(P[k])
        e = {"T_K": T[k], "vapour_kg_h": V[k] * MW[w], "duty_kW": Q, "BPR_K": T[k] - Tc, "dT_K": Theat - T[k]}
        if "U_W_m2K" in case:
            e["A_m2"] = Q * 1000 / (case["U_W_m2K"][k] * (Theat - T[k]))
        effects.append(e)
        Q = kw(V[k], hV(T[k]) - hL(np.eye(2)[w], Tc))
        Theat = Tc
    evaporated = float(sum(V) * MW[w])
    return {"steam_kg_h": S, "steam_economy": evaporated / S, "evaporated_kg_h": evaporated,
            "product_kg_h": float((Ls[-1] * MW).sum()), "steam_hfg_kJ_kg": hfg, "steam_T_K": Ts, "effects": effects,
            "residual": res}


CASES = [
    # Subramanian 2019, Example 1, at water's saturation pressure at 323 K (IAPWS-IF97)
    dict(name="Subramanian Example 1, feed at 293 K", components=["water", "citric-acid"],
         feed_kg_h={"water": 27000.0, "citric-acid": 3000.0}, feed_T_K=293.0, P_kPa=[psat_water_iapws(323.0)],
         steam_P_kPa=200.0, product_mass_fraction=0.5, U_W_m2K=[2900.0]),
    dict(name="Subramanian Example 1, feed at 308 K", components=["water", "citric-acid"],
         feed_kg_h={"water": 27000.0, "citric-acid": 3000.0}, feed_T_K=308.0, P_kPa=[psat_water_iapws(323.0)],
         steam_P_kPa=200.0, product_mass_fraction=0.5, U_W_m2K=[2900.0]),
    dict(name="triple effect, product concentration", components=["water", "citric-acid"],
         feed_kg_h={"water": 27000.0, "citric-acid": 3000.0}, feed_T_K=293.0, P_kPa=[70.0, 35.0, 12.35],
         steam_P_kPa=200.0, product_mass_fraction=0.5, U_W_m2K=[3000.0, 2000.0, 1200.0]),
    dict(name="double effect, steam given", components=["water", "lactic-acid"],
         feed_kg_h={"water": 9000.0, "lactic-acid": 1000.0}, feed_T_K=330.0, P_kPa=[60.0, 15.0],
         steam_P_kPa=300.0, steam_kg_h=4000.0),
]


def main():
    out = {"_about": "validation/python/reference_evaporator.py: forward-feed evaporators, water and a nonvolatile solute, "
                     "Raoult's law (ideal), solved equation-oriented with scipy; test/evaporator.test.js",
           "cases": []}
    for c in CASES:
        r = solve_case(c)
        print(f"{c['name']}: steam {r['steam_kg_h']:.3f} kg/h, economy {r['steam_economy']:.5f}, residual {r['residual']:.1e}")
        out["cases"].append({**c, "result": r})
    OUT.write_text(json.dumps(out, indent=1, default=float) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
