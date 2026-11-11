"""
Independent reference for the design specifications and the side draws of the rigorous column (proposal 0015, Part II,
step 11; milestone M4), for the cases of validation/data/columns/specifications/cases.json. It shares no code with the
JavaScript engine (src/units/columns/engine.js, specifications.js).

It extends the MESH reference of reference_mesh.py (its Column, its thermodynamics, its conventions) in two ways:

Side draws. A liquid draw U_j or a vapour draw W_j of a given rate leaves stage j with that stage's liquid or vapour
composition and enthalpy:

  M  L_{j-1} x_{j-1} + V_{j+1} y_{j+1} + F_j z - (L_j + U_j) x_j - (V_j + W_j) y_j = 0
  H  L_{j-1} h_L,{j-1} + V_{j+1} h_V,{j+1} + F_j h_F - (L_j + U_j) h_L,j - (V_j + W_j) h_V,j = 0

(The ChemSep Book, H. A. Kooijman and R. Taylor, 2nd edition, 2006, public domain,
http://www.chemsep.org/downloads/docs/book2.pdf, section 13.2.1, eqs. 13.1 to 13.3, p. 192, with r_L = U / L and
r_V = W / V; read 2026-11-11). L_j and V_j are the flows that go on to the next stage.

Design specifications. Here they are two of the equations of the Newton system itself, in place of the reflux ratio
and the product flow (the way DWSIM's Naphtali-Sandholm solver writes its specifications, in place of the condenser's
and the reboiler's energy balances; DWSIM.UnitOperations/UnitOperations/RigorousColumnSolvers/NewtonRaphson.vb, read
2026-11-11), with f the component flows of the product named (D x_D, B x_B, or U x_j / W y_j of a side draw):

  purity (mole)      f_i - value * sum(f) = 0
  purity (mass)      f_i M_i - value * sum(f_k M_k) = 0
  recovery           f_i - value * (feed of i) = 0
  component flow     f_i - value = 0
  stage temperature  T_j - value = 0

The engine instead keeps its ratios and flows as equations and finds them in an outer loop (specifications.js), so the
two reach the same column by different routes. The rate of a side draw given without one (case S8) is found here by a
bracketing root search (scipy's brentq) around columns of given rate, again another route than the engine's.

A stage temperature or a specification on a side draw involves a stage inside the column, so the Jacobian is taken
dense here (finite differences, one unknown at a time), not by reference_mesh.py's groups of columns. The start: the
same column with the case's start reflux ratio and distillate flow (reference_mesh.py's start and solver), then
Newton's method with the design specifications from that solution. Every scaled residual below 1e-12.

Writes validation/fixtures/column_specifications.json, which test/columns-specifications.test.js reads.
Regenerate: python validation/python/reference_mesh_specifications.py      (about two minutes; numpy, scipy, thermo, iapws)
"""
import json
from pathlib import Path

import numpy as np
from scipy.optimize import brentq

from reference_mesh import Column, thermo_of, H_SCALE, SOLVE_TOL
from reference_model import COMPONENTS

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / "validation" / "data" / "columns" / "specifications" / "cases.json"
OUT = ROOT / "validation" / "fixtures" / "column_specifications.json"
CLASSIC = ("reflux_ratio", "distillate_flow_mol_s", "bottoms_flow_mol_s")


