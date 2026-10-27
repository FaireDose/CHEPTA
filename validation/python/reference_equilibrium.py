"""
Independent reference for the equilibrium reactor (src/equilibrium/reaction-equilibrium.js, proposal 0010 step 4).

The engine solves Σ ν ln a = ln K for the extents of the listed reactions, by Newton's method. Here the same
equilibria are found two other ways, from the same records of src/data/components.json:

  1. Gas (ideal gas): Cantera (https://cantera.org/, 3-clause BSD) minimizes the Gibbs energy of an ideal-gas phase
     that holds only the species of the reactions, with the elements balanced (ThermoPhase.equilibrate("TP")). Its
     species are those of reference_reactions.py: NASA 9 polynomials fitted to the components' ideal-gas heat
     capacities, with g(298.15 K) = ΔfG°. With as many independent reactions as the species minus the elements, the
     minimum of the Gibbs energy is the equilibrium of the listed reactions (Rawlings and Ekerdt, sections 3.5.1 and
     3.5.2, pp. 88 and 92).
  2. Liquid (NRTL): ln K from the scipy route of reference_reactions.py (the pure-liquid standard state), γ from the
     NRTL of reference_model.py with the databank's pairs, and the extent by scipy.optimize.brentq on
     Σ ν ln(γ x) = ln K.

Writes validation/fixtures/equilibrium.json, which test/equilibrium-reactor.test.js compares with the engine.
Usage: python validation/python/reference_equilibrium.py
"""
import json
from pathlib import Path

import numpy as np
from scipy.optimize import brentq

from reference_model import COMPONENTS, System
from reference_reactions import nasa9_ranges, formation, parse_formula, scipy_results, species_liquid

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "equilibrium.json"

# the cases of the check; defined here and in test/equilibrium-reactor.test.js (CHEPTA ships no reactions)
GAS = {
    "methanol-from-co2": {
        "reactions": {"methanol": {"carbon-dioxide": -1, "hydrogen": -3, "methanol": 1, "water": 1},
                      "shift": {"carbon-dioxide": -1, "hydrogen": -1, "carbon-monoxide": 1, "water": 1}},
        "feed": {"carbon-dioxide": 1.0, "hydrogen": 3.0, "methanol": 0.0, "water": 0.0, "carbon-monoxide": 0.0},
        "conditions": [(493.15, 3000.0), (523.15, 5000.0), (573.15, 8000.0)],
    },
    "ammonia": {
        "reactions": {"ammonia": {"nitrogen": -1, "hydrogen": -3, "ammonia": 2}},
        "feed": {"nitrogen": 1.0, "hydrogen": 3.0, "ammonia": 0.0},
        "conditions": [(650.0, 10000.0), (700.0, 20000.0)],
    },
    "ethanol-dehydration": {
        "reactions": {"dehydration": {"ethanol": -1, "ethylene": 1, "water": 1}},
        "feed": {"ethanol": 1.0, "ethylene": 0.0, "water": 0.5},
        "conditions": [(450.0, 101.325), (550.0, 500.0)],
    },
}
LIQUID = {
    "ethyl-acetate-esterification": {
        "reactions": {"esterification": {"acetic-acid": -1, "ethanol": -1, "ethyl-acetate": 1, "water": 1}},
        "model": "NRTL",
        "feeds": [{"acetic-acid": 1.0, "ethanol": 1.0, "ethyl-acetate": 0.0, "water": 0.0},
                  {"acetic-acid": 1.0, "ethanol": 2.0, "ethyl-acetate": 0.0, "water": 0.5}],
        "temperatures": [320.0, 345.0],
    },
}


def cantera_gas(case):
    import cantera as ct
    import yaml
    ids = list(case["feed"])
    species = []
    for cid in ids:
        state, H0, G0 = formation(cid)
        assert state == "ideal gas", cid
        species.append({"name": cid, "composition": parse_formula(COMPONENTS[cid]["formula"]), "thermo": nasa9_ranges(cid, H0, G0)})
    doc = {"units": {"length": "m", "quantity": "mol", "activation-energy": "J/mol"},
           "phases": [{"name": "gas", "thermo": "ideal-gas", "elements": sorted({e for s in species for e in s["composition"]}),
                       "species": ids, "state": {"T": 300.0, "P": 1e5}}],
           "species": species}
    gas = ct.Solution(yaml=yaml.safe_dump(doc))
    feed = np.array([case["feed"][c] for c in ids])
    out = []
    for T, P in case["conditions"]:
        gas.TPX = T, P * 1000.0, {c: max(v, 1e-30) for c, v in case["feed"].items()}
        gas.equilibrate("TP")
        y = gas.X
        # the amounts: the elements of the feed are kept, so scale the mole fractions by the total amount; the total
        # follows from one element balance (the first element present in the feed)
        el = gas.element_names[0]
        k = gas.element_index(el)
        atoms = np.array([gas.n_atoms(s, k) for s in range(gas.n_species)])
        total = float(feed @ atoms) / float(y @ atoms)
        out.append({"T_K": T, "P_kPa": P, "y": {c: float(v) for c, v in zip(ids, y)}, "total": total, "cantera": ct.__version__})
    return out


def nrtl_liquid(case):
    ids = list(case["feeds"][0])
    nu = np.array([case["reactions"]["esterification"][c] for c in ids], float)
    sysm = System(ids, case["model"])
    lnk = scipy_results({"esterification": case["reactions"]["esterification"]}, case["temperatures"], species_liquid)["esterification"]
    out = []
    for T, k in zip(case["temperatures"], lnk):
        for feed in case["feeds"]:
            n0 = np.array([feed[c] for c in ids], float)
            def g(xi):
                n = n0 + nu * xi
                x = n / n.sum()
                return float(nu @ np.log(x * sysm.gamma(x, T))) - k["lnK"]
            lo = max(-n0[i] / nu[i] for i in range(len(ids)) if nu[i] > 0) if any(n0[i] > 0 for i in range(len(ids)) if nu[i] > 0) else 0.0
            hi = min(n0[i] / -nu[i] for i in range(len(ids)) if nu[i] < 0)
            eps = 1e-12
            xi = brentq(g, lo + eps, hi - eps, xtol=1e-14, rtol=1e-14)
            out.append({"T_K": T, "lnK": k["lnK"], "feed": feed, "extent": xi})
    return out


def main():
    doc = {"_note": "Made by validation/python/reference_equilibrium.py: gas cases by Cantera's Gibbs minimization of an "
                    "ideal-gas phase (NASA 9 polynomials fitted to the components' records); liquid cases by scipy with "
                    "the NRTL of reference_model.py and ln K from reference_reactions.py. Standard states: ideal gas at "
                    "100 kPa, pure liquid.",
           "gas": {}, "liquid": {}}
    for name, case in GAS.items():
        res = cantera_gas(case)
        doc["gas"][name] = {**{k: v for k, v in case.items() if k != "conditions"}, "results": res}
        for r in res:
            print(f"{name:22s} {r['T_K']:7.2f} K {r['P_kPa']:8.1f} kPa  " + "  ".join(f"{c} {v:.6f}" for c, v in r["y"].items()))
    for name, case in LIQUID.items():
        res = nrtl_liquid(case)
        doc["liquid"][name] = {**{k: v for k, v in case.items() if k != "temperatures"}, "results": res}
        for r in res:
            print(f"{name:30s} {r['T_K']:7.2f} K lnK {r['lnK']:+.6f} feed {r['feed']} extent {r['extent']:.9f}")
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(OUT.parents[2])}")


if __name__ == "__main__":
    main()
