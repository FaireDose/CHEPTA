"""
Independent reference for vapour + two liquids with a dimerizing acid in the vapour (acetic acid; the chemical theory),
decision docs/decisions/2026-11-12-02-acid-chemical-theory-vlle.md: the three-phase flash (src/equilibrium/flash.js)
and two liquids on the stages of a distillation column and of an absorber (src/units/columns/two-liquids.js). It
shares no code with the JavaScript engine.

The thermodynamics: the liquid model of reference_model.py (NRTL, CHEPTA's default sets), and the vapour of
reference_mesh_acid.ActivityDimer: an ideal gas of true species, the monomer of every component and the dimer of the
acid, p_D = K(T) p_M^2, the monomers' pressures over a liquid x

  p_M,i = x_i gamma_i(x) p_M,i^sat   (acid; p^sat = p_M^sat + K p_M^sat^2),     p_i = x_i gamma_i(x) p_i^sat   (others)

and the apparent vapour y_i = (p_M,i + 2 p_D,i) / sum_k (p_M,k + 2 p_D,k), the true pressure P_true = sum (p_M + p_D).
Two liquids x', x'' are in equilibrium when x'_i gamma_i(x') = x''_i gamma_i(x'') (the vapour does not enter); a vapour
is in equilibrium with both when it is the vapour of x' at P_true(x') = P. This is the liquid-side form (the vapour's
species from the liquid, as a bubble point); the engine takes the fugacity coefficients of the apparent vapour y at P
(sys.lnKAssociation) inside its successive substitution and Newton steps, so the two meet only at the solution.

The flash (T and P given, or P and the vapour fraction): the unknowns x', x'', the vapour fraction (or T) and the
fraction of x''; the equations: n - 1 component balances z = (1 - bV - b2) x' + bV y(x') + b2 x'', the n equal
activities, the two summations and P_true(x') = P, solved by scipy.optimize.root (hybrid Powell) from the
liquid-liquid split of reference_mesh_vll.TwoLiquids; vapour + one liquid the same without x''; two liquids without a
vapour from TwoLiquids.split, with P_true(x') > P. Each liquid of an answer is checked stable against a further liquid
(TwoLiquids.tpd, Michelsen's tangent-plane distance) and the answer's phases are recorded with their checks.

The columns: reference_mesh.Column (distillation) and reference_mesh_absorber.Column (no condenser, no reboiler) with
TwoLiquidsDimer below: the stage's whole-liquid K-values K_i = K_i^dimer(x', T) x'_i / x_i and its liquid enthalpy
(1 - beta) h_L(x') + beta h_L(x'') (reference_mesh_vll.TwoLiquids, unchanged), the vapour's enthalpy with the dimers
it holds (reference_enthalpy.vapour_h). Each column is also solved with the dimers left out of the phase equilibrium
(TwoLiquids alone), for what ignoring them changes.

The cases: validation/data/columns/acid/vlle-cases.json. Writes validation/fixtures/vlle_acid.json, which
test/vlle-acid.test.js reads.
Regenerate: python validation/python/reference_vlle_acid.py      (numpy, scipy, thermo, iapws; about a minute)
"""
import json
from pathlib import Path

import numpy as np
from scipy.optimize import brentq, root

from reference_mesh import column_of
from reference_mesh_acid import ActivityDimer
from reference_mesh_vll import TwoLiquids
import reference_mesh_absorber as absorber

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / "validation" / "data" / "columns" / "acid" / "vlle-cases.json"
OUT = ROOT / "validation" / "fixtures" / "vlle_acid.json"


class TwoLiquidsDimer(TwoLiquids, ActivityDimer):
    """Two liquids on a stage (TwoLiquids) with the vapour of the chemical theory (ActivityDimer.K, the liquid-side
    form): TwoLiquids.K calls ActivityDimer.K for the liquid x' (Python's method order)."""


class StageLiquids:
    """reference_mesh.Column.profile reads a stage's liquids as split(x, T) -> (x_I, x_II, beta_II); TwoLiquids gives
    (beta, x', x''). This view of a TwoLiquids object gives the former, for the profile only."""

    def __init__(self, th):
        self.th = th

    def __getattr__(self, k):
        return getattr(self.th, k)

    def split(self, x, T):
        s = self.th.split(x, T)
        return None if s is None else (s[1], s[2], s[0])


def vapour_of(th, x, T):
    """(P_true, apparent y) over liquid x at T."""
    Pt, a = th.true_species(x, T)
    return Pt, a * x / float(np.sum(a * x))


def tpd_of(th, x, T):
    return float(th.tpd(np.asarray(x, float), T)[0])


def flash_three(th, z, T, P, start, VF=None):
    """Vapour + two liquids at T, P (or at P and the vapour fraction VF, T unknown). start: (b2, x1, x2, bV or T)."""
    n = len(z)
    b2, x1, x2, last = start

    def F(u):
        a, b = u[:n], u[n:2 * n]
        if VF is None:
            bV, B2, TT = u[2 * n], u[2 * n + 1], T
        else:
            bV, B2, TT = VF, u[2 * n + 1], u[2 * n]
        Pt, y = vapour_of(th, a, TT)
        ga, gb = th.s.gamma(np.clip(a, 1e-300, None), TT), th.s.gamma(np.clip(b, 1e-300, None), TT)
        r = [z[i] - ((1 - bV - B2) * a[i] + bV * y[i] + B2 * b[i]) for i in range(n - 1)]
        r += list(np.log(np.clip(a, 1e-300, None) * ga) - np.log(np.clip(b, 1e-300, None) * gb))
        r += [np.sum(a) - 1, np.sum(b) - 1, Pt / P - 1]
        return np.array(r)

    u0 = np.concatenate([x1, x2, [last, b2]])
    sol = root(F, u0, method="hybr", options={"xtol": 1e-15})
    u = sol.x
    res = float(np.max(np.abs(F(u))))
    a, b = u[:n], u[n:2 * n]
    bV, B2, TT = (u[2 * n], u[2 * n + 1], T) if VF is None else (VF, u[2 * n + 1], u[2 * n])
    assert res < 1e-11, f"three-phase flash did not converge: residual {res}"
    assert np.all(a > 0) and np.all(b > 0) and 0 < B2 < 1 - bV and 0 <= bV <= 1, (a, b, bV, B2)
    _, y = vapour_of(th, a, TT)
    return {"T_K": float(TT), "phases": [
        {"type": "vapour", "fraction": float(bV), "x": y.tolist()},
        {"type": "liquid", "fraction": float(1 - bV - B2), "x": a.tolist(), "tpd": tpd_of(th, a, TT)},
        {"type": "liquid", "fraction": float(B2), "x": b.tolist(), "tpd": tpd_of(th, b, TT)}], "residual": res}


