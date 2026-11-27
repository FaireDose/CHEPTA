"""
Independent reference for the full set of column specifications (proposal 0029, steps 2-6; the maintainer's answers of
2026-11-26), for the cases of validation/data/columns/specifications/package-cases.json. It shares no code with the
JavaScript engine (src/units/columns/engine.js, specifications.js).

It extends the MESH reference of reference_mesh_specifications.py (SpecColumn: reference_mesh.py's Column with side
draws and the design specifications among its equations, a dense Jacobian) with, written from their definitions:

Specifications (rows of the Newton system, linear as in reference_mesh_specifications.py; the engine writes most as
logarithms: the same solution, another form):
  reflux_flow_mol_s     L_1 - value = 0
  distillate_to_feed    D - value F = 0                          (DWSIM's Feed_Recovery)
  component_ratio       f_i w_i - value f_k w_k = 0              (f the product's component flows; w the molar masses on
                                                                  the mass basis, 1 on the mole basis)
  flow_ratio            Fn - value Fd = 0                        (two of: reflux L_1, distillate D, bottoms B, boil-up
                                                                  V_N, feed F, a side draw's rate)
  stage_temperature     T_j - value = 0                          (as in reference_mesh_specifications.py)

Subcooling of a total condenser (subcooling_K = dT): the reflux and the distillate leave at T_1 - dT, T_1 the
condensate's bubble point (DWSIM's TotalCondenserSubcoolingDeltaT): their enthalpy h_L(x_1, T_1 - dT) in the
condenser's and stage 2's energy balances.

Stage duties (side heaters and coolers): Q_j added to stage j's energy balance.

A side draw by share s (draw "share"): U_j = s / (1 - s) L_j (or W_j = s / (1 - s) V_j), so that U_j = s (L_j + U_j).

A pumparound (from stage a, to stage b above it, rate R, a duty Q or a return temperature T_r): stage a loses R x_a
(and R h_L(x_a, T_a)); stage b gains R x_a and R h_L(x_a, T_a) + Q, or R h_L(x_a, T_r).

A side draw whose rate is found for a specification on it: Brent's method on the rate around columns of given rate
(scipy's brentq), as reference_mesh_specifications.py does for its case S8: another route than the engine's, which
makes the rate one more variable of its stage.

The start: the same column with the case's start reflux ratio and distillate flow, without its pumparounds and with
its draws by share at the start's fixed rate (reference_mesh.py's start and solver), then Newton's method with the
case's specifications from that solution; pumparounds brought up in steps (a quarter, a half, all) where the full
flow does not converge at once. Every scaled residual below 1e-10.

Writes validation/fixtures/column_spec_package.json, which test/columns-spec-package.test.js reads.
Regenerate: python validation/python/reference_mesh_package.py      (numpy, scipy)
"""
import json
from pathlib import Path

import numpy as np
from scipy.optimize import brentq

from reference_mesh import thermo_of, H_SCALE, SOLVE_TOL
from reference_mesh_specifications import SpecColumn
from reference_model import COMPONENTS

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / "validation" / "data" / "columns" / "specifications" / "package-cases.json"
OUT = ROOT / "validation" / "fixtures" / "column_spec_package.json"


