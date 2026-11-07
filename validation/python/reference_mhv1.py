"""Independent check of the MHV1 mixing rule of the engine ("SRK/PR + gE (MHV1)", src/thermo/eos/mhv1.js; proposal 0018).

Two implementations that share no code with the engine:

1. CHEPTA's Python cubic (reference_eos.Cubic) with its a(T, x) replaced by the MHV1 rule in the PSRK form,
     a = b R T [ sum_i x_i a_i / (b_i R T) + (1 / A) (g^E / (R T) + sum_i x_i ln(b / b_i)) ],
     A = -ln((u + d1) / (u + d2)) / (d1 - d2), u = 1.1,
   with g^E from the thermo library's NRTL (thermo.nrtl.NRTL, MIT). Its fugacity coefficients come from the
   numerical derivative of n A_res with respect to the mole numbers (reference_eos.Cubic.lnphi), and its residual
   enthalpy from the numerical temperature derivative of A_res. The engine instead uses the analytic partial molar
   form of the rule and numerical T derivatives of its own NRTL, so the two meet only in the equations.
2. For SRK, thermo's PSRK class (thermo.eos_mix.PSRK) with the same NRTL parameters and a Mathias-Copeman alpha whose
   coefficients [0, 0, m, 1] make it Soave's (thermo stores them as [c3, c2, c1, 1]): its a_alpha and derivatives,
   its liquid Z and its residual enthalpy. thermo's PSRK does not compute fugacities (its documentation says so).

For every fit of validation/data/eos/mhv1_fits.json, four data points (lowest to highest pressure, in the window):
the bubble pressure at the measured T and x, and at that state ln phi of the liquid and its residual enthalpy; for
SRK also thermo's values. Written to validation/data/eos/mhv1_check.json; test/eos-mhv1.test.js compares the engine.

Usage: python validation/python/reference_mhv1.py [--write]
"""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eos_check_literature import bubble_p, points  # noqa: E402
from eos_fit_kij import DATA  # noqa: E402
from reference_eos import Cubic, R  # noqa: E402

U = 1.1


class MHV1Cubic(Cubic):
    """reference_eos.Cubic with the MHV1 (PSRK form) mixing rule and thermo's NRTL for g^E."""

    def __init__(self, model, ids, nrtl):
        super().__init__(model, ids)
        self.A = -math.log((U + self.d1) / (U + self.d2)) / (self.d1 - self.d2)
        self.tau_a = [[0.0, nrtl["a_ij"]], [nrtl["a_ji"], 0.0]]
        self.tau_b = [[0.0, nrtl["b_ij"]], [nrtl["b_ji"], 0.0]]
        self.alpha_c = [[0.0, nrtl["alpha"]], [nrtl["alpha"], 0.0]]

    def gE_RT(self, T, x):
        from thermo.nrtl import NRTL
        return NRTL(T=T, xs=list(x), tau_as=self.tau_a, tau_bs=self.tau_b, alpha_cs=self.alpha_c).GE() / (R * T)

    def ab(self, T, n):
        n = np.asarray(n, dtype=float)
        x = n / n.sum()
        ai = self.Oa * R ** 2 * self.Tc ** 2 / self.Pc * (1 + self.m * (1 - np.sqrt(T / self.Tc))) ** 2
        b = x @ self.b_i
        L = sum(x[i] * math.log(b / self.b_i[i]) for i in range(len(x)) if x[i] > 0)
        alpha = sum(x[i] * ai[i] / (self.b_i[i] * R * T) for i in range(len(x))) + (self.gE_RT(T, x) + L) / self.A
        return b * R * T * alpha, b


def psat_water(e, T):
    """Saturation pressure (kPa) of pure water (component 2) in this cubic: equal liquid and vapour fugacities,
    brentq on P between the pressures where both roots exist."""
    from scipy.optimize import brentq
    x = [0.0, 1.0]

    def f(P_kPa):
        P = P_kPa * 1000
        zl, n = e.Z(T, P, x, "liquid")
        zv, _ = e.Z(T, P, x, "vapour")
        if n < 2 or abs(zl - zv) < 1e-9:
            return None
        return e.lnphi(T, P, x, "liquid")[1] - e.lnphi(T, P, x, "vapour")[1]

    Ps = np.geomspace(0.01, 2000, 200)
    vals = [f(P) for P in Ps]
    for a, b, fa, fb in zip(Ps, Ps[1:], vals, vals[1:]):
        if fa is not None and fb is not None and fa * fb < 0:
            return brentq(f, a, b, xtol=1e-10)
    raise ValueError(f"no saturation pressure of water at {T} K")


