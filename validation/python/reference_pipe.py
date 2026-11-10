"""
Independent reference for the Pipe block (src/units/pipe.js, proposal 0020): single-phase flow in a straight pipe,
written anew here in plain Python with CoolProp 8 (MIT) for the fluid's states, so that a slip in either is seen.

The model (the same open equations as the engine, see proposal 0020):
- momentum, G. Bar-Meir, Fundamentals of Compressible Fluid Mechanics v0.5.0 (2021), eq. (9.9), p. 239, with the
  Darcy factor and the static head: -dP = f dx/D G^2/(2 rho) + rho g dz + G^2 d(1/rho), plus the fittings
  (K + f Leq/D) G^2/(2 rho) spread evenly along the pipe (DOE-HDBK-1012/3-92, eqs. 3-14 to 3-17, pp. 32-34);
- friction: 64/Re below Re 2000, Colebrook above 3500 (solved here by brentq on f, not by the engine's Newton
  iteration), Churchill (1977) between (DOE-HDBK-1012/3-92 p. 19 for the limits); each checked against the open
  `fluids` library (MIT; fluids.friction.Colebrook and Churchill_1977) when it is installed;
- energy: adiabatic (h constant), isothermal, or a heat loss U pi D dx dT_lm per segment.

Differences from the engine, on purpose: 2000 segments instead of 20 (the engine's discretization error is then what
the comparison shows), the segment's outlet pressure by brentq instead of the secant, CoolProp's states instead of
CHEPTA's: water from the IAPWS-95 formulation (HEOS::Water), methane from CoolProp's Peng-Robinson backend
(PR::Methane, the same equation of state as the engine's; its ideal-gas part is CoolProp's own). The viscosity is
given in each case (the engine's viscosity_Pa_s), so the records of the viscosity are not part of the comparison.

Gas-liquid flow (the two-phase step of proposal 0020), written to validation/fixtures/pipe-two-phase.json:
- the frictional gradient of Lockhart and Martinelli (1949) in Chisholm's (1967) form, as A. Filip, F. Baltaretu,
  R.-M. Damian, Math. Model. Civ. Eng. 10(4) (2014) 19-27, doi:10.2478/mmce-2014-0019, eqs. (10)-(17), pp. 21-22
  (open access) write it: (dp/dz) = phi_L^2 (dp/dz)_L, phi_L^2 = 1 + C/X + 1/X^2, X^2 = (dp/dz)_L/(dp/dz)_G,
  C = 5, 10, 12, 20 for vv, tv, vt, tt with "v" below Re 1500 (the same C in ANL/CP-74646, 1992, Table 1, p. 20);
  each phase alone with this script's own friction factor above; computed here as phi_L^2 (dp/dz)_L, the engine as
  (dp/dz)_L + C sqrt((dp/dz)_L (dp/dz)_G) + (dp/dz)_G;
- elevation and acceleration with the homogeneous (no-slip) density, Filip et al. eqs. (5)-(6);
- checked against the open fluids library's Lockhart_Martinelli (MIT; Chisholm's form with its own smooth-tube friction
  factor), with Re_c = 1500 and that friction factor, when it is installed;
- "two-component" cases with fluids of their own (a liquid of constant density and viscosity and an ideal gas of
  constant viscosity at one temperature, no mass transfer: Lockhart and Martinelli's own kind of flow), which the
  engine's test runs through pipeProfile with the same fluid;
- steam and water through the whole block: CoolProp's IAPWS-95 (HEOS::Water) for the quality at P and h, the
  saturated phases' densities and viscosities; the engine has CHEPTA's own records (an ideal-gas vapour, the liquid
  density and viscosity records), so the comparison carries their differences, stated in the fixture.

Writes validation/fixtures/pipe.json and validation/fixtures/pipe-two-phase.json.

Usage: python validation/python/reference_pipe.py
"""
import json
import math
from pathlib import Path

