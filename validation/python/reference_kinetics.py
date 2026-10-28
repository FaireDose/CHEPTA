"""
Independent references for the reactors of proposal 0010, step 5 and the reactive flash (the maintainer, 2026-10-28):

  1. Reactive flash (src/equilibrium/reaction-equilibrium.js, phases: 2): ethyl acetate esterification in the liquid
     (NRTL of reference_model.py, the vapour an ideal gas with acetic acid's dimers, as reference_model.System.equilibrium),
     at T and P where the mixture boils. For each extent the mixture is flashed (scipy fsolve on the liquid
     composition and the vapour fraction: the material balance and the bubble pressure of the liquid equal to P);
     the extent is found by brentq on Σ ν ln(γ x) = ln K, ln K from reference_reactions.py (pure-liquid standard
     state).
  2. Plug-flow and stirred-tank reactors (src/units/kinetic-reactors.js): ethanol dehydration to ethylene and to
     diethyl ether, power-law rates with Arrhenius constants, an ideal gas (C_j = F_j P / (F R T)); the PFR by
     scipy's solve_ivp (Radau, rtol 1e-10) in the extents, the CSTR by fsolve on ξ = 3.6 V r.
  3. The stiff integrator (src/util/ode.js): Robertson's problem, by solve_ivp (Radau, rtol 1e-10).

Writes validation/fixtures/kinetics.json, which test/kinetic-reactors.test.js compares with the engine.
Usage: python validation/python/reference_kinetics.py
"""
import json
from pathlib import Path

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq, fsolve

from reference_model import System
from reference_reactions import scipy_results, species_liquid

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "kinetics.json"
R = 8.314462618

# the cases; defined here and in test/kinetic-reactors.test.js (CHEPTA ships no reactions)
ESTER = {"acetic-acid": -1, "ethanol": -1, "ethyl-acetate": 1, "water": 1}
FLASH_CASES = [
    {"T_K": 350.0, "P_kPa": 101.325, "feed": {"acetic-acid": 1.0, "ethanol": 1.0, "ethyl-acetate": 0.0, "water": 0.0}},
    {"T_K": 355.0, "P_kPa": 101.325, "feed": {"acetic-acid": 1.0, "ethanol": 1.0, "ethyl-acetate": 0.0, "water": 0.0}},
    {"T_K": 352.0, "P_kPa": 101.325, "feed": {"acetic-acid": 1.0, "ethanol": 1.5, "ethyl-acetate": 0.0, "water": 0.3}},
]
GAS_IDS = ["ethanol", "ethylene", "water", "diethyl-ether"]
GAS_REACTIONS = [
    # A = k0 (mol/(m3 s) per (mol/m3)^order), Ea in J/mol; reverse constant given
    {"id": "R1", "stoichiometry": {"ethanol": -1, "ethylene": 1, "water": 1},
     "forward": {"k0": 2.0e6, "Ea_J_mol": 80000.0, "orders": {"ethanol": 1}},
     "reverse": {"k0": 5.0e3, "Ea_J_mol": 40000.0, "orders": {"ethylene": 1, "water": 1}}},
    {"id": "R2", "stoichiometry": {"ethanol": -2, "diethyl-ether": 1, "water": 1},
     "forward": {"k0": 4.0e3, "Ea_J_mol": 60000.0, "orders": {"ethanol": 2}},
     "reverse": {"k0": 1.0e1, "Ea_J_mol": 30000.0, "orders": {"diethyl-ether": 1, "water": 1}}},
]
GAS_CASE = {"T_K": 600.0, "P_kPa": 200.0, "feed_kmol_h": {"ethanol": 10.0, "ethylene": 0.0, "water": 1.0, "diethyl-ether": 0.0},
            "pfr": {"L_m": 3.0, "D_m": 0.05, "tubes": 20}, "cstr": {"V_m3": 0.2}}


class AllVapour(Exception):
    pass


def flash_liquid(sysm, z, T, P):
    """Liquid composition and vapour fraction of z at T, P: (z, 0) for a liquid below its bubble point; else the
    vapour fraction β where the liquid x(β) has its bubble pressure at P (brentq), x(β) from the material balance
    z = (1 - β) x + β y(x) by fsolve, y(x) the bubble vapour of x (reference_model.System.equilibrium)."""
    Pb, _ = sysm.equilibrium(z, T)
    if Pb <= P:
        return z, 0.0

    n = len(z)

    def liquid(beta, x0=None):
        def res(u):
            x = np.append(u, 1 - u.sum())
            _, y = sysm.equilibrium(x, T)
            return ((1 - beta) * x + beta * y - z)[:n - 1]
        u, _, ier, msg = fsolve(res, (z if x0 is None else x0)[:n - 1], xtol=1e-14, full_output=True)
        if np.max(np.abs(res(u))) > 1e-12:
            raise RuntimeError(f"no liquid composition at vapour fraction {beta}: {msg}")
        return np.append(u, 1 - u.sum())

    # the first vapour fraction, in steps of 0.02, where the liquid's bubble pressure falls below P
    lo, x = 0.0, z
    xlo = z
    while True:
        hi = lo + 0.02
        if hi >= 1:
            raise AllVapour()
        try:
            x = liquid(hi, x)
        except RuntimeError:
            raise AllVapour()   # beyond the dew point
        if sysm.equilibrium(x, T)[0] < P:
            break
        lo, xlo = hi, x
    beta = brentq(lambda b: sysm.equilibrium(liquid(b, xlo), T)[0] - P, lo, hi, xtol=1e-14)
    return liquid(beta, xlo), beta


