"""
Independent reference for the thermodynamics of reactions (src/reactions/reaction.js, proposal 0010 step 2).

The engine gets each species' standard Gibbs energy by integrating the Gibbs-Helmholtz equation from its formation
record at 298.15 K. Here the same quantities are computed two other ways, from the same records of
src/data/components.json:

  1. Cantera (https://cantera.org/, 3-clause BSD), for the vapour reactions: every species gets NASA 9-coefficient
     polynomials fitted to its ideal-gas heat capacity on 25 K ranges (200-1000 K; the DIPPR 107 records, and for
     water the ideal-gas part of IAPWS-IF97 region 2 from the open `iapws` package), with h(298.15 K) = ΔfH° and
     s(298.15 K) = (ΔfH° - ΔfG°)/298.15 K, so that g(298.15 K) = ΔfG° (the elements' entropies cancel in a balanced
     reaction). Cantera's delta_standard_gibbs and delta_standard_enthalpy (ideal gas at its reference pressure, set to
     100 kPa) give ΔrG°, ΔrH° and K = exp(-ΔrG°/RT).
  2. scipy, for every reaction, by enthalpy and entropy instead of Gibbs-Helmholtz:
       H(T) = H(T0) + integral of cp,  S(T) = (H(T0) - G(T0))/T0 + integral of cp/T,  G = H - T S,
     with the integrals by scipy.integrate.quad. A liquid species from an ideal-gas record:
       G_L = G_IG + RT ln(phi_sat psat / P°),  H_L(T) = H_IG(T0) + h_R,sat(T0) - ΔHvap(T0) + integral of cp_L,
     with phi_sat = 1 and h_R,sat = 0 (ideal-gas vapour), and for a dimerizing acid the monomer's saturation pressure
     and the dimers' enthalpy (chemical theory); a crystal record:
       H_L(T0) = H_S(T0) + ΔHfus,  G_L(T0) = G_S(T0) + ΔHfus (1 - T0/Tm),
     then the liquid by cp_L.

Writes validation/fixtures/reactions.json, which test/reactions.test.js compares with the engine.
Usage: python validation/python/reference_reactions.py [--webbook CACHE]   (--webbook: refresh the measured liquid
values of validation/data/reactions/liquid_formation_webbook.json from the NIST WebBook)
"""
import json
import math
from pathlib import Path

import numpy as np
from scipy.integrate import quad

from reference_model import COMPONENTS, psat_kpa, dimer_k
from reference_enthalpy import dippr107, h_ig, dhvap, cp_liquid

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "reactions.json"
R = 8.314462618
T0 = 298.15
P0_KPA = 100.0

# the reactions of the check; defined here and in test/reactions.test.js (CHEPTA ships no reactions)
VAPOUR = {
    "methanol-from-co2": {"carbon-dioxide": -1, "hydrogen": -3, "methanol": 1, "water": 1},
    "reverse-water-gas-shift": {"carbon-dioxide": -1, "hydrogen": -1, "carbon-monoxide": 1, "water": 1},
    "ethanol-dehydration": {"ethanol": -1, "ethylene": 1, "water": 1},
    "ammonia-synthesis": {"nitrogen": -1, "hydrogen": -3, "ammonia": 2},
}
LIQUID = {
    "diethyl-ether-from-ethanol": {"ethanol": -2, "diethyl-ether": 1, "water": 1},
    "glucose-isomerization": {"glucose": -1, "fructose": 1},
    "ethyl-acetate-esterification": {"acetic-acid": -1, "ethanol": -1, "ethyl-acetate": 1, "water": 1},
}
T_VAPOUR = [298.15, 350.0, 450.0, 550.0, 700.0]
T_LIQUID = [298.15, 320.0, 345.0]


def cp_ig(cid, T):
    if cid == "water":
        from iapws.iapws97 import _Region2
        return COMPONENTS["water"]["MW"] * _Region2(T, 1e-12)["cp"]
    rec = COMPONENTS[cid]["properties"]["idealGasHeatCapacity"]
    assert rec["equation"] == "DIPPR107"
    return dippr107(T, {n: rec["coefficients"].get(n, 0.0) for n in "ABCDE"})


def formation(cid):
    f = COMPONENTS[cid]["formation"]
    if f["state"] == "ideal gas":
        return f["state"], f["Hf_ig_J_mol"], f["Gf_ig_J_mol"]
    return f["state"], f["Hf_J_mol"], f["Gf_J_mol"]


