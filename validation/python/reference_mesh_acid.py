"""
Independent reference for columns with a dimerizing acid in the vapour (acetic acid; the chemical theory), for the cases
of validation/data/columns/acid/cases.json. It shares no code with the JavaScript engine (src/units/columns/engine.js,
src/thermo/system.js).

The column is reference_mesh.Column (the MESH equations, its Newton solver, its conventions) with the thermodynamics
below. The vapour is an ideal gas of true species: the monomer of every component and the dimer of the acid, with
p_D = K(T) p_M^2 (reference_model.dimer_k: the component's association record). The liquid sees the monomers:

  monomer pressure over the liquid   p_M,i = x_i gamma_i p_M,i^sat      (acid: p_M^sat from p^sat = p_M^sat + K p_M^sat^2)
                                     p_i   = x_i gamma_i p_i^sat        (the other components)
  true pressure                      P_true = sum_i (p_M,i + p_D,i)
  apparent vapour (a dimer = two)    y_i = (p_M,i + 2 p_D,i) / sum_k (p_M,k + 2 p_D,k)

A stage is at equilibrium when P_true = P, the column's pressure. Written as K-values of the liquid alone,
  K_i(x, T) = y_i / x_i * P_true / P,
so that sum_i K_i x_i = P_true / P = 1 is the stage's bubble-point condition and y = K x its vapour. This is the
liquid-side form (the vapour's species follow from the liquid, as in a bubble-point calculation); the engine instead
takes the fugacity coefficients of the apparent vapour y at P (the dimers of y from a quadratic for each acid), so the
two reach the stage's equilibrium by different routes and agree only at the solution.

The enthalpies are those of reference_enthalpy.py: the vapour's ideal-gas (monomer) enthalpy plus the enthalpy of the
dimers it holds at T, P and y; the liquid's from the acid's heat of vaporization to its dimerized saturated vapour.
One dimerizing acid per mixture (reference_enthalpy.vapour_h).

For each case also: the same column with the dimers left out of the phase equilibrium (reference_mesh.Activity: K =
gamma p^sat / P; the enthalpies unchanged), for what ignoring them changes; and for the published example (case K2)
the column at every feed stage the article leaves open, and with 10 stages, against the published compositions.

Cases with design specifications (a purity, a recovery; "start" in the case): reference_mesh_specifications.SpecColumn,
which writes them among the equations of its Newton system, with the thermodynamics of this file.

Writes validation/fixtures/columns_acid.json, which test/columns-acid.test.js reads.
Regenerate: python validation/python/reference_mesh_acid.py      (numpy, scipy, thermo, iapws)
"""
import json
from pathlib import Path

import numpy as np

from reference_mesh import Activity, solve_case
import reference_mesh_specifications as spec_ref
from reference_model import psat_kpa, dimer_k

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / "validation" / "data" / "columns" / "acid" / "cases.json"
OUT = ROOT / "validation" / "fixtures" / "columns_acid.json"


class ActivityDimer(Activity):
    """reference_mesh.Activity with the chemical theory for the components that carry an association record."""

    def true_species(self, x, T):
        """(P_true, apparent partial pressures per unit x) of the vapour over liquid x at T, kPa."""
        g = self.s.gamma(np.clip(x, 1e-300, None) / np.sum(np.clip(x, 1e-300, None)), T)
        P, app_over_x = 0.0, np.zeros(len(x))
        for i, c in enumerate(self.s.c):
            ps = psat_kpa(c, T)
            if "association" in c:
                Kd = dimer_k(c["association"], T)
                pm_sat = (-1 + np.sqrt(1 + 4 * Kd * ps)) / (2 * Kd)
                pm = x[i] * g[i] * pm_sat
                P += pm + Kd * pm ** 2
                app_over_x[i] = g[i] * pm_sat * (1 + 2 * Kd * pm)
            else:
                P += x[i] * g[i] * ps
                app_over_x[i] = g[i] * ps
        return P, app_over_x

    def K(self, x, T):
        x = np.asarray(x, float)
        P_true, a = self.true_species(x, T)
        return a / float(np.sum(a * x)) * P_true / self.P


def thermo_of(case, dimers=True):
    assert case["thermo"]["kind"] == "chepta" and case["thermo"]["vapour"] == "ideal"
    return (ActivityDimer if dimers else Activity)(case["components"], case["pressure_kPa"], case["thermo"]["model"])


def products(prof):
    return {"x_D": prof["x_D"], "x_B": prof["x_B"], "T_top_K": prof["stages"][0]["T_K"], "T_bottom_K": prof["stages"][-1]["T_K"],
            "Q_condenser_W": prof["Q_condenser_W"], "Q_reboiler_W": prof["Q_reboiler_W"]}


def main():
    doc = json.loads(CASES.read_text())
    out = {"_about": "Written by validation/python/reference_mesh_acid.py (independent MESH reference with the chemical "
                     "theory of a dimerizing vapour). The cases: validation/data/columns/acid/cases.json. Converged "
                     "reference profiles are not validated against data.", "cases": {}}
    for case in doc["cases"]:
        cid = case["id"]
        print(cid, flush=True)
        th = thermo_of(case)
        if "start" in case:
            # design specifications (purity, recovery): reference_mesh_specifications.SpecColumn, the specifications
            # among its Newton equations, with this file's thermodynamics
            spec_ref.thermo_of = thermo_of
            c, u, info = spec_ref.solve_fixed(case, [])
            prof = spec_ref.record(case, c, u, info)
            if "published" in case:
                prof["published_reflux_ratio"] = case["published"]["reflux_ratio"]
            out["cases"][cid] = {"title": case["title"], "rigorous": prof}
            continue
        c, u, prof = solve_case(case, th=th)
        rec = {"title": case["title"], "rigorous": prof, "checks": {}}
        ck = rec["checks"]
        ck["feed_T_K"] = [th.feed_T(case["column"]["feed"])]
        # the true pressure over every stage's liquid is the column's (the bubble-point condition, from the species)
        ck["true_pressure_kPa_by_stage"] = [float(th.true_species(np.array(s["x"]), s["T_K"])[0]) for s in prof["stages"]]
        _, _, plain = solve_case(case, th=thermo_of(case, dimers=False))
        ck["without_dimers_in_the_equilibrium"] = products(plain)
        if "published" in case:
            pub, by = case["published"], {}
            for fs in range(2, case["column"]["stages"]):
                _, _, p = solve_case(case, th=th, feed_stage=fs)
                by[str(fs)] = {"x_D_water": p["x_D"][0], "x_B_water": p["x_B"][0]}
            ten = {}
            for fs in range(2, 10):
                _, _, p = solve_case(case, th=th, stages=10, feed_stage=fs)
                ten[str(fs)] = {"x_D_water": p["x_D"][0], "x_B_water": p["x_B"][0]}
            ck["published"] = {"published_x_D_water": pub["distillate_x_water"], "published_x_B_water": pub["residue_x_water"],
                               "by_feed_stage_8_stages": by, "by_feed_stage_10_stages": ten}
        out["cases"][cid] = rec
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