def reactive_flash():
    ids = list(ESTER)
    nu = np.array([ESTER[c] for c in ids], float)
    sysm = System(ids, "NRTL")
    out = []
    for case in FLASH_CASES:
        T, P = case["T_K"], case["P_kPa"]
        lnk = scipy_results({"e": ESTER}, [T], species_liquid)["e"][0]["lnK"]
        n0 = np.array([case["feed"][c] for c in ids], float)

        def g(xi):
            n = n0 + nu * xi
            try:
                x, _ = flash_liquid(sysm, n / n.sum(), T, P)
            except AllVapour:
                return 1.0   # all vapour: outside the two-phase cases of this check (the root is checked below)
            return float(nu @ np.log(x * sysm.gamma(x, T))) - lnk
        hi = min(n0[i] / -nu[i] for i in range(len(ids)) if nu[i] < 0)
        lo = 1e-9 if not any(n0[i] > 0 for i in range(len(ids)) if nu[i] > 0) else -min(n0[i] for i in range(len(ids)) if nu[i] > 0) + 1e-9
        xi = brentq(g, lo, hi - 1e-9, xtol=1e-13)
        if abs(g(xi)) > 1e-8:
            raise RuntimeError(f"no two-phase equilibrium at {T} K for {case['feed']} (|g| = {abs(g(xi)):.2e})")
        n = n0 + nu * xi
        _, beta = flash_liquid(sysm, n / n.sum(), T, P)
        out.append({**case, "lnK": lnk, "extent": xi, "VF": beta})
        print(f"reactive flash {T} K feed {case['feed']}: extent {xi:.9f}, vapour fraction {beta:.6f}")
    return out


def gas_rates(F, T, P):
    """Rates (mol/(m3 s)) of the gas reactions at the molar flows F (any unit), T and P (kPa)."""
    c = F / F.sum() * P * 1000 / (R * T)
    conc = dict(zip(GAS_IDS, c))
    r = []
    for rx in GAS_REACTIONS:
        kf = rx["forward"]["k0"] * np.exp(-rx["forward"]["Ea_J_mol"] / (R * T))
        kr = rx["reverse"]["k0"] * np.exp(-rx["reverse"]["Ea_J_mol"] / (R * T))
        fw = kf * np.prod([conc[s] ** o for s, o in rx["forward"]["orders"].items()])
        bw = kr * np.prod([conc[s] ** o for s, o in rx["reverse"]["orders"].items()])
        r.append(fw - bw)
    return np.array(r)


def kinetic():
    nu = np.array([[rx["stoichiometry"].get(c, 0) for c in GAS_IDS] for rx in GAS_REACTIONS], float)
    F0 = np.array([GAS_CASE["feed_kmol_h"][c] for c in GAS_IDS])
    T, P = GAS_CASE["T_K"], GAS_CASE["P_kPa"]
    p = GAS_CASE["pfr"]
    A = p["tubes"] * np.pi * p["D_m"] ** 2 / 4
    sol = solve_ivp(lambda z, x: 3.6 * A * gas_rates(F0 + nu.T @ x, T, P), (0, p["L_m"]), [0.0, 0.0], method="Radau",
                    rtol=1e-10, atol=1e-14, dense_output=True)
    zs = [0.25 * p["L_m"], 0.5 * p["L_m"], p["L_m"]]
    pfr = [{"z_m": z, "flows_kmol_h": dict(zip(GAS_IDS, (F0 + nu.T @ sol.sol(z)).tolist()))} for z in zs]
    V = GAS_CASE["cstr"]["V_m3"]
    x = fsolve(lambda x: x - 3.6 * V * gas_rates(F0 + nu.T @ x, T, P), [0.1, 0.1], xtol=1e-12)
    cstr = dict(zip(GAS_IDS, (F0 + nu.T @ x).tolist()))
    print("pfr outlet", pfr[-1]["flows_kmol_h"])
    print("cstr outlet", cstr)
    return pfr, cstr


def robertson():
    f = lambda t, y: [-0.04 * y[0] + 1e4 * y[1] * y[2], 0.04 * y[0] - 1e4 * y[1] * y[2] - 3e7 * y[1] ** 2, 3e7 * y[1] ** 2]
    s = solve_ivp(f, (0, 40), [1, 0, 0], method="Radau", rtol=1e-10, atol=[1e-12, 1e-16, 1e-12])
    return s.y[:, -1].tolist()


def main():
    pfr, cstr = kinetic()
    doc = {"_note": "Made by validation/python/reference_kinetics.py: the reactive flash by scipy (fsolve flash, brentq "
                    "extent) with the NRTL of reference_model.py; the PFR by solve_ivp (Radau) and the CSTR by fsolve "
                    "with an ideal gas; Robertson's problem by solve_ivp (Radau).",
           "reactive_flash": {"stoichiometry": ESTER, "model": "NRTL", "cases": reactive_flash()},
           "gas": {"ids": GAS_IDS, "reactions": GAS_REACTIONS, **GAS_CASE, "pfr_results": pfr, "cstr_results": cstr},
           "robertson": {"t": 40, "y": robertson()}}
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(OUT.parents[2])}")


if __name__ == "__main__":
    main()