# ---------------------------------------------------------------------------------------------------------------
# 1. Cantera
# ---------------------------------------------------------------------------------------------------------------

def nasa9_ranges(cid, H0, G0, lo=200.0, hi=1000.0, width=25.0):
    """NASA 9-coefficient polynomials of one species on width-K ranges, continuous in h and s."""
    edges = list(np.arange(lo, hi + 1e-9, width))
    fits = []
    for a, b in zip(edges[:-1], edges[1:]):
        t = np.linspace(a, b, 40)
        y = np.array([cp_ig(cid, x) for x in t]) / R
        X = np.column_stack([t ** -2, t ** -1, t ** 0, t, t ** 2, t ** 3, t ** 4])
        coef, *_ = np.linalg.lstsq(X, y, rcond=None)
        fits.append((a, b, coef))

    def h_RT(c, T, b1):
        a1, a2, a3, a4, a5, a6, a7 = c
        return -a1 / T ** 2 + a2 * math.log(T) / T + a3 + a4 * T / 2 + a5 * T ** 2 / 3 + a6 * T ** 3 / 4 + a7 * T ** 4 / 5 + b1 / T

    def s_R(c, T, b2):
        a1, a2, a3, a4, a5, a6, a7 = c
        return -a1 / (2 * T ** 2) - a2 / T + a3 * math.log(T) + a4 * T + a5 * T ** 2 / 2 + a6 * T ** 3 / 3 + a7 * T ** 4 / 4 + b2

    # anchor the range that holds 298.15 K, then chain h and s outwards
    k0 = next(i for i, (a, b, _) in enumerate(fits) if a <= T0 < b)
    S0 = (H0 - G0) / T0
    consts = [None] * len(fits)
    c = fits[k0][2]
    consts[k0] = (H0 / R - h_RT(c, T0, 0) * T0, S0 / R - s_R(c, T0, 0))
    for i in list(range(k0 + 1, len(fits))) + list(range(k0 - 1, -1, -1)):
        j = i - 1 if i > k0 else i + 1
        Tj = fits[i][0] if i > k0 else fits[i][1]
        cj, (b1j, b2j) = fits[j][2], consts[j]
        h, s = h_RT(cj, Tj, b1j) * Tj, s_R(cj, Tj, b2j)
        ci = fits[i][2]
        consts[i] = (h - h_RT(ci, Tj, 0) * Tj, s - s_R(ci, Tj, 0))
    return {
        "model": "NASA9", "reference-pressure": P0_KPA * 1000,
        "temperature-ranges": [float(e) for e in edges],
        "data": [list(map(float, fits[i][2])) + [float(consts[i][0]), float(consts[i][1])] for i in range(len(fits))],
    }


def cantera_results():
    import cantera as ct
    import yaml
    ids = sorted({cid for st in VAPOUR.values() for cid in st})
    species = []
    for cid in ids:
        state, H0, G0 = formation(cid)
        assert state == "ideal gas", cid
        el = {k: v for k, v in parse_formula(COMPONENTS[cid]["formula"]).items()}
        species.append({"name": cid, "composition": el, "thermo": nasa9_ranges(cid, H0, G0)})
    reactions = []
    for name, st in VAPOUR.items():
        lhs = " + ".join(f"{-n} {c}" for c, n in st.items() if n < 0)
        rhs = " + ".join(f"{n} {c}" for c, n in st.items() if n > 0)
        reactions.append({"equation": f"{lhs} <=> {rhs}", "rate-constant": {"A": 1.0, "b": 0.0, "Ea": 0.0}})
    doc = {
        "units": {"length": "m", "quantity": "mol", "activation-energy": "J/mol"},
        "phases": [{"name": "gas", "thermo": "ideal-gas", "elements": sorted({e for s in species for e in s["composition"]}),
                    "species": ids, "kinetics": "gas", "reactions": "all", "state": {"T": 300.0, "P": 1e5}}],
        "species": species, "reactions": reactions,
    }
    gas = ct.Solution(yaml=yaml.safe_dump(doc))
    out = {}
    for T in T_VAPOUR:
        gas.TP = T, 1e5
        dG = gas.delta_standard_gibbs / 1000   # J/kmol -> J/mol
        dH = gas.delta_standard_enthalpy / 1000
        for k, name in enumerate(VAPOUR):
            out.setdefault(name, []).append({"T_K": T, "dH_J_mol": float(dH[k]), "dG_J_mol": float(dG[k]),
                                             "lnK": float(-dG[k] / (R * T))})
    return out, ct.__version__


