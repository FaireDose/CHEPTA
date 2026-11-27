"""
Independent reference for the condenser with a vapour and a liquid distillate (proposal 0026, condenser
"vapour_liquid"; validation/data/columns/vapour-liquid/): the MESH equations of reference_mesh.py, whose Column class
holds the condenser (stage 1 an equilibrium stage whose vapour V_1 is the vapour distillate and whose liquid is split
into the reflux L_1 and the liquid distillate U_1; The ChemSep Book, 2nd ed., 2006, public domain, section 13.2; the
condenser's own specification: its temperature, the vapour distillate's flow or the vapour's share of the distillate).
It shares no code with the JavaScript engine (src/units/columns/engine.js).

The cases:
  H1  the constant-alpha column with a light component, solved with the vapour share given, then with the condenser
      temperature and with the vapour distillate's flow of that solution (the three must be the same column);
  H2  the limits: a share of 0.001 against the total condenser, 0.999 against the partial one (both solved here), and
      the top vapour's bubble and dew temperatures, for a temperature refused above the dew point;
  H3  CHEPTA-Lab's methanol column with Peng-Robinson at 53 C (the feed's enthalpy from this reference's own
      flash of the feed at its temperature);
  H4  the same column fed with CHEPTA-Lab's converged plant's column feed (CO2 0.2425 %; proposal 0029, step 1, M6),
      also solved with the vapour share of its answer given in place of the temperature.

Writes validation/fixtures/columns-vapour-liquid.json, which test/columns-vapour-liquid.test.js reads.
Regenerate: python validation/python/reference_mesh_condenser.py      (numpy, scipy, thermo, iapws; a few minutes)
"""
import json
from pathlib import Path

import numpy as np
from scipy.optimize import brentq

import reference_mesh as rm

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / "validation" / "data" / "columns" / "vapour-liquid"
OUT = ROOT / "validation" / "fixtures" / "columns-vapour-liquid.json"
KMOL_H = 1000 / 3600     # mol/s per kmol/h


def solve(case, condenser, specs, th=None):
    c = json.loads(json.dumps(case))
    c["column"]["condenser"] = condenser
    c["specs"] = specs
    return rm.solve_case(c, th=th)


def top_vapour_limits(th, y):
    """The bubble and the dew temperature of the vapour entering the condenser (stage 2's vapour), at the column's
    pressure."""
    y = np.asarray(y, float)
    if isinstance(th, rm.Alpha):      # K_i = alpha_i p(T) / P: the dew point where p(T) = P sum(y_i / alpha_i)
        return {"bubble_K": th.bubble_T(y), "dew_K": th.B / (th.A - np.log(th.P * float(np.sum(y / th.alpha))))}
    return {"bubble_K": rm.bubble_T(th, y), "dew_K": rm.dew_T(th, y)}


def feed_flash(th, z, T):
    """The feed's vapour fraction and molar enthalpy at T: successive substitution from Wilson's K-values (an
    equation of state) with the Rachford-Rice equation, to 1e-14."""
    z = np.asarray(z, float)
    c = th.cub
    K = c.Pc / (th.P * 1000) * np.exp(5.373 * (1 + c.w) * (1 - c.Tc / T))
    x, y, v = z.copy(), z.copy(), 0.0
    for _ in range(5000):
        g = lambda b: float(np.sum(z * (K - 1) / (1 + b * (K - 1))))
        if g(0.0) <= 0:
            return 0.0, th.hL(z, T)
        if g(1.0) >= 0:
            return 1.0, th.hV(z, T)
        v = brentq(g, 0.0, 1.0, xtol=1e-15)
        xn = z / (1 + v * (K - 1)); yn = K * xn
        xn, yn = xn / xn.sum(), yn / yn.sum()
        step = max(np.max(np.abs(xn - x)), np.max(np.abs(yn - y)))
        x, y = xn, yn
        K = rm.K_xy(th, x, y, T)
        if step < 1e-14:
            break
    return v, (1 - v) * th.hL(x, T) + v * th.hV(y, T)


def h3_case(case):
    """H3 as reference_mesh takes a column: the feed in mol/s with its mole fractions and enthalpy, the specs in mol/s."""
    ids = case["components"]
    fl = np.array([case["column"]["feed"]["flow_kmol_h"].get(i, 0.0) for i in ids]) * KMOL_H
    th = rm.Eos(ids, case["pressure_kPa"], "PR")
    VF, h = feed_flash(th, fl / fl.sum(), case["column"]["feed"]["T_K"])
    c = json.loads(json.dumps(case))
    c["column"]["feed"] = {"stage": case["column"]["feed"]["stage"], "flow_mol_s": float(fl.sum()), "z": (fl / fl.sum()).tolist(),
                           "q": 1 - VF, "h_J_mol": h}
    c["specs"] = [{"kind": "bottoms_flow_mol_s", "value": s["value"] * KMOL_H} if s["kind"] == "bottoms_flow_kmol_h" else s for s in case["specs"]]
    th.feed_h = lambda f: f["h_J_mol"]
    # the start's bubble points: where the stage's liquid has none because of its traces of gases (ppm of CO and N2,
    # whose K grows as T falls), taken without the components below 1e-3 (a start value only, as the engine's start does;
    # Newton then solves the stages with them)
    exact = th.bubble_T

    def start_bubble(x):
        try:
            return exact(x)
        except (RuntimeError, ValueError, np.linalg.LinAlgError):
            kept = np.where(np.asarray(x) >= 1e-3, x, 0.0)
            return exact(kept / kept.sum())
    th.bubble_T = start_bubble
    return c, th, {"VF": VF, "h_J_mol": h}


