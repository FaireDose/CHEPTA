"""
Independent reference for the entropy of a mixture, the P-S flash and the compressor and expander (proposal 0013,
step 6): the isentropic outlet of a gas compressed or expanded from an inlet state to an outlet pressure, and the
outlet at an isentropic efficiency (h_out = h_in + (h_s - h_in) / eta for a compressor, h_in - eta (h_in - h_s) for an
expander).

Peng-Robinson, written here as the sum of two parts that share no code with the JavaScript engine:
- the ideal gas: s_IG = sum z_i integral of cp0_i/T dT - R sum z_i ln(z_i P / P0), h_IG = sum z_i integral of cp0_i dT,
  with cp0 from CoolProp 8.0.0 (MIT), the ideal-gas part of its reference equations of state;
- the departure from the ideal gas at the same T and P: the thermo library (MIT), thermo.eos_mix.PRMIX (S_dep, H_dep)
  and, inside the dome of a pure fluid, thermo.eos.PR (Tsat and the saturated liquid and vapour roots).
The critical constants and acentric factors are CHEPTA's own (src/data/components.json) and k_ij = 0, so the algorithm
is compared and not the parameters. CoolProp's own cubic backend is not used: its molar entropy does not follow from its
ideal-gas and residual parts (methane, 300 K and 100 kPa to 485 K and 1000 kPa: its smolar changes by 3.25 J/(mol K)
where its cp0 integral and smolar_residual give -0.01), so its isentropic outlets are off (452 K against 485 K).
The reference equations of state ("HEOS::") are given for information: the difference is Peng-Robinson's own.

Writes validation/fixtures/compressor.json.

Usage: python validation/python/reference_compressor.py
"""
import json
import math
from pathlib import Path

import CoolProp
import CoolProp.CoolProp as CP
from scipy.integrate import quad
from scipy.optimize import brentq
from thermo.eos import PR
from thermo.eos_mix import PRMIX

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "validation" / "fixtures" / "compressor.json"
COMPS = json.loads((ROOT / "src" / "data" / "components.json").read_text())["components"]
R = 8.314462618
T0, P0 = 298.15, 101325.0
COOLPROP = {"methane": "Methane", "ethane": "Ethane", "propane": "Propane", "nitrogen": "Nitrogen",
            "carbon-dioxide": "CarbonDioxide"}
# (CHEPTA ids, mole fractions, inlet T in K, inlet P in kPa (None: saturated vapour at T), outlet P in kPa, efficiency)
CASES = [
    (["methane"], [1.0], 300.0, 100.0, 1000.0, 0.75),
    (["nitrogen"], [1.0], 300.0, 100.0, 600.0, 0.80),
    (["carbon-dioxide"], [1.0], 300.0, 1000.0, 5000.0, 0.75),
    (["methane", "ethane"], [0.8, 0.2], 300.0, 2000.0, 6000.0, 0.75),
    (["methane", "ethane"], [0.8, 0.2], 300.0, 6000.0, 1500.0, 0.85),   # expander
    (["propane"], [1.0], 300.0, None, 200.0, 0.85),                       # expander from saturated vapour: wet outlet
]

_cp0 = {}


def cp0(name, T):
    AS = _cp0.setdefault(name, CP.AbstractState("HEOS", name))
    AS.specify_phase(CP.iphase_gas)
    AS.update(CP.PT_INPUTS, 1000.0, T)
    v = AS.cp0molar()
    AS.unspecify_phase()
    return v


def ideal(ids, z, T, P):
    """(h, s) of the ideal-gas mixture, J/mol and J/(mol K), relative to each ideal gas at T0, P0."""
    h = s = 0.0
    for i, zi in zip(ids, z):
        if zi <= 0:
            continue
        name = COOLPROP[i]
        h += zi * quad(lambda t: cp0(name, t), T0, T, epsabs=1e-9, epsrel=1e-11)[0]
        s += zi * (quad(lambda t: cp0(name, t) / t, T0, T, epsabs=1e-12, epsrel=1e-11)[0] - R * math.log(zi * P / P0))
    return h, s


def crit(ids):
    return ([COMPS[i]["Tc_K"] for i in ids], [COMPS[i]["Pc_Pa"] for i in ids], [COMPS[i]["omega"] for i in ids])


def gas(ids, z, T, P):
    """(h, s) of the vapour root at T, P (Pa)."""
    Tcs, Pcs, ws = crit(ids)
    e = PRMIX(Tcs=Tcs, Pcs=Pcs, omegas=ws, zs=z, kijs=[[0.0] * len(ids) for _ in ids], T=T, P=P)
    hI, sI = ideal(ids, z, T, P)
    if hasattr(e, "S_dep_g"):
        return hI + e.H_dep_g, sI + e.S_dep_g
    # one root only, which thermo files as liquid-like where the fluid is dense (above the critical temperature too)
    return hI + e.H_dep_l, sI + e.S_dep_l


