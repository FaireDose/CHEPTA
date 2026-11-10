"""Independent check of the k_ij fitted by validation/fit_kij_literature.mjs and validation/fit_kij_high_pressure.mjs.

That script fits with the engine's bubble pressures. Here the separate Python implementation of
the equations of state (reference_eos.py, through eos_fit_kij.bubble_p_fresh) recomputes, at the
fitted k_ij of src/data/kij.json, the bubble pressure (bubble_p below) of four points of every kept data set (the
lowest and highest pressure and two between). It writes validation/data/eos/literature_check.json;
test/eos-literature.test.js requires the engine to agree with these pressures.

Usage: python validation/python/eos_check_literature.py [--write]
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eos_fit_kij import DATA, ROOT, bubble_p_fresh  # noqa: E402
from reference_eos import Cubic  # noqa: E402


def bubble_p(e, T, x1, P_guess):
    """eos_fit_kij.bubble_p_fresh; near the mixture critical point, where its scan finds the
    residual positive below the bubble pressure and only the trivial solution (vapour = liquid)
    above it, the bubble pressure is the boundary between the two, found by bisection; it is
    accepted when the residual there is below 1e-4."""
    try:
        return bubble_p_fresh(e, T, x1, P_guess)
    except ValueError:
        pass
    z = np.array([x1, 1 - x1])

    def f(P):
        K = e.Pc / P * np.exp(5.37 * (1 + e.w) * (1 - e.Tc / T))
        r, w = e._inner(T, P, z, True, K * z / (K * z).sum())
        return None if np.max(np.abs(w - z)) < 1e-4 else r

    Ps = np.geomspace(0.3 * P_guess * 1000, 3 * P_guess * 1000, 25)
    vals = [f(P) for P in Ps]
    for a, b, fa, fb in zip(Ps, Ps[1:], vals, vals[1:]):
        if fa is not None and fa > 0 and fb is None:
            for _ in range(60):
                m = (a + b) / 2
                fm = f(m)
                if fm is not None and fm > 0:
                    a, fa = m, fm
                else:
                    b = m
            if fa < 1e-4:
                return a / 1000
    raise ValueError(f"no bubble pressure at T = {T} K, x1 = {x1}")


def points(name):
    d = json.load(open(os.path.join(DATA, name)))
    c = {k: n for n, k in enumerate(d["columns"])}
    skip = {e["row"] for e in d.get("excluded", [])}
    # a ThermoML gas-solubility file may give the partial pressure of the gas (p_1_kPa) instead of the total pressure:
    # twice it is the starting guess of the bubble pressure (the check compares the engine with this implementation,
    # not with the data)
    P = lambda r: r[c["P_kPa"]] if r[c["P_kPa"]] is not None else 2 * r[c["p_1_kPa"]]
    return [(r[c["T_K"]], r[c["x_1"]], P(r), r[c["P_kPa"]]) for n, r in enumerate(d["rows"])
            if n not in skip and r[c["x_1"]] is not None and 0 < r[c["x_1"]] < 1]


WINDOW = json.load(open(os.path.join(DATA, "high_pressure_fits.json")))["window"]


def main():
    kept = [e for f in ("literature_fits.json", "high_pressure_fits.json") for e in json.load(open(os.path.join(DATA, f)))["entries"]]
    kij = {(p["model"], p["i"], p["j"]): p["kij"] for p in json.load(open(os.path.join(ROOT, "src", "data", "kij.json")))["pairs"]}
    out = []
    for entry in kept:
        model, i, j = entry["model"], entry["i"], entry["j"]
        k = kij[(model, i, j)]
        if k != entry["kij"]:
            raise SystemExit(f"{model} {i}-{j}: kij.json has {k}, literature_fits.json {entry['kij']}: run eos_fit_kij.py --literature-only --write")
        pts = sorted((p for f in entry["source"]["data"] for p in points(os.path.basename(f))
                      if not os.path.basename(f).startswith("thermoml_") or (p[0] <= WINDOW["T_K"] and (p[3] or p[2] / 2) <= WINDOW["P_kPa"])), key=lambda p: p[2])
        e = Cubic(model, [i, j])
        e.k[0, 1] = e.k[1, 0] = k
        kb = entry.get("kij_b_K", 0.0)
        e.kb[0, 1] = e.kb[1, 0] = kb   # k_ij(T) = k + kb / T
        # four points from the lowest to the highest pressure; a point where the equation of state has no bubble
        # pressure (a fit outside the gate may have some) is replaced by the next one
        for q in (0, len(pts) // 3, 2 * len(pts) // 3, len(pts) - 1):
            order = list(range(q, len(pts))) + list(range(q - 1, -1, -1))
            for n in order:
                T, x, P, P_exp = pts[n]
                try:
                    P_ref = bubble_p(e, T, x, P)
                    break
                except ValueError:
                    continue
            row = {"model": model, "pair": [i, j], "kij": k, **({"kij_b_K": kb} if kb else {}), "T_K": T, "x_1": x, "P_exp_kPa": P_exp, "P_reference_kPa": round(P_ref, 3)}
            if kb:
                # with k_ij(T) the residual enthalpy has a dk_ij/dT term; this implementation takes it by a numerical
                # temperature derivative of the residual Helmholtz energy, the engine analytically
                row["hR_liquid_reference_J_mol"] = round(e.h_res(T, P_ref * 1000, [x, 1 - x], "liquid"), 3)
            print(f"{model} {i}-{j} k_ij = {k}{f' + {kb} K / T' if kb else ''}: T = {T} K, x1 = {x}, P_exp = {P_exp} kPa, reference {P_ref:.2f} kPa")
            out.append(row)
    if "--write" in sys.argv:
        with open(os.path.join(DATA, "literature_check.json"), "w") as f:
            json.dump({"_about": "Bubble pressures of the independent Python equation of state (validation/python/eos_check_literature.py) at the k_ij fitted to the open literature; test/eos-literature.test.js compares the engine with them.",
                       "points": out}, f, indent=1)
            f.write("\n")
        print("wrote validation/data/eos/literature_check.json")


if __name__ == "__main__":
    main()