def methanol_column(c):
    """H3 and H4: the column solved from the engine's profile, perturbed (1 % on every flow, 0.5 K on every temperature,
    the compositions mixed 1 % toward the feed); from its own bubble-point start this reference does not converge on
    these columns. H4 also solved with the vapour share of that answer given in place of the temperature: the same
    column, so the same temperature (proposal 0029, step 1)."""
    cc, th, feed = h3_case(c)
    st = json.loads((ROOT / "validation" / "fixtures" / "columns-vapour-liquid-engine-start.json").read_text())["cases"][c["id"]]
    col = rm.column_of(cc, th=th)
    z = np.asarray(cc["column"]["feed"]["z"], float)
    S = st["stages"]
    x = np.array([0.99 * np.asarray(q["x"]) + 0.01 * z for q in S])
    T = np.array([q["T_K"] + 0.5 for q in S])
    L = np.array([q["L_mol_s"] for q in S]) * 1.01
    V = np.array([q["V_mol_s"] for q in S]) * 0.99
    u0 = col.pack(x, T, L, V, st["Q_condenser_W"] * 1.01, st["Q_reboiler_W"] * 0.99, S[0]["U_mol_s"] * 1.01)
    u, info = col.solve(u0)
    prof = col.profile(u, info)
    prof["start"] = "the engine's profile, perturbed (validation/fixtures/columns-vapour-liquid-engine-start.json)"
    prof["feed"] = feed
    rec = {"rigorous": prof,
           "kmol_h": {"liquid_distillate": prof["U_liquid_distillate_mol_s"] / KMOL_H,
                      "vapour_distillate": prof["V_vapour_distillate_mol_s"] / KMOL_H,
                      "bottoms": prof["B_mol_s"] / KMOL_H}}
    if c["id"].startswith("H4"):
        share = prof["vapour_share"]
        c2 = json.loads(json.dumps(cc))
        c2["specs"] = [s for s in cc["specs"] if s["kind"] != "condenser_T_K"] + [{"kind": "vapour_share", "value": share}]
        col2 = rm.column_of(c2, th=th)
        u2, info2 = col2.solve(u0)
        p2 = col2.profile(u2, info2)
        rec["at_vapour_share"] = {"vapour_share": share, "condenser_T_K": p2["stages"][0]["T_K"],
                                  "vapour_distillate_kmol_h": p2["V_vapour_distillate_mol_s"] / KMOL_H,
                                  "start": "the same perturbed engine profile"}
    return rec


def main():
    cases = {p.stem: json.loads(p.read_text()) for p in sorted(CASES.glob("*.json"))}
    out = {"_about": "Written by validation/python/reference_mesh_condenser.py (independent MESH reference, proposal 0026). "
                     "The cases: validation/data/columns/vapour-liquid/. Converged reference profiles are not validated against data.",
           "cases": {}}
    # H1: the vapour share given, then the temperature and the vapour flow of that solution
    c = cases["H1-alpha-vapour-liquid-condenser"]
    print(c["id"], flush=True)
    _, _, base = rm.solve_case(c)
    T1, V1 = base["stages"][0]["T_K"], base["V_vapour_distillate_mol_s"]
    two = c["specs"][:2]
    _, _, byT = solve(c, "vapour_liquid", two + [{"kind": "condenser_T_K", "value": T1}])
    _, _, byV = solve(c, "vapour_liquid", two + [{"kind": "vapour_flow_mol_s", "value": V1}])
    out["cases"][c["id"]] = {"vapour_share": base, "condenser_T_K": byT, "vapour_flow_mol_s": byV,
                             "given": {"condenser_T_K": T1, "vapour_flow_mol_s": V1}}
    # H2: the limits, and the top vapour's two-phase range for the refusal
    c = cases["H2-alpha-vapour-liquid-limits"]
    print(c["id"], flush=True)
    rec = {"limits": []}
    for lim in c["limits"]:
        _, _, vl = solve(c, "vapour_liquid", lim["specs"])
        _, _, other = solve(c, lim["against"]["condenser"], lim["against"]["specs"])
        rec["limits"].append({"name": lim["name"], "vapour_liquid": vl, lim["against"]["condenser"]: other})
    th = rm.thermo_of(c)
    _, _, p = solve(c, "vapour_liquid", c["refused"]["specs"][:2] + [{"kind": "vapour_share", "value": 0.2}])
    rec["top_vapour_at_share_0.2"] = {"y": p["stages"][1]["y"], **top_vapour_limits(th, p["stages"][1]["y"])}
    out["cases"][c["id"]] = rec
    # H3: the methanol column; H4 (proposal 0029, step 1; CHEPTA-Lab M6): the same column fed with Lab's converged
    # plant's column feed, which the engine reached only by way of a column at a vapour share
    for cid in ("H3-methanol-co2-pr-vapour-liquid", "H4-methanol-a6feed-pr-condenser-temperature"):
        c = cases[cid]
        print(c["id"], flush=True)
        out["cases"][c["id"]] = methanol_column(c)
    OUT.write_text(json.dumps(out, indent=1, default=float) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