def thermo_psrk(e, T, P_Pa, x):
    from thermo.eos_mix import PSRK
    from thermo.nrtl import NRTL
    ge = NRTL(T=T, xs=list(x), tau_as=e.tau_a, tau_bs=e.tau_b, alpha_cs=e.alpha_c)
    eos = PSRK(Tcs=list(e.Tc), Pcs=list(e.Pc), omegas=list(e.w), zs=list(x), alpha_coeffs=[[0.0, 0.0, float(m), 1.0] for m in e.m],
               ge_model=ge, T=T, P=P_Pa)
    a, da, d2a = eos.a_alpha_and_derivatives(T)
    return {"a_alpha": a, "da_alpha_dT": da, "d2a_alpha_dT2": d2a, "Z_l": getattr(eos, "Z_l", None), "H_dep_l": getattr(eos, "H_dep_l", None)}


def main():
    fits = json.load(open(os.path.join(DATA, "mhv1_fits.json")))
    window = fits["window"]
    out = []
    for r in fits["results"]:
        model, (i, j) = r["model"], r["pair"]
        e = MHV1Cubic(model, [i, j], r["NRTL"])
        if r.get("variant") == "henry":
            # the Henry's law constant of the rule: water's saturation pressure (bubble pressure of nearly pure water)
            # and ln phi of the gas at infinite dilution there
            for T in (278.15, 338.15, 398.15):
                P_sat = round(psat_water(e, T), 6)
                # ln phi_gas at infinite dilution: d(n a_res)/dn_gas by a forward difference with a step of 1e-8 mol
                # (Cubic.lnphi's 1e-5 is coarse beside x = 1e-9), minus ln Z
                x0 = np.array([1e-9, 1 - 1e-9])
                Z, _ = e.Z(T, P_sat * 1000, x0, "liquid")
                V = Z * R * T / (P_sat * 1000)
                ln0 = (e.a_res(T, V, x0 + np.array([1e-8, 0.0])) - e.a_res(T, V, x0)) / 1e-8 - math.log(Z)
                row = {"model": model, "pair": [i, j], "variant": "henry", "NRTL": r["NRTL"], "T_K": T, "P_sat_reference_kPa": P_sat,
                       "H_reference_kPa": round(math.exp(ln0) * P_sat, 3)}
                print(f"{model} + gE (MHV1) {i}-{j}: T = {T} K, water P_sat = {P_sat:.4f} kPa, H = {row['H_reference_kPa']:.1f} kPa")
                out.append(row)
            continue
        pts = sorted((p for f in r["files"] for p in points(f) if p[0] <= window["T_K"] and (p[3] or p[2] / 2) <= window["P_kPa"]), key=lambda p: p[2])
        for q in (0, len(pts) // 3, 2 * len(pts) // 3, len(pts) - 1):
            for k in list(range(q, len(pts))) + list(range(q - 1, -1, -1)):
                T, x1, P, _ = pts[k]
                try:
                    P_ref = bubble_p(e, T, x1, P)
                    break
                except ValueError:
                    continue
            x = [x1, 1 - x1]
            P_ref = round(P_ref, 3)   # every value below at the stored pressure
            row = {"model": model, "pair": [i, j], "NRTL": r["NRTL"], "T_K": T, "x_1": x1, "P_reference_kPa": round(P_ref, 3),
                   "lnphi_liquid": [round(v, 7) for v in e.lnphi(T, P_ref * 1000, x, "liquid")],
                   "hR_liquid_J_mol": round(e.h_res(T, P_ref * 1000, x, "liquid"), 3)}
            if model == "SRK":
                row["thermo_psrk"] = thermo_psrk(e, T, P_ref * 1000, x)
            print(f"{model} + gE (MHV1) {i}-{j}: T = {T} K, x1 = {x1}: P = {P_ref:.2f} kPa, ln phi_L = {row['lnphi_liquid']}, h_R = {row['hR_liquid_J_mol']:.1f} J/mol"
                  + (f"; thermo PSRK h_dep = {row['thermo_psrk']['H_dep_l']:.1f}" if model == "SRK" and row["thermo_psrk"]["H_dep_l"] is not None else ""))
            out.append(row)
    if "--write" in sys.argv:
        with open(os.path.join(DATA, "mhv1_check.json"), "w") as f:
            json.dump({"_about": "Reference values of SRK/PR + gE (MHV1) from validation/python/reference_mhv1.py (CHEPTA's Python cubic with the MHV1 rule and thermo's NRTL; for SRK also thermo's PSRK class); test/eos-mhv1.test.js compares the engine.",
                       "points": out}, f, indent=1)
            f.write("\n")
        print("wrote validation/data/eos/mhv1_check.json")


if __name__ == "__main__":
    main()