class SpecColumn(Column):
    """reference_mesh.Column with side draws and with design specifications among its equations."""

    def __init__(self, th, nc, N, feeds, condenser, specs, draws=(), MW=None):
        super().__init__(th, nc, N, feeds, condenser, specs)
        assert not self.decanter
        self.draws = [(d["stage"] - 1, d.get("phase", "liquid"), float(d["rate_mol_s"])) for d in draws]
        self.U, self.W = np.zeros(N), np.zeros(N)
        for j, phase, rate in self.draws:
            (self.U if phase == "liquid" else self.W)[j] += rate
        self.MW = None if MW is None else np.asarray(MW, float)
        self.feed_i = sum(F * z for _, F, z, _, _ in self.feeds)

    def groups(self, u):
        x, T, L, V, Qc, Qr = self.unpack(u)
        N, nc, th = self.N, self.nc, self.th
        K = np.array([th.K(x[j], T[j]) for j in range(N)])
        y = K * x
        hL = np.array([th.hL(x[j], T[j]) for j in range(N)])
        hV = np.array([th.hV(y[j], T[j]) for j in range(N)])
        mat, summ, en = np.zeros((N, nc)), np.zeros((N, 2)), np.zeros(N)
        for j in range(N):
            m = np.zeros(nc); e = 0.0
            if j > 0:
                m += L[j - 1] * x[j - 1]; e += L[j - 1] * hL[j - 1]
            if j < N - 1:
                m += V[j + 1] * y[j + 1]; e += V[j + 1] * hV[j + 1]
            for fj, Ff, zf, hf, _ in self.feeds:
                if j == fj:
                    m += Ff * zf; e += Ff * hf
            if j == 0 and self.total:
                m -= (L[0] + V[0]) * x[0]; e -= (L[0] + V[0]) * hL[0] + Qc
            else:
                m -= (L[j] + self.U[j]) * x[j] + (V[j] + self.W[j]) * y[j]
                e -= (L[j] + self.U[j]) * hL[j] + (V[j] + self.W[j]) * hV[j]
                if j == 0:
                    e -= Qc
            if j == N - 1:
                e += Qr
            mat[j], en[j] = m, e
            summ[j] = [np.sum(x[j]) - 1, np.sum(y[j]) - 1]
        D, B = V[0], L[-1]
        xD = x[0] if self.total else y[0]
        sp = []
        for s in self.specs:
            k = s["kind"]
            if k == "reflux_ratio":
                sp.append(L[0] - s["value"] * D)
            elif k == "distillate_flow_mol_s":
                sp.append(D - s["value"])
            elif k == "bottoms_flow_mol_s":
                sp.append(B - s["value"])
            elif k == "stage_temperature":
                sp.append((T[s["stage"] - 1] - s["value"]) * self.F / 100)
            else:
                f = self.product(s, x, y, D, B, xD)
                i = s["component"]
                if k == "purity" and s.get("basis", "mole") == "mass":
                    sp.append((f[i] * self.MW[i] - s["value"] * np.sum(f * self.MW)) / np.mean(self.MW))
                elif k == "purity":
                    sp.append(f[i] - s["value"] * np.sum(f))
                elif k == "recovery":
                    sp.append(f[i] - s["value"] * self.feed_i[i])
                elif k == "component_flow":
                    sp.append(f[i] - s["value"])
                else:
                    raise ValueError(f"specification {k} is not in this reference")
        return mat, summ, en, np.array(sp), y

    def product(self, s, x, y, D, B, xD):
        """The component flows of the product a specification names."""
        if s["product"] == "distillate":
            return D * xD
        if s["product"] == "bottoms":
            return B * x[-1]
        j, phase, rate = self.draws[s.get("draw", 1) - 1]
        return rate * (x[j] if phase == "liquid" else y[j])

    def jacobian(self, u, r):
        """Dense, by finite differences: a specification may involve any stage."""
        J = np.zeros((len(r), len(u)))
        for k in range(len(u)):
            h = 1e-7 * max(1.0, abs(u[k]))
            uu = u.copy(); uu[k] += h
            J[:, k] = (self.residual(uu) - r) / h
        return J


def build(case, specs, draws):
    th = thermo_of(case)
    col, nc = case["column"], len(case["components"])
    f = col["feed"]
    feeds = [(f["stage"], f["flow_mol_s"], f["z"], th.feed_h(f), f.get("q", 1.0))]
    MW = [COMPONENTS[c]["MW"] for c in case["components"]] if case["thermo"]["kind"] == "chepta" else None
    index = lambda s: dict(s, component=case["components"].index(s["component"])) if "component" in s else s
    return SpecColumn(th, nc, col["stages"], feeds, col["condenser"], [index(s) for s in specs], draws, MW)


def solve_fixed(case, draws):
    """A column whose side draws all have a rate: first with the start's reflux ratio and distillate flow, then with
    the case's specifications from that solution."""
    start = [{"kind": "reflux_ratio", "value": case["start"]["reflux_ratio"]},
             {"kind": "distillate_flow_mol_s", "value": case["start"]["distillate_flow_mol_s"]}]
    c0 = build(case, start, draws)
    u0, _ = c0.solve(c0.start())
    c = build(case, case["specs"], draws)
    u, info = c.solve(u0)
    return c, u, info


