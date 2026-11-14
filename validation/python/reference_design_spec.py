"""
Independent reference for the flowsheet design specifications (src/flowsheet/design-specs.js, proposal 0022).

The JavaScript engine solves a design specification as an outer loop of whole sequential-modular solves (bracket, then
its own Brent; several specifications by its own Broyden) around a torn recycle. Here the same flowsheet is written as
its steady-state balance in closed form and the specifications are solved with SciPy (BSD): one by
scipy.optimize.brentq, two by scipy.optimize.root (hybrid Powell). Nothing of the JavaScript engine is used.

The flowsheet (test/design-specs.test.js): a fixed feed F1 and a make-up feed F2 of water -> mixer -> component
separator (a share a_i of each component to the top product) -> its other outlet -> splitter (a fraction p to the purge,
the rest recycled to the mixer). With the fresh feed F_i (F1 + F2), the steady state is

    M_i = F_i / (1 - (1 - p)(1 - a_i)),   recycle R_i = (1 - p)(1 - a_i) M_i,   purge P_i = p (1 - a_i) M_i.

Cases:
  one:  F2's water varied to hold the recycle's total flow at 300 kmol/h (purge fraction 0.1);
  two:  F2's water and the purge fraction varied together, to hold the recycle at 300 kmol/h and the purge at 30 kmol/h.

Writes validation/fixtures/design_specs.json.

Usage: python validation/python/reference_design_spec.py
"""
import json
from pathlib import Path

import numpy as np
from scipy.optimize import brentq, root

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "design_specs.json"

F1 = np.array([20.0, 80.0])   # methanol, water, kmol/h
A = np.array([0.9, 0.15])     # share of each component to the top product


def loop(makeup_water, p):
    fresh = F1 + np.array([0.0, makeup_water])
    g = (1.0 - p) * (1.0 - A)
    M = fresh / (1.0 - g)
    return {"recycle": g * M, "purge": p * (1.0 - A) * M}


def main():
    one = brentq(lambda x: loop(x, 0.1)["recycle"].sum() - 300.0, 0.0, 500.0, xtol=1e-14, rtol=1e-15)
    sol = root(lambda v: [loop(v[0], v[1])["recycle"].sum() - 300.0, loop(v[0], v[1])["purge"].sum() - 30.0],
               [5.0, 0.1], method="hybr", tol=1e-12)
    assert max(abs(v) for v in sol.fun) < 1e-9, sol.fun
    two = loop(sol.x[0], sol.x[1])
    out = {
        "source": "validation/python/reference_design_spec.py (scipy.optimize.brentq and root on the closed-form steady state)",
        "feed_kmol_h": F1.tolist(), "top_shares": A.tolist(),
        "one": {"purge_fraction": 0.1, "recycle_kmol_h": 300.0, "makeup_water_kmol_h": one,
                "recycle_flows_kmol_h": loop(one, 0.1)["recycle"].tolist()},
        "two": {"recycle_kmol_h": 300.0, "purge_kmol_h": 30.0, "makeup_water_kmol_h": float(sol.x[0]),
                "purge_fraction": float(sol.x[1]), "recycle_flows_kmol_h": two["recycle"].tolist(),
                "purge_flows_kmol_h": two["purge"].tolist()},
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