class PackageColumn(SpecColumn):
    """SpecColumn with the specifications, subcooling, stage duties, draws by share and pumparounds of proposal 0029."""

    def __init__(self, th, nc, N, feeds, condenser, specs, draws=(), MW=None, subcooling=0.0, duties=(), pumparounds=(), pa_scale=1.0):
        fixed = [d for d in draws if "rate_mol_s" in d]
        super().__init__(th, nc, N, feeds, condenser, specs, fixed, MW)
        self.all_draws = list(draws)
        self.shareL, self.shareV = np.zeros(N), np.zeros(N)
        for d in draws:
            if "share" in d:
                (self.shareL if d.get("phase", "liquid") == "liquid" else self.shareV)[d["stage"] - 1] += d["share"] / (1 - d["share"])
        self.dT = float(subcooling)
        assert self.dT == 0 or (self.total and not self.decanter)
        self.Q = np.zeros(N)
        for q in duties:
            self.Q[q["stage"] - 1] += q["Q_W"]
        self.pas = [(p["from"] - 1, p["to"] - 1, p["rate_mol_s"] * pa_scale, p.get("Q_W"), p.get("return_T_K")) for p in pumparounds]
        self.pa_scale = pa_scale

    def draw_rate(self, d, L, V):
        j = d["stage"] - 1
        if "share" in d:
            return d["share"] / (1 - d["share"]) * (L[j] if d.get("phase", "liquid") == "liquid" else V[j])
        return d["rate_mol_s"]

    def groups(self, u):
        x, T, L, V, Qc, Qr = self.unpack(u)
        N, nc, th = self.N, self.nc, self.th
        K = np.array([th.K(x[j], T[j]) for j in range(N)])
        y = K * x
        hL = np.array([th.hL(x[j], T[j] - (self.dT if j == 0 else 0.0)) for j in range(N)])
        hV = np.array([th.hV(y[j], T[j]) for j in range(N)])
        U = self.U + self.shareL * L
        W = self.W + self.shareV * V
        Upa = np.zeros(N)
        for a, b, R, Q, Tr in self.pas:
            Upa[a] += R
        mat, summ, en = np.zeros((N, nc)), np.zeros((N, 2)), np.zeros(N)
        for j in range(N):
            m = np.zeros(nc); e = self.Q[j]
            if j > 0:
                m += L[j - 1] * x[j - 1]; e += L[j - 1] * hL[j - 1]
            if j < N - 1:
                m += V[j + 1] * y[j + 1]; e += V[j + 1] * hV[j + 1]
            for fj, Ff, zf, hf, _ in self.feeds:
                if j == fj:
                    m += Ff * zf; e += Ff * hf
            for a, b, R, Q, Tr in self.pas:
                if j == b:
                    m += R * x[a]
                    e += R * (th.hL(x[a], Tr) if Tr is not None else hL[a]) + (Q * self.pa_scale if Q is not None else 0.0)
            if j == 0 and self.total:
                m -= (L[0] + V[0]) * x[0]; e -= (L[0] + V[0]) * hL[0] + Qc
            else:
                m -= (L[j] + U[j] + Upa[j]) * x[j] + (V[j] + W[j]) * y[j]
                e -= (L[j] + U[j] + Upa[j]) * hL[j] + (V[j] + W[j]) * hV[j]
                if j == 0:
                    e -= Qc
            if j == N - 1:
                e += Qr
            mat[j], en[j] = m, e
            summ[j] = [np.sum(x[j]) - 1, np.sum(y[j]) - 1]
        D, B = V[0], L[-1]
        xD = x[0] if self.total else y[0]
        rates = [self.draw_rate(d, L, V) for d in self.all_draws]
        sp = []
        for s in self.specs:
            k = s["kind"]
            if k == "reflux_ratio":
                sp.append(L[0] - s["value"] * D)
            elif k == "distillate_flow_mol_s":
                sp.append(D - s["value"])
            elif k == "bottoms_flow_mol_s":
                sp.append(B - s["value"])
            elif k == "reflux_flow_mol_s":
                sp.append(L[0] - s["value"])
            elif k == "distillate_to_feed":
                sp.append(D - s["value"] * self.F)
            elif k == "stage_temperature":
                sp.append((T[s["stage"] - 1] - s["value"]) * self.F / 100)
            elif k == "flow_ratio":
                fl = lambda t: {"reflux": L[0], "distillate": D, "bottoms": B, "boilup": V[-1], "feed": self.F}.get(t["flow"]) if t["flow"] != "side_draw" else rates[t["draw"] - 1]
                sp.append(fl(s["numerator"]) - s["value"] * fl(s["denominator"]))
            else:
                f = self.product_flows(s, x, y, D, B, xD, rates)
                i = s["component"]
                if k == "component_ratio":
                    w = self.MW if s.get("basis", "mole") == "mass" else np.ones(nc)
                    sp.append(f[i] * w[i] - s["value"] * f[s["relative_to"]] * w[s["relative_to"]])
                elif k == "purity" and s.get("basis", "mole") == "mass":
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

    def product_flows(self, s, x, y, D, B, xD, rates):
        if s["product"] == "distillate":
            return D * xD
        if s["product"] == "bottoms":
            return B * x[-1]
        d = self.all_draws[s.get("draw", 1) - 1]
        j = d["stage"] - 1
        return rates[s.get("draw", 1) - 1] * (x[j] if d.get("phase", "liquid") == "liquid" else y[j])


def build(case, specs, draws=None, pumparounds=None, pa_scale=1.0):
    th = thermo_of(case)
    col, nc = case["column"], len(case["components"])
    f = col["feed"]
    feeds = [(f["stage"], f["flow_mol_s"], f["z"], th.feed_h(f), f.get("q", 1.0))]
    MW = [COMPONENTS[c]["MW"] for c in case["components"]] if case["thermo"]["kind"] == "chepta" else None
    def index(s):
        s = dict(s)
        for key in ("component", "relative_to"):
            if key in s:
                s[key] = case["components"].index(s[key])
        return s
    return PackageColumn(th, nc, col["stages"], feeds, col["condenser"], [index(s) for s in specs],
                         case.get("draws", []) if draws is None else draws, MW, case.get("subcooling_K", 0.0),
                         case.get("stage_duties", []), case.get("pumparounds", []) if pumparounds is None else pumparounds, pa_scale)