import CoolProp
import CoolProp.CoolProp as CP
from scipy.optimize import brentq

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "pipe.json"
OUT_TP = Path(__file__).resolve().parents[1] / "fixtures" / "pipe-two-phase.json"
R_GAS = 8.314462618
RE_CHISHOLM = 1500
CHISHOLM = {"vv": 5.0, "tv": 10.0, "vt": 12.0, "tt": 20.0}   # liquid then gas: Filip et al. (2014) eq. (17)
G0 = 9.80665
N_REF = 2000
LD_TABLE = {"elbow-90": 30, "gate-valve": 10, "tee-branch": 60}   # DOE-HDBK-1012/3-92, Table 1, p. 34

CASES = [
    {"name": "water, rough pipe, uphill, fittings", "component": "water", "fluid": "HEOS::Water",
     "T_K": 293.15, "P_kPa": 800.0, "mass_kg_s": 8.0, "length_m": 150.0, "diameter_m": 0.06, "roughness_m": 4.5e-5,
     "elevation_m": 12.0, "fittings": [{"fitting": "elbow-90", "count": 3}, {"K": 0.5}], "heat": "adiabatic",
     "viscosity_Pa_s": 1.0e-3},
    {"name": "viscous liquid, laminar", "component": "water", "fluid": "HEOS::Water",
     "T_K": 293.15, "P_kPa": 500.0, "mass_kg_s": 0.3, "length_m": 50.0, "diameter_m": 0.04, "roughness_m": 4.5e-5,
     "elevation_m": -5.0, "fittings": [], "heat": "adiabatic", "viscosity_Pa_s": 0.05},
    {"name": "water, transition", "component": "water", "fluid": "HEOS::Water",
     "T_K": 293.15, "P_kPa": 300.0, "mass_kg_s": 0.05, "length_m": 30.0, "diameter_m": 0.02, "roughness_m": 4.5e-5,
     "elevation_m": 0.0, "fittings": [], "heat": "adiabatic", "viscosity_Pa_s": 1.1e-3},
    {"name": "methane, isothermal, Peng-Robinson", "component": "methane", "fluid": "PR::Methane",
     "T_K": 300.0, "P_kPa": 3000.0, "mass_kg_s": 1.0, "length_m": 2000.0, "diameter_m": 0.1, "roughness_m": 4.5e-5,
     "elevation_m": 30.0, "fittings": [{"fitting": "gate-valve", "count": 2}, {"fitting": "tee-branch"}],
     "heat": "isothermal", "viscosity_Pa_s": 1.12e-5},
    {"name": "methane, adiabatic, Peng-Robinson", "component": "methane", "fluid": "PR::Methane",
     "T_K": 300.0, "P_kPa": 3000.0, "mass_kg_s": 1.2, "length_m": 3000.0, "diameter_m": 0.1, "roughness_m": 4.5e-5,
     "elevation_m": 0.0, "fittings": [], "heat": "adiabatic", "viscosity_Pa_s": 1.12e-5},
    {"name": "methane, heat lost to cold surroundings", "component": "methane", "fluid": "PR::Methane",
     "T_K": 330.0, "P_kPa": 3000.0, "mass_kg_s": 1.0, "length_m": 2000.0, "diameter_m": 0.1, "roughness_m": 4.5e-5,
     "elevation_m": 0.0, "fittings": [], "heat": "U", "U_W_m2K": 10.0, "T_ambient_K": 280.0, "viscosity_Pa_s": 1.2e-5},
]


def colebrook(Re, rr):
    g = lambda f: 1 / math.sqrt(f) + 2.0 * math.log10(rr / 3.7 + 2.51 / (Re * math.sqrt(f)))
    return brentq(g, 1e-4, 1.0, xtol=1e-15, rtol=1e-15)


def churchill(Re, rr):
    A = (2.457 * math.log(1 / ((7 / Re) ** 0.9 + 0.27 * rr))) ** 16
    B = (37530 / Re) ** 16
    return 8 * ((8 / Re) ** 12 + 1 / (A + B) ** 1.5) ** (1 / 12)


def friction(Re, rr):
    if Re < 2000:
        return 64 / Re
    if Re > 3500:
        return colebrook(Re, rr)
    return churchill(Re, rr)