def flash_vl(th, z, T, P, x0, bV0):
    n = len(z)

    def F(u):
        x, bV = u[:n], u[n]
        Pt, y = vapour_of(th, x, T)
        return np.array([z[i] - ((1 - bV) * x[i] + bV * y[i]) for i in range(n - 1)] + [np.sum(x) - 1, Pt / P - 1])

    sol = root(F, np.concatenate([x0, [bV0]]), method="hybr", options={"xtol": 1e-15})
    x, bV = sol.x[:n], sol.x[n]
    res = float(np.max(np.abs(F(sol.x))))
    assert res < 1e-11 and 0 < bV < 1 and np.all(x > 0), (res, x, bV)
    _, y = vapour_of(th, x, T)
    return {"T_K": T, "phases": [{"type": "vapour", "fraction": float(bV), "x": y.tolist()},
                                 {"type": "liquid", "fraction": float(1 - bV), "x": x.tolist(), "tpd": tpd_of(th, x, T)}],
            "residual": res}


def flash_case(th, f):
    z, P = np.asarray(f["z"], float), f["P_kPa"]
    if f["expect"] == "LL":
        T = f["T_K"]
        b, x1, x2 = th.split(z, T)
        return {"T_K": T, "phases": [{"type": "liquid", "fraction": float(1 - b), "x": x1.tolist(), "tpd": tpd_of(th, x1, T)},
                                     {"type": "liquid", "fraction": float(b), "x": x2.tolist(), "tpd": tpd_of(th, x2, T)}],
                "true_pressure_over_the_liquids_kPa": float(vapour_of(th, x1, T)[0])}
    if f["expect"] == "VL":
        T = f["T_K"]
        Pt, y = vapour_of(th, z, T)
        return flash_vl(th, z, T, P, z.copy(), 0.5)
    # vapour + two liquids: start from the liquid-liquid split of the feed at T (or at the start temperature)
    T0 = f.get("T_K", f.get("T_start_K"))
    b, x1, x2 = th.split(z, T0)
    if "VF" in f:
        return flash_three(th, z, None, P, (b * (1 - f["VF"]), x1, x2, T0), VF=f["VF"])
    return flash_three(th, z, T0, P, (b * 0.9, x1, x2, 0.1))


def absorber_profile(case, th):
    col = case["column"]
    feeds = []
    for f in col["feeds"]:
        z, T = np.asarray(f["z"], float), f["T_K"]
        h = th.hL(z, T) if f["phase"] == "liquid" else th.hV(z, T)
        feeds.append((f["stage"] - 1, f["flow_mol_s"], f["z"], h, 1.0 if f["phase"] == "liquid" else 0.0, T))
    c = absorber.Column(th, len(case["components"]), col["stages"], feeds, False, [], [])
    u, info = c.solve(c.start())
    prof = c.profile(u, info)
    for s in prof["stages"]:
        sp = th.split(np.asarray(s["x"]), s["T_K"])
        s["liquids"] = None if sp is None else {"beta": float(sp[0]), "x1": sp[1].tolist(), "x2": sp[2].tolist()}
    return prof


def main():
    doc = json.loads(CASES.read_text())
    out = {"_about": "Written by validation/python/reference_vlle_acid.py (independent reference: vapour + two liquids "
                     "with the chemical theory of acetic acid's vapour). The cases: validation/data/columns/acid/"
                     "vlle-cases.json. Converged reference answers are not validated against data.",
           "flashes": {}, "columns": {}}
    for f in doc["flashes"]:
        th = TwoLiquidsDimer(f["components"], f["P_kPa"], f["model"])
        r = flash_case(th, f)
        out["flashes"][f["id"]] = r
        print(f["id"], r["T_K"], [(p["type"], round(p["fraction"], 6)) for p in r["phases"]], flush=True)
    for case in doc["columns"]:
        print(case["id"], flush=True)
        rec = {}
        for dimers in (True, False):
            th = (TwoLiquidsDimer if dimers else TwoLiquids)(case["components"], case["pressure_kPa"], case["thermo"]["model"])
            if case["column"]["configuration"] == "absorber":
                prof = absorber_profile(case, th)
            else:
                c = column_of(case, th=th)
                u, info = c.solve(c.start())
                c.th = StageLiquids(th)
                prof = c.profile(u, info)    # reference_mesh.Column's own record of each stage's liquids (x_I, x_II, beta_II)
            rec["rigorous" if dimers else "without_dimers_in_the_equilibrium"] = prof
            print("  dimers" if dimers else "  without", [round(s["T_K"], 3) for s in prof["stages"]],
                  [j + 1 for j, s in enumerate(prof["stages"]) if s["liquids"]], flush=True)
        out["columns"][case["id"]] = rec
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