def parse_formula(f):
    import re
    out = {}
    for el, n in re.findall(r"([A-Z][a-z]?)(\d*)", f):
        out[el] = out.get(el, 0) + int(n or 1)
    return out


# ---------------------------------------------------------------------------------------------------------------
# 2. scipy: enthalpy and entropy
# ---------------------------------------------------------------------------------------------------------------

def q(f, a, b):
    return quad(f, a, b, epsabs=1e-10, epsrel=1e-13, limit=200)[0]


def psat(cid, T):
    # the vapour-pressure record of components.json, as the engine's activity systems use it (for water too)
    return psat_kpa(COMPONENTS[cid], T)


def sat_vapour(cid, T):
    """ln(f_sat / psat) and the residual enthalpy of the saturated vapour against the formation record's ideal gas:
    for a dimerizing acid the monomer (chemical theory: p_D = K p_M^2, the dimerization enthalpy R T^2 d ln K/dT by a
    central difference), else 0 and 0 (the ideal-gas vapour of the engine's one-component system)."""
    c = COMPONENTS[cid]
    if c.get("association"):
        a = c["association"]
        P = psat(cid, T)
        K = dimer_k(a, T)
        pm = (math.sqrt(1 + 4 * K * P) - 1) / (2 * K)
        yM, yD = pm / P, 1 - pm / P
        h = 1e-3
        dH = R * T ** 2 * (math.log(dimer_k(a, T + h)) - math.log(dimer_k(a, T - h))) / (2 * h)
        return math.log(yM), yD * dH / (yM + 2 * yD)
    return 0.0, 0.0   # the ideal-gas vapour, as the engine's one-component system


def species_gas(cid, T):
    state, H0, G0 = formation(cid)
    assert state == "ideal gas", cid
    H = H0 + h_ig(cid, T)
    S = (H0 - G0) / T0 + q(lambda t: cp_ig(cid, t) / t, T0, T)
    return H, H - T * S


def species_liquid(cid, T):
    state, H0, G0 = formation(cid)
    if state == "ideal gas":
        H, Gig = species_gas(cid, T)
        lnphi, _ = sat_vapour(cid, T)
        _, hr0 = sat_vapour(cid, T0)
        HL = H0 + hr0 - dhvap(cid, T0) + q(lambda t: cp_liquid(cid, t), T0, T)
        return HL, Gig + R * T * (math.log(psat(cid, T) / P0_KPA) + lnphi)
    if state == "solid":
        fu = COMPONENTS[cid]["fusion"]
        H0 = H0 + fu["Hfus_J_mol"]
        G0 = G0 + fu["Hfus_J_mol"] * (1 - T0 / fu["Tm_K"])
    HL = H0 + q(lambda t: cp_liquid(cid, t), T0, T)
    S = (H0 - G0) / T0 + q(lambda t: cp_liquid(cid, t) / t, T0, T)
    return HL, HL - T * S


def scipy_results(reactions, temps, species):
    out = {}
    for name, st in reactions.items():
        for T in temps:
            dH = dG = 0.0
            for cid, nu in st.items():
                H, G = species(cid, T)
                dH += nu * H
                dG += nu * G
            out.setdefault(name, []).append({"T_K": T, "dH_J_mol": dH, "dG_J_mol": dG, "lnK": -dG / (R * T)})
    return out


# ---------------------------------------------------------------------------------------------------------------
# 3. Measured liquid values (NIST WebBook) for the liquid path from the ideal-gas records
# ---------------------------------------------------------------------------------------------------------------

WEBBOOK_CHECK = ["acetic-acid", "ethanol", "ethyl-acetate", "water", "formic-acid"]
WEBBOOK_FILE = Path(__file__).resolve().parents[1] / "data" / "reactions" / "liquid_formation_webbook.json"