def check_with_fluids():
    """The friction factors against the open fluids library (MIT), when installed."""
    try:
        import fluids
        import fluids.friction as ff
    except ImportError:
        return "fluids not installed: not checked"
    worst = 0.0
    for Re in (4e3, 1e4, 1e5, 1e6, 1e7, 8.4e7):
        for rr in (0.0, 1e-5, 8e-5, 1e-3, 1e-2):
            worst = max(worst, abs(colebrook(Re, rr) / ff.Colebrook(Re, rr) - 1))
    for Re in (2000, 2500, 3000, 3500):
        for rr in (0.0, 1e-3):
            worst = max(worst, abs(churchill(Re, rr) / ff.Churchill_1977(Re, rr) - 1))
    assert worst < 1e-9, worst
    return f"Colebrook and Churchill (1977) agree with fluids {fluids.__version__} to {worst:.1e}"


def props(fluid, T, P_kPa):
    return CP.PropsSI("D", "T", T, "P", P_kPa * 1e3, fluid), CP.PropsSI("H", "T", T, "P", P_kPa * 1e3, fluid)


def T_at(fluid, P_kPa, h, T_guess):
    return brentq(lambda T: CP.PropsSI("H", "T", T, "P", P_kPa * 1e3, fluid) - h, max(T_guess - 60, 274.0 if "Water" in fluid else 1.0), T_guess + 60, xtol=1e-10)


def run(c):
    fluid, D, L, N = c["fluid"], c["diameter_m"], c["length_m"], N_REF
    A = math.pi * D * D / 4
    m = c["mass_kg_s"]
    G = m / A
    K = sum(f.get("K", 0) * f.get("count", 1) for f in c["fittings"])
    LD = sum(LD_TABLE[f["fitting"]] * f.get("count", 1) for f in c["fittings"] if "fitting" in f)
    dx, dz = L / N, c["elevation_m"] / N
    mu = c["viscosity_Pa_s"]
    T, P = c["T_K"], c["P_kPa"]
    rho, h = props(fluid, T, P)
    Re0 = G * D / mu
    split = {"friction": 0.0, "fittings": 0.0, "elevation": 0.0, "acceleration": 0.0}
    Q_lost = 0.0   # W
    for _ in range(N):
        def outlet(P2):
            if c["heat"] == "isothermal":
                T2 = c["T_K"]
                return T2, props(fluid, T2, P2), 0.0
            if c["heat"] == "adiabatic":
                T2 = T_at(fluid, P2, h, T)
                return T2, props(fluid, T2, P2), 0.0
            UA, Ta = c["U_W_m2K"] * math.pi * D * dx, c["T_ambient_K"]

            def g(T2):
                d1, d2 = T - Ta, T2 - Ta
                lm = (d1 + d2) / 2 if abs(d1 - d2) < 1e-12 or d1 * d2 <= 0 else (d1 - d2) / math.log(d1 / d2)
                return CP.PropsSI("H", "T", T2, "P", P2 * 1e3, fluid) - (h - UA * lm / m), UA * lm
            T2 = brentq(lambda t: g(t)[0], min(T, Ta) - 30, max(T, Ta) + 30, xtol=1e-11)
            return T2, props(fluid, T2, P2), g(T2)[1]

        def parts(P2):
            T2, (rho2, h2), q = outlet(P2)
            rm = (rho + rho2) / 2
            f = friction(G * D / mu, c["roughness_m"] / D)
            v2 = G * G / (2 * rm)
            p = {"friction": f * dx / D * v2, "fittings": (K + f * LD) / N * v2, "elevation": rm * G0 * dz,
                 "acceleration": G * G * (1 / rho2 - 1 / rho)}
            return p, (T2, rho2, h2, q)

        P2 = brentq(lambda p2: P - sum(parts(p2)[0].values()) / 1e3 - p2, 0.3 * P, 1.2 * P, xtol=1e-12)
        p, (T, rho_new, h_new, q) = parts(P2)
        for k in split:
            split[k] += p[k] / 1e3
        P, rho, h = P2, rho_new, h_new
        Q_lost += q
    return {"P_out_kPa": P, "T_out_K": T, "dP_kPa": c["P_kPa"] - P,
            "dP_friction_kPa": split["friction"], "dP_fittings_kPa": split["fittings"],
            "dP_elevation_kPa": split["elevation"], "dP_acceleration_kPa": split["acceleration"],
            "Re_in": Re0, "velocity_out_m_s": G / rho, "heat_lost_kW": Q_lost / 1e3,
            "friction_factor_in": friction(Re0, c["roughness_m"] / D)}