def start_draws(case):
    """The start's draws: a draw by share at the case's start rate, a draw whose rate is found at its start rate."""
    return [{k: v for k, v in d.items() if k != "share"} | ({"rate_mol_s": d["start_rate_mol_s"]} if "rate_mol_s" not in d else {})
            for d in case.get("draws", [])]


def solve_case(case, draws=None):
    st = case["start"]
    start = [{"kind": "reflux_ratio", "value": st["reflux_ratio"]}, {"kind": "distillate_flow_mol_s", "value": st["distillate_flow_mol_s"]}]
    c0 = build(case, start, start_draws(case), pumparounds=[])
    u, _ = c0.solve(c0.start())
    # the case's specifications, without the pumparounds first where it has them, then their flows in steps
    ds = case.get("draws", []) if draws is None else draws
    steps = [1.0] if not case.get("pumparounds") else [0.0, 0.25, 0.5, 1.0]
    for t in steps:
        c = build(case, case["specs"], ds, pumparounds=None if t > 0 else [], pa_scale=t if t > 0 else 1.0)
        u, info = c.solve(u)
    return c, u, info


def record(case, c, u, info):
    prof = c.profile(u, info)
    x, T, L, V, Qc, Qr = c.unpack(u)
    D, B = V[0], L[-1]
    rates = [c.draw_rate(d, L, V) for d in c.all_draws]
    prof.update({"reflux_ratio": float(L[0] / D), "boilup_ratio": float(V[-1] / B),
                 "draw_rates_mol_s": [float(r) for r in rates], "subcooled_T_K": float(T[0] - c.dT) if c.dT else None})
    if c.pas:
        prof["pumparounds"] = []
        for a, b, R, Q, Tr in c.pas:
            hd = c.th.hL(x[a], T[a])
            hr = c.th.hL(x[a], Tr) if Tr is not None else hd + Q / R
            prof["pumparounds"].append({"from": a + 1, "to": b + 1, "rate_mol_s": R, "duty_W": float(R * (hr - hd))})
    # the column's own balances: feed = products (+ draws); the energy with every duty
    feed = c.feed_i
    xD = x[0] if c.total else y_of(c, x, T)[0]
    out = D * xD + B * x[-1] + sum(r * (x[d["stage"] - 1] if d.get("phase", "liquid") == "liquid" else y_of(c, x, T)[d["stage"] - 1]) for r, d in zip(rates, c.all_draws))
    prof["overall_component_balance_mol_s"] = float(np.abs(feed - out).max())
    assert prof["residuals"]["specifications_mol_s"] / c.F < 1e-10
    return prof


def y_of(c, x, T):
    return np.array([c.th.K(x[j], T[j]) * x[j] for j in range(c.N)])


def main():
    doc = json.loads(CASES.read_text())
    out = {"_about": "Written by validation/python/reference_mesh_package.py (independent MESH reference, proposal 0029). "
                     "The cases: validation/data/columns/specifications/package-cases.json. Converged reference profiles are not validated against data.",
           "H_scale_J_mol": H_SCALE, "solve_tolerance": SOLVE_TOL, "cases": {}}
    for case in doc["cases"]:
        print(case["id"], flush=True)
        free = [k for k, d in enumerate(case.get("draws", [])) if "rate_mol_s" not in d and "share" not in d]
        if not free:
            c, u, info = solve_case(case)
        else:
            # one draw whose rate is found, for the one specification on it: Brent's method on the rate
            assert len(free) == 1
            k = free[0]
            on = next(s for s in case["specs"] if s.get("product") == "side_draw" and s.get("draw", 1) == k + 1)
            rest = [s for s in case["specs"] if s is not on]
            assert on["kind"] == "purity" and on.get("basis", "mole") == "mole"
            i = case["components"].index(on["component"])

            def column(rate):
                ds = [dict(d, rate_mol_s=rate) if j == k else d for j, d in enumerate(case["draws"])]
                cc, uu, ii = solve_case(dict(case, specs=rest, draws=ds), ds)
                x, T, L, V, _, _ = cc.unpack(uu)
                d = ds[k]
                comp = x[d["stage"] - 1] if d.get("phase", "liquid") == "liquid" else y_of(cc, x, T)[d["stage"] - 1]
                return comp[i] - on["value"], (cc, uu, ii)
            lo, hi = case["bracket_mol_s"]
            rate = brentq(lambda r: column(r)[0], lo, hi, xtol=1e-12, rtol=1e-14)
            _, (c, u, info) = column(rate)
            info = dict(info, found_rate_mol_s=rate, how="brentq on the draw's rate around columns of given rate")
        out["cases"][case["id"]] = {"title": case["title"], "rigorous": record(case, c, u, info)}
    OUT.write_text(json.dumps(out, indent=1, default=float) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