def saturated(ids, P):
    """Tsat and the (h, s) of the saturated liquid and vapour of a pure fluid at P (Pa), or None above Pc."""
    Tc, Pc, w = (v[0] for v in crit(ids))
    if P >= Pc:
        return None
    Ts = PR(Tc=Tc, Pc=Pc, omega=w, T=0.7 * Tc, P=P).Tsat(P)
    e = PR(Tc=Tc, Pc=Pc, omega=w, T=Ts, P=P)
    hI, sI = ideal(ids, [1.0], Ts, P)
    return Ts, (hI + e.H_dep_l, sI + e.S_dep_l), (hI + e.H_dep_g, sI + e.S_dep_g)


def solve(ids, z, P, k, target):
    """(T, VF) at P (Pa) where the molar enthalpy (k = 0) or entropy (k = 1) is target: in the dome of a pure fluid
    from the saturated values, else the vapour root above the saturation temperature (or 150 K)."""
    lo = 150.0
    if len(ids) == 1:
        sat = saturated(ids, P)
        if sat:
            Ts, L, V = sat
            if L[k] <= target <= V[k]:
                return Ts, (target - L[k]) / (V[k] - L[k])
            lo = Ts + 1e-6
    T = brentq(lambda t: gas(ids, z, t, P)[k] - target, lo, 1500.0, xtol=1e-10)
    return T, 1.0


def main():
    out = {"_about": "Isentropic outlet and the outlet at an isentropic efficiency: Peng-Robinson as the ideal gas "
                     f"(cp0 of CoolProp {CoolProp.__version__}) plus the departure of thermo {__import__('thermo').__version__} "
                     "(PRMIX, PR), with CHEPTA's Tc, Pc, omega and k_ij = 0; HEOS:: CoolProp's reference equations "
                     "for information. Written by validation/python/reference_compressor.py.", "cases": []}
    for ids, z, T1, P1, P2, eta in CASES:
        if P1 is None:
            Tc, Pc, w = (v[0] for v in crit(ids))
            P_in = PR(Tc=Tc, Pc=Pc, omega=w, T=T1, P=1e5).Psat(T1)
            h1, s1 = saturated(ids, P_in)[2]
        else:
            P_in = P1 * 1e3
            h1, s1 = gas(ids, z, T1, P_in)
        Ts, qs = solve(ids, z, P2 * 1e3, 1, s1)
        if qs < 1.0:
            _, L, V = saturated(ids, P2 * 1e3)
            hs = L[0] + qs * (V[0] - L[0])
        else:
            hs = gas(ids, z, Ts, P2 * 1e3)[0]
        w_s = hs - h1
        h2 = h1 + (w_s / eta if P2 * 1e3 > P_in else eta * w_s)
        T2, q2 = solve(ids, z, P2 * 1e3, 0, h2)
        row = {"components": ids, "z": z, "T_in_K": T1, "P_in_kPa": round(P_in / 1e3, 6), "P_out_kPa": P2,
               "efficiency": eta,
               "PR": {"T_s_K": round(Ts, 6), "VF_s": round(qs, 6), "w_s_J_mol": round(w_s, 4),
                      "T_out_K": round(T2, 6), "VF_out": round(q2, 6), "w_J_mol": round(h2 - h1, 4)}}
        if True:
            AS = CP.AbstractState("HEOS", "&".join(COOLPROP[i] for i in ids))
            if len(ids) > 1:
                AS.set_mole_fractions(z)
            try:
                if P1 is None:
                    AS.update(CP.QT_INPUTS, 1, T1)
                else:
                    AS.update(CP.PT_INPUTS, P_in, T1)
                hH, sH = AS.hmolar(), AS.smolar()
                AS.update(CP.PSmolar_INPUTS, P2 * 1e3, sH)
                row["HEOS"] = {"T_s_K": round(AS.T(), 4), "VF_s": round(min(max(AS.Q(), 0), 1), 4) if 0 <= AS.Q() <= 1 else 1.0,
                               "w_s_J_mol": round(AS.hmolar() - hH, 3)}
            except ValueError as e:
                row["HEOS"] = {"error": str(e)[:160]}
        out["cases"].append(row)
        print(row)
    OUT.write_text(json.dumps(out, indent=2) + "\n")


if __name__ == "__main__":
    main()