def lockhart_martinelli(G, D, rr, x, rhoL, rhoG, muL, muG, fric=None):
    """The frictional gradient (Pa/m) of gas-liquid flow: Lockhart-Martinelli in Chisholm's form (see the top)."""
    fric = fric or (lambda Re: friction(Re, rr))
    GL, GG = G * (1 - x), G * x
    ReL, ReG = GL * D / muL, GG * D / muG
    dpL = fric(ReL) * GL ** 2 / (2 * rhoL * D)
    dpG = fric(ReG) * GG ** 2 / (2 * rhoG * D)
    key = ("t" if ReL > RE_CHISHOLM else "v") + ("t" if ReG > RE_CHISHOLM else "v")
    X = math.sqrt(dpL / dpG)
    phi2 = 1 + CHISHOLM[key] / X + 1 / X ** 2
    return phi2 * dpL, {"X": X, "C": CHISHOLM[key], "regimes": key, "phi_L2": phi2, "Re_L": ReL, "Re_G": ReG}


def check_lm_with_fluids():
    """Chisholm's form against fluids.two_phase.Lockhart_Martinelli, with its friction factor and Re_c = 1500."""
    try:
        import fluids
        from fluids.two_phase import Lockhart_Martinelli
    except ImportError:
        return "fluids not installed: Lockhart-Martinelli not checked"
    fl = lambda Re: 64 / Re if Re < RE_CHISHOLM else 0.184 * Re ** -0.2   # fluids' own, "as in the original model"
    worst, seen = 0.0, set()
    for m in (0.05, 0.3, 3.0, 30.0):
        for x in (1e-4, 0.01, 0.1, 0.5, 0.9):
            for muL in (1e-3, 0.2):
                D, rhoL, rhoG, muG = 0.05, 998.0, 4.7, 1.8e-5
                G = m / (math.pi * D * D / 4)
                g, info = lockhart_martinelli(G, D, 0.0, x, rhoL, rhoG, muL, muG, fric=fl)
                ref = Lockhart_Martinelli(m, x, rhoL, rhoG, muL, muG, D, L=1.0, Re_c=RE_CHISHOLM)
                worst = max(worst, abs(g / ref - 1))
                seen.add(info["regimes"])
    assert worst < 1e-9 and seen == set(CHISHOLM), (worst, seen)
    return f"Lockhart-Martinelli (Chisholm's C, all four regimes) agrees with fluids {fluids.__version__} to {worst:.1e}"


def homogeneous(x, rhoL, rhoG):
    vG, vL = x / rhoG, (1 - x) / rhoL
    return 1 / (vG + vL), vL / (vG + vL)