def webbook_check(cache):
    """The WebBook's liquid ΔfH°, ΔcH° and S° rows of the WEBBOOK_CHECK components, and the most recent article's
    values: ΔfH° (or ΔcH° turned into ΔfH° with the CODATA key values) and S°, giving ΔfG° with the CODATA entropies
    of the elements (formation_data.py, which this reuses for the WebBook pages and the CODATA values)."""
    import re
    import formation_data as fd
    out = {"_note": "NIST Chemistry WebBook (SRD 69), condensed-phase thermochemistry, liquid rows as printed; the "
                    "selection is the most recent article with a year. Made by "
                    "validation/python/reference_reactions.py --webbook CACHE. Compare the values with the WebBook pages.",
           "codata": {"url": fd.CODATA_URL, **fd.CODATA}, "components": {}}

    def year(r):
        m = re.search(r"(18|19|20)\d{2}", r["reference"])
        return int(m.group(0)) if m else -1
    for cid in WEBBOOK_CHECK:
        c = COMPONENTS[cid]
        rows = [r for r in fd.webbook_rows(c["cas"], Path(cache)) if r["state"] == "liquid"]
        f = fd.formula(c["formula"])
        hf = [(year(r), r["value"] * 1000, f"ΔfH° {r['value']} kJ/mol, {r['reference']}") for r in rows if r["quantity"] == "ΔfH°"]
        hf += [(year(r), fd.from_combustion(r["value"] * 1000, f), f"ΔcH° {r['value']} kJ/mol, {r['reference']}") for r in rows if r["quantity"] == "ΔcH°"]
        ss = [(year(r), r["value"], f"S° {r['value']} J/(mol K), {r['reference']}") for r in rows if r["quantity"] == "S°"]
        h, s = max(hf, key=lambda x: x[0]), max(ss, key=lambda x: x[0])
        out["components"][cid] = {
            "cas": c["cas"], "url": fd.WEBBOOK.format(ID="C" + c["cas"].replace("-", "")),
            "rows": rows, "Hf_J_mol": h[1], "Hf_from": h[2], "S_J_molK": s[1], "S_from": s[2],
            "Gf_J_mol": h[1] - T0 * (s[1] - fd.elements_entropy(f)),
        }
    WEBBOOK_FILE.parent.mkdir(parents=True, exist_ok=True)
    WEBBOOK_FILE.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    for cid, v in out["components"].items():
        print(f"{cid:14s} ΔfH° {v['Hf_J_mol'] / 1000:9.2f} ({v['Hf_from']})  ΔfG° {v['Gf_J_mol'] / 1000:9.2f} ({v['S_from']})")


def main():
    import sys
    if "--webbook" in sys.argv:
        webbook_check(sys.argv[sys.argv.index("--webbook") + 1])
        return
    cantera, version = cantera_results()
    gas = scipy_results(VAPOUR, T_VAPOUR, species_gas)
    liq = scipy_results(LIQUID, T_LIQUID, species_liquid)
    worst = 0.0
    for name in VAPOUR:
        for a, b in zip(cantera[name], gas[name]):
            worst = max(worst, abs(a["lnK"] - b["lnK"]))
            print(f"{name:28s} {a['T_K']:7.2f} K  lnK Cantera {a['lnK']:+.9f}  scipy {b['lnK']:+.9f}  "
                  f"dH {a['dH_J_mol']:.4f} / {b['dH_J_mol']:.4f}")
    print(f"largest |Δ ln K| Cantera vs scipy: {worst:.2e}")
    for name in LIQUID:
        for b in liq[name]:
            print(f"{name:28s} {b['T_K']:7.2f} K  lnK {b['lnK']:+.9f}  dH {b['dH_J_mol']:.4f}  dG {b['dG_J_mol']:.4f}")
    doc = {
        "_note": "Made by validation/python/reference_reactions.py: vapour reactions with Cantera (NASA 9 polynomials "
                 "fitted to the components' ideal-gas heat capacities) and with scipy (enthalpy and entropy integrals); "
                 "liquid reactions with scipy. Standard states: ideal gas at 100 kPa, pure liquid.",
        "cantera_version": version,
        "vapour": {name: {"stoichiometry": VAPOUR[name], "cantera": cantera[name], "scipy": gas[name]} for name in VAPOUR},
        "liquid": {name: {"stoichiometry": LIQUID[name], "scipy": liq[name]} for name in LIQUID},
    }
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(OUT.parents[2])}")


if __name__ == "__main__":
    main()