def record(case, c, u, info):
    prof = c.profile(u, info)
    x, T, L, V, Qc, Qr = c.unpack(u)
    mat, summ, en, sp, y = c.groups(u)
    D, B = V[0], L[-1]
    xD = x[0] if c.total else y[0]
    feed = c.feed_i
    draws = [{"stage": j + 1, "phase": phase, "rate_mol_s": rate, "x": (x[j] if phase == "liquid" else y[j]).tolist(), "T_K": float(T[j])}
             for j, phase, rate in c.draws]
    out_i = D * xD + B * x[-1] + sum(d["rate_mol_s"] * np.array(d["x"]) for d in draws)
    prof.update({
        "reflux_ratio": float(L[0] / D), "boilup_ratio": float(V[-1] / B), "draws": draws,
        "recovery_in_distillate": (D * xD / feed).tolist(), "recovery_in_bottoms": (B * x[-1] / feed).tolist(),
        "overall_component_balance_mol_s": float(np.abs(feed - out_i).max()),
        "overall_energy_balance_W": float(sum(F * h for _, F, _, h, _ in c.feeds) + Qr - Qc - D * c.th.hL(xD, T[0]) * (1 if c.total else 0)
                                          - (D * c.th.hV(xD, T[0]) if not c.total else 0) - B * c.th.hL(x[-1], T[-1])
                                          - sum(d["rate_mol_s"] * (c.th.hL(np.array(d["x"]), d["T_K"]) if d["phase"] == "liquid" else c.th.hV(np.array(d["x"]), d["T_K"])) for d in draws)),
    })
    if c.MW is not None:
        mass = lambda f: (f * c.MW / np.sum(f * c.MW)).tolist()
        prof["w_D"], prof["w_B"] = mass(D * xD), mass(B * x[-1])
    assert prof["residuals"]["specifications_mol_s"] / c.F < 1e-10
    return prof


def main():
    doc = json.loads(CASES.read_text())
    out = {"_about": "Written by validation/python/reference_mesh_specifications.py (independent MESH reference with side draws and with "
                     "the design specifications among its equations). Regenerate: python validation/python/reference_mesh_specifications.py. "
                     "The cases: validation/data/columns/specifications/cases.json. Converged reference profiles are not validated against data.",
           "H_scale_J_mol": H_SCALE, "solve_tolerance": SOLVE_TOL, "cases": {}}
    for case in doc["cases"]:
        print(case["id"], flush=True)
        draws = case.get("draws", [])
        free = [k for k, d in enumerate(draws) if "rate_mol_s" not in d]
        if not free:
            c, u, info = solve_fixed(case, draws)
            rec = record(case, c, u, info)
        else:
            # one side draw without a rate, and one specification on it: Brent's method on the rate
            assert len(free) == 1
            k = free[0]
            on_draw = next(s for s in case["specs"] if s.get("product") == "side_draw")
            rest = [s for s in case["specs"] if s is not on_draw]
            assert all(s["kind"] in CLASSIC for s in rest) and on_draw["kind"] == "recovery"
            i = case["components"].index(on_draw["component"])

            def column(rate):
                ds = [dict(d, rate_mol_s=rate) if e == k else d for e, d in enumerate(draws)]
                c = build(dict(case, specs=rest), rest, ds)
                u, info = c.solve(c.start())
                return c, u, info

            def miss(rate):
                c, u, _ = column(rate)
                x, T, L, V, _, _ = c.unpack(u)
                j, phase, r = c.draws[k]
                comp = x[j] if phase == "liquid" else (c.th.K(x[j], T[j]) * x[j])
                return r * comp[i] / c.feed_i[i] - on_draw["value"]

            lo, hi = case["start"]["draw_rate_bracket_mol_s"]
            rate = brentq(miss, lo, hi, xtol=1e-13, rtol=1e-14)
            c, u, info = column(rate)
            rec = record(case, c, u, info)
            rec["found"] = {"draw": k + 1, "rate_mol_s": rate, "method": "Brent's method on the rate, columns of given rate", "miss": miss(rate)}
        out["cases"][case["id"]] = {"title": case["title"], "rigorous": rec}
    # the exact answer of S1: the two purities fix the distillate flow by the component balance
    s1 = next(c for c in doc["cases"] if c["id"] == "S1-binary-two-purities")
    xD, xB1 = s1["specs"][0]["value"], 1 - s1["specs"][1]["value"]
    F, z = s1["column"]["feed"]["flow_mol_s"], s1["column"]["feed"]["z"][0]
    out["cases"]["S1-binary-two-purities"]["checks"] = {"distillate_by_component_balance_mol_s": F * (z - xB1) / (xD - xB1)}
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