TWO_COMPONENT = [
    {"name": "air and water, horizontal, both turbulent", "T_K": 293.15, "P_kPa": 400.0, "mass_kg_s": 2.0, "x": 0.01,
     "rhoL": 998.2, "muL": 1.002e-3, "M_gas": 28.9647, "muG": 1.81e-5, "length_m": 50.0, "diameter_m": 0.05,
     "roughness_m": 4.5e-5, "elevation_m": 0.0},
    {"name": "air and water, uphill", "T_K": 293.15, "P_kPa": 400.0, "mass_kg_s": 2.0, "x": 0.01,
     "rhoL": 998.2, "muL": 1.002e-3, "M_gas": 28.9647, "muG": 1.81e-5, "length_m": 50.0, "diameter_m": 0.05,
     "roughness_m": 4.5e-5, "elevation_m": 20.0},
    {"name": "air and a viscous oil (vt)", "T_K": 293.15, "P_kPa": 300.0, "mass_kg_s": 1.0, "x": 0.02,
     "rhoL": 870.0, "muL": 0.2, "M_gas": 28.9647, "muG": 1.81e-5, "length_m": 50.0, "diameter_m": 0.05,
     "roughness_m": 4.5e-5, "elevation_m": 0.0},
    {"name": "water with little air (tv)", "T_K": 293.15, "P_kPa": 300.0, "mass_kg_s": 3.0, "x": 2e-4,
     "rhoL": 998.2, "muL": 1.002e-3, "M_gas": 28.9647, "muG": 1.81e-5, "length_m": 50.0, "diameter_m": 0.05,
     "roughness_m": 4.5e-5, "elevation_m": -5.0},
    {"name": "oil with little air (vv)", "T_K": 293.15, "P_kPa": 300.0, "mass_kg_s": 0.5, "x": 1e-3,
     "rhoL": 870.0, "muL": 0.2, "M_gas": 28.9647, "muG": 1.81e-5, "length_m": 50.0, "diameter_m": 0.05,
     "roughness_m": 4.5e-5, "elevation_m": 0.0},
]


def segment_profile(G, D, L, dz, P0, node, N=N_REF):
    """The pressure along the pipe: node(P) -> (rho_H, frictional gradient Pa/m); brentq on each segment's outlet."""
    dx = L / N
    split = {"friction": 0.0, "elevation": 0.0, "acceleration": 0.0}
    P = P0
    rho_a, g_a = node(P)
    for _ in range(N):
        def parts(P2):
            rho_b, g_b = node(P2)
            return {"friction": dx * (g_a + g_b) / 2, "elevation": (rho_a + rho_b) / 2 * G0 * dz / N,
                    "acceleration": G * G * (1 / rho_b - 1 / rho_a)}, rho_b, g_b
        P2 = brentq(lambda p2: P - sum(parts(p2)[0].values()) / 1e3 - p2, 0.3 * P, 1.2 * P, xtol=1e-12)
        pp, rho_a, g_a = parts(P2)
        for k in split:
            split[k] += pp[k] / 1e3
        P = P2
    return P, split


def run_two_component(c):
    D = c["diameter_m"]
    G = c["mass_kg_s"] / (math.pi * D * D / 4)
    rr = c["roughness_m"] / D

    def node(P):
        rhoG = c["M_gas"] / 1e3 * P * 1e3 / (R_GAS * c["T_K"])
        rhoH, _ = homogeneous(c["x"], c["rhoL"], rhoG)
        return rhoH, lockhart_martinelli(G, D, rr, c["x"], c["rhoL"], rhoG, c["muL"], c["muG"])[0]
    P, split = segment_profile(G, D, c["length_m"], c["elevation_m"], c["P_kPa"], node)
    rhoG0 = c["M_gas"] / 1e3 * c["P_kPa"] * 1e3 / (R_GAS * c["T_K"])
    info = lockhart_martinelli(G, D, rr, c["x"], c["rhoL"], rhoG0, c["muL"], c["muG"])[1]
    return {"P_out_kPa": P, "dP_kPa": c["P_kPa"] - P, "dP_friction_kPa": split["friction"],
            "dP_elevation_kPa": split["elevation"], "dP_acceleration_kPa": split["acceleration"],
            "inlet": {**info, "holdup_L": homogeneous(c["x"], c["rhoL"], rhoG0)[1]}}


STEAM = [
    {"name": "wet steam, 5 % vapour, 500 kPa", "inlet": {"P_kPa": 500.0, "VF": 0.05}, "mass_kg_s": 1.0,
     "length_m": 50.0, "diameter_m": 0.08, "roughness_m": 4.5e-5, "elevation_m": 0.0},
    {"name": "wet steam, 5 % vapour, 500 kPa, uphill", "inlet": {"P_kPa": 500.0, "VF": 0.05}, "mass_kg_s": 1.0,
     "length_m": 50.0, "diameter_m": 0.08, "roughness_m": 4.5e-5, "elevation_m": 10.0},
    {"name": "hot water at 400 K flashing in the pipe", "inlet": {"P_kPa": 250.0, "T_K": 400.0}, "mass_kg_s": 1.0,
     "length_m": 150.0, "diameter_m": 0.05, "roughness_m": 4.5e-5, "elevation_m": 0.0},
]


def run_steam(c, fluid="HEOS::Water"):
    D = c["diameter_m"]
    G = c["mass_kg_s"] / (math.pi * D * D / 4)
    rr = c["roughness_m"] / D
    i = c["inlet"]
    P0 = i["P_kPa"]
    h = (CP.PropsSI("H", "P", P0 * 1e3, "Q", i["VF"], fluid) if "VF" in i
         else CP.PropsSI("H", "P", P0 * 1e3, "T", i["T_K"], fluid))   # adiabatic: h constant (no kinetic energy)

    def node(P, detail=False):
        Pa = P * 1e3
        x = CP.PropsSI("Q", "P", Pa, "H", h, fluid)
        if 0 < x < 1:
            rhoL, rhoG = CP.PropsSI("D", "P", Pa, "Q", 0, fluid), CP.PropsSI("D", "P", Pa, "Q", 1, fluid)
            muL, muG = CP.PropsSI("V", "P", Pa, "Q", 0, fluid), CP.PropsSI("V", "P", Pa, "Q", 1, fluid)
            rhoH, hold = homogeneous(x, rhoL, rhoG)
            g, info = lockhart_martinelli(G, D, rr, x, rhoL, rhoG, muL, muG)
            if detail:
                return {"P_kPa": P, "x": x, "rhoL": rhoL, "rhoG": rhoG, "muL": muL, "muG": muG, **info}
            return rhoH, g
        if detail:
            return None
        rho, mu = CP.PropsSI("D", "P", Pa, "H", h, fluid), CP.PropsSI("V", "P", Pa, "H", h, fluid)
        return rho, friction(G * D / mu, rr) * G * G / (2 * rho * D)
    P, split = segment_profile(G, D, c["length_m"], c["elevation_m"], P0, node)
    x_out = CP.PropsSI("Q", "P", P * 1e3, "H", h, fluid)
    return {"P_out_kPa": P, "dP_kPa": P0 - P, "dP_friction_kPa": split["friction"],
            "dP_elevation_kPa": split["elevation"], "dP_acceleration_kPa": split["acceleration"],
            "quality_out": x_out, "inlet_node": node(P0, True), "outlet_node": node(P, True)}


def main():
    out = {"_about": f"Pipe block reference: {N_REF} segments, CoolProp {CoolProp.__version__} states (HEOS::Water, "
                     "PR::Methane), viscosity given. " + check_with_fluids() + ". Written by "
                     "validation/python/reference_pipe.py.", "cases": []}
    for c in CASES:
        r = run(c)
        out["cases"].append({**{k: v for k, v in c.items() if k != "fluid"}, "coolprop": c["fluid"],
                             "result": {k: round(v, 9) for k, v in r.items()}})
        print(c["name"], {k: round(v, 5) for k, v in r.items()})
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    tp = {"_about": f"Pipe block, gas-liquid flow (Lockhart-Martinelli, Chisholm's C): {N_REF} segments, brentq on each "
                    f"segment's outlet pressure; steam and water from CoolProp {CoolProp.__version__} (HEOS::Water, "
                    "IAPWS-95). " + check_lm_with_fluids() + ". Written by validation/python/reference_pipe.py.",
          "two_component": [], "steam": []}
    for c in TWO_COMPONENT:
        r = run_two_component(c)
        tp["two_component"].append({**c, "result": r})
        print(c["name"], {k: (round(v, 5) if isinstance(v, float) else v) for k, v in r.items() if k != "inlet"}, r["inlet"]["regimes"])
    for c in STEAM:
        r = run_steam(c)
        tp["steam"].append({**c, "coolprop": "HEOS::Water", "result": r})
        print(c["name"], {k: (round(v, 5) if isinstance(v, float) else v) for k, v in r.items() if not k.endswith("_node")})
    OUT_TP.write_text(json.dumps(tp, indent=1) + "\n")


if __name__ == "__main__":
    main()
