"""
Independent reference for two liquids on the stages of a column (proposal 0015, Part I, section 3; milestone M2b,
W2's task): the MESH equations of reference_mesh.py (the independent column reference of W7) with thermodynamics that
let a stage hold a vapour and two liquids. Written by W2 because W7's M2b reference was not on the main branch when
this task was done (2026-10-30); it shares no code with the JavaScript engine (src/units/columns/).

A stage's two liquids leave it together, so its MESH equations are those of one liquid written for the stage's whole
liquid x (reference_mesh.Column, unchanged), with:
  - the liquids at the stage's T: the whole liquid's stability by the tangent-plane distance (Michelsen's stationary
    points from a near-pure start in each component, iterated here to 1e-13); where it is not stable, the two liquids
    x', x'' of equal activities, x_i' gamma_i(x') = x_i'' gamma_i(x''), with x = (1 - beta) x' + beta x'' (solved by
    scipy.optimize.root on ln K_i = ln(x_i''/x_i'), beta from the Rachford-Rice equation by brentq);
  - K_i = gamma_i(x') p_i^sat / P * x_i' / x_i (the vapour in equilibrium with both liquids), and the liquid's molar
    enthalpy (1 - beta) h_L(x') + beta h_L(x'') with reference_enthalpy.liquid_h.
With one liquid these are reference_mesh's equations exactly.

A decanter on the condenser (condenser "decanter"): the condensate of stage 1 splits into two liquids at its bubble
point; one of them (the reflux) returns to stage 2 entirely, the other is the distillate. Unknowns of stage 1: the
reflux's x and the distillate's x_D, T, the reflux flow L_1 and the distillate flow D; equations: the component
balances, the two liquids of equal activities (x_i gamma_i(x) = x_D,i gamma_i(x_D)), the summations and the bubble point
of the reflux (sum K_i x_i = 1). The condenser's energy balance gives its duty; the column then takes one specification.

The cases: F1 (validation/data/columns/F1-butanol-water-two-liquids.json, W7's) solved with two liquids; a ternary
column of 1-butanol, water and methanol whose upper stages hold one liquid and lower stages two (W2's case, written
below); and F1's column with a decanter, the butanol-rich liquid refluxed (W2's case). Writes
validation/fixtures/columns-vll.json, which test/columns-vll.test.js reads.
Regenerate: python validation/python/reference_mesh_vll.py      (numpy, scipy, thermo)
"""
import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import brentq, root

from reference_mesh import Activity, Column, H_SCALE, SOLVE_TOL, bubble_T, column_of
from reference_enthalpy import liquid_h

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "validation" / "fixtures" / "columns-vll.json"


def rachford_rice(z, K):
    f = lambda b: float(np.sum(z * (K - 1) / (1 + b * (K - 1))))
    lo, hi = 1 / (1 - K.max()) + 1e-14, 1 / (1 - K.min()) - 1e-14
    return brentq(f, lo, hi, xtol=1e-15)


class TwoLiquids(Activity):
    """NRTL or UNIQUAC with an ideal-gas vapour, a stage's liquid split into two where it is not stable."""

    def __init__(self, ids, P, model="NRTL"):
        super().__init__(ids, P, model)
        self.splits = {}

    def lng(self, x, T):
        return np.log(self.s.gamma(x, T))

    def tpd(self, x, T):
        """The smallest stationary tm = 1 - sum W of the tangent-plane distance and its trial phase."""
        n = len(x)
        d = np.log(x) + self.lng(x, T)
        best = (0.0, None)
        for k in range(n):
            W = np.full(n, 1e-3 * 0.02); W[k] = 0.98
            for _ in range(5000):
                w = W / W.sum()
                Wn = np.exp(d - self.lng(w, T))
                done = np.max(np.abs(np.log(Wn / W))) < 1e-13
                W = Wn
                if done:
                    break
            w = W / W.sum()
            if np.sum(np.log(w / x) ** 2) < 1e-6:
                continue            # the trivial stationary point
            tm = 1 - W.sum()
            if tm < best[0]:
                best = (tm, w)
        return best

    def split(self, x, T):
        """None (one liquid) or (beta, x', x'')."""
        x = np.asarray(x, float)
        key = (T, *x)
        if key in self.splits:
            return self.splits[key]
        tm, w = self.tpd(x, T)
        out = None
        if tm < -1e-9:
            def F(u):
                K = np.exp(u)
                b = rachford_rice(x, K)
                x1 = x / (1 + b * (K - 1)); x2 = K * x1
                return u - (self.lng(x1 / x1.sum(), T) - self.lng(x2 / x2.sum(), T))
            starts = [np.log(w / x)] + [np.log(np.where(np.arange(len(x)) == k, 0.98, 0.02 * x) / x) for k in range(len(x))]
            for u0 in starts:
                # successive substitution on ln K, then scipy's root to polish
                u = u0
                try:
                    for _ in range(3000):
                        un = u - F(u)
                        done = np.max(np.abs(un - u)) < 1e-12
                        u = un
                        if done or np.max(np.abs(u)) < 1e-5:
                            break
                    if np.max(np.abs(u)) < 1e-4:
                        continue
                    sol = root(F, u, method="hybr", options={"xtol": 1e-15})
                    u = sol.x if np.max(np.abs(F(sol.x))) < np.max(np.abs(F(u))) else u
                except (ValueError, FloatingPointError):
                    continue
                if np.max(np.abs(F(u))) > 1e-12 or np.max(np.abs(u)) < 1e-4:
                    continue
                K = np.exp(u)
                b = rachford_rice(x, K)
                if 0 < b < 1:
                    x1 = x / (1 + b * (K - 1)); x2 = K * x1
                    out = (b, x1 / x1.sum(), x2 / x2.sum())
                    break
            if out is None:
                raise RuntimeError(f"the liquid {x} at {T} K is not stable but no split was found")
        self.splits[key] = out
        return out

    def K(self, x, T):
        x = np.clip(np.asarray(x, float), 1e-300, None); x = x / x.sum()
        s = self.split(x, T)
        if s is None:
            return super().K(x, T)
        return super().K(s[1], T) * s[1] / x

    def hL(self, x, T):
        x = np.clip(np.asarray(x, float), 1e-300, None); x = x / x.sum()
        s = self.split(x, T)
        h = lambda v: liquid_h(self.s, v, T, "ideal")[0]
        return h(x) if s is None else (1 - s[0]) * h(s[1]) + s[0] * h(s[2])

    def bubble_T(self, x):
        # stepped out from the bubble point of the one (perhaps metastable) liquid
        f = lambda T: float(np.sum(self.K(x, T) * x)) - 1
        T0 = brentq(lambda T: float(np.sum(Activity.K(self, x, T) * x)) - 1, 200.0, 700.0, xtol=1e-13)
        lo, hi = T0, T0
        while f(lo) > 0:
            lo -= 2.0
        while f(hi) < 0:
            hi += 2.0
        return brentq(f, lo, hi, xtol=1e-13)

    def lnfug_liquid(self, x, T):
        return np.log(x) + self.lng(x, T)


class DecanterColumn(Column):
    """reference_mesh.Column with a decanter on the condenser: the unknowns of stage 1 are the reflux's x, T, L_1 and
    the distillate flow D (the V slot), and the distillate's composition x_D is added at the end."""

    def __init__(self, th, nc, N, feeds, specs):
        super().__init__(th, nc, N, feeds, "total", specs)

    def unpack(self, u):
        x, T, L, V, Qc, Qr = Column.unpack(self, u[:-self.nc])
        return x, T, L, V, Qc, Qr

    def xD(self, u):
        return u[-self.nc:]

    def groups(self, u):
        x, T, L, V, Qc, Qr = self.unpack(u)
        xD = self.xD(u)
        N, nc, th = self.N, self.nc, self.th
        K = np.array([th.K(x[j], T[j]) for j in range(N)])
        y = K * x
        hL = np.array([th.hL(x[j], T[j]) for j in range(N)])
        hV = np.array([th.hV(y[j], T[j]) for j in range(N)])
        hD = th.hL(xD, T[0])
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
            if j == 0:
                m -= L[0] * x[0] + V[0] * xD; e -= L[0] * hL[0] + V[0] * hD + Qc
            else:
                m -= L[j] * x[j] + V[j] * y[j]; e -= L[j] * hL[j] + V[j] * hV[j]
            if j == N - 1:
                e += Qr
            mat[j], en[j] = m, e
            summ[j] = [np.sum(x[j]) - 1, np.sum(y[j]) - 1]
        # the decanter: the reflux and the distillate of equal activities, x_D summing to 1 (the reflux's bubble point
        # is summ[0][1]: sum K x = 1)
        act = np.log(x[0]) + th.lng(x[0], T[0]) - np.log(xD) - th.lng(xD, T[0])
        sp = [np.sum(xD) - 1, *act]
        for s in self.specs:
            if s["kind"] == "distillate_flow_mol_s":
                sp.append(V[0] - s["value"])
            elif s["kind"] == "bottoms_flow_mol_s":
                sp.append(L[-1] - s["value"])
            elif s["kind"] == "boilup_ratio":
                sp.append(V[-1] - s["value"] * L[-1])
            else:
                raise ValueError(f"specification {s['kind']} is not in this reference's decanter")
        return mat, summ, en, np.array(sp) * self.F, y

    def residual(self, u):
        mat, summ, en, sp, _ = self.groups(u)
        # the condenser duty is free: its energy balance gives it (Qc an unknown); the extra unknowns x_D (nc) are
        # matched by the decanter's equations
        return np.concatenate([(mat / self.F).ravel(), summ.ravel(), en / (self.F * H_SCALE), sp / self.F])

    def jacobian(self, u, r):
        J = np.zeros((len(r), len(u)))
        for k in range(len(u)):
            h = 1e-7 * max(1.0, abs(u[k]))
            uu = u.copy(); uu[k] += h
            J[:, k] = (self.residual(uu) - r) / h
        return J

    def start_from(self, total_u, reflux_light):
        """From the solution of the same column with a total condenser: the condensate split at its bubble point, the
        chosen liquid as the reflux."""
        x, T, L, V, Qc, Qr = Column.unpack(self, total_u)
        C = L[0] + V[0]
        b, x1, x2 = self.th.split(x[0], T[0])
        rho = [density(self.th, v, T[0]) for v in (x1, x2)]
        light, heavy = ((1 - b, x1), (b, x2)) if rho[0] <= rho[1] else ((b, x2), (1 - b, x1))
        (fr, xr), (fd, xd) = (light, heavy) if reflux_light else (heavy, light)
        x = x.copy(); x[0] = xr
        L = L.copy(); V = V.copy(); L[0], V[0] = fr * C, fd * C
        return np.concatenate([Column.pack(self, x, T, L, V, Qc, Qr), xd])


def density(th, x, T):
    """kg/m3 of a liquid from the components' liquid-density records (components.json, kg/m3; DIPPR 100 or 105 as
    the DIPPR forms define them) mixed ideally (the volumes add); only to name the two liquids light and heavy."""
    vol = mass = 0.0
    for xi, c in zip(x, th.s.c):
        r = c["properties"]["liquidDensity"]
        k = r["coefficients"]
        if r["equation"] == "DIPPR105":
            rho = k["A"] / k["B"] ** (1 + (1 - T / k["C"]) ** k["D"])
        elif r["equation"] == "DIPPR100":
            rho = k["A"] + k["B"] * T + k["C"] * T ** 2 + k["D"] * T ** 3 + k["E"] * T ** 4
        else:
            raise ValueError(r["equation"])
        mass += xi * c["MW"]; vol += xi * c["MW"] / rho
    return mass / vol


def profile_vll(c, u, info, decanter=False):
    prof = c.profile(u, info) if not decanter else None
    x, T, L, V, Qc, Qr = c.unpack(u)
    if decanter:
        mat, summ, en, sp, y = c.groups(u)
        stages = [{"stage": j + 1, "T_K": T[j], "L_mol_s": L[j], "V_mol_s": 0.0 if j == 0 else V[j], "x": x[j].tolist(),
                   "y": None if j == 0 else y[j].tolist()} for j in range(c.N)]
        prof = {"stages": stages, "D_mol_s": V[0], "B_mol_s": L[-1], "x_D": c.xD(u).tolist(), "x_B": x[-1].tolist(),
                "Q_condenser_W": Qc, "Q_reboiler_W": Qr, "solver": info,
                "residuals": {"material_mol_s": float(np.abs(mat).max()), "summation": float(np.abs(summ).max()),
                              "energy_W": float(np.abs(en[1:]).max()), "decanter_and_specifications": float(np.abs(sp).max())}}
    for j, s in enumerate(prof["stages"]):
        sp = c.th.split(np.asarray(s["x"]), s["T_K"])
        if sp is None or not (1e-9 < sp[0] < 1 - 1e-9):
            s["liquids"] = None
            continue
        b, x1, x2 = sp
        a = {"x": x1.tolist(), "flow_mol_s": (1 - b) * s["L_mol_s"], "rho_kg_m3": density(c.th, x1, s["T_K"])}
        bb = {"x": x2.tolist(), "flow_mol_s": b * s["L_mol_s"], "rho_kg_m3": density(c.th, x2, s["T_K"])}
        light, heavy = (a, bb) if a["rho_kg_m3"] <= bb["rho_kg_m3"] else (bb, a)
        s["liquids"] = {"light": light, "heavy": heavy}
    return prof


def solve(c, u0):
    u, info = c.solve(u0)
    return u, info


TERNARY = {
    "id": "W2-VLL-butanol-water-methanol",
    "title": "1-Butanol + water + methanol, NRTL, 10 stages: one liquid on stages 1 and 2, two liquids below",
    "method_choice": "docs/METHOD_SELECTION.md: polar, below 10 bar, two liquids possible: NRTL with the default sets "
                     "(1-butanol + water ChemSep, the others as in src/data/binaries.json), ideal-gas vapour",
    "components": ["1-butanol", "water", "methanol"], "pressure_kPa": 101.325,
    "thermo": {"kind": "chepta", "model": "NRTL", "vapour": "ideal", "sets": "default"},
    "column": {"configuration": "distillation", "stages": 10, "condenser": "total", "reboiler": "partial",
               "feed": {"stage": 4, "flow_mol_s": 100.0, "z": [0.3, 0.6, 0.1], "q": 1}},
    "specs": [{"kind": "reflux_ratio", "value": 2.0}, {"kind": "distillate_flow_mol_s", "value": 25.0}],
}
DECANTER = {
    "id": "W2-VLL-butanol-water-decanter",
    "title": "1-Butanol + water, NRTL, F1's column with a decanter: the butanol-rich liquid refluxed, the water-rich one the distillate",
    "components": ["1-butanol", "water"], "pressure_kPa": 101.325,
    "thermo": {"kind": "chepta", "model": "NRTL", "vapour": "ideal", "sets": "default"},
    "column": {"configuration": "distillation", "stages": 6, "condenser": "decanter", "reflux_liquid": "light",
               "reboiler": "partial", "feed": {"stage": 3, "flow_mol_s": 100.0, "z": [0.6, 0.4], "q": 1}},
    "specs": [{"kind": "distillate_flow_mol_s", "value": 35.0}],
}


def main():
    f1 = json.loads((ROOT / "validation" / "data" / "columns" / "F1-butanol-water-two-liquids.json").read_text())
    out = {"_about": "Written by validation/python/reference_mesh_vll.py (W2's independent reference for two liquids on "
                     "the stages, on reference_mesh.py's MESH equations). Converged reference profiles are not validated "
                     "against data.", "H_scale_J_mol": H_SCALE, "cases": {}}
    for case in (f1, TERNARY):
        print(case["id"], flush=True)
        th = TwoLiquids(case["components"], case["pressure_kPa"], case["thermo"]["model"])
        c = column_of(case, th=th)
        u, info = c.solve(c.start())
        out["cases"][case["id"]] = {"title": case["title"], "phases": "VLL", "case": case if case is TERNARY else "validation/data/columns/F1-butanol-water-two-liquids.json",
                                    "rigorous": profile_vll(c, u, info)}
        if case is f1:
            f1_u = u
    print(DECANTER["id"], flush=True)
    th = TwoLiquids(DECANTER["components"], DECANTER["pressure_kPa"])
    base = column_of(f1, th=th)
    c = DecanterColumn(th, 2, 6, base.feeds and [(f + 1, F, z, h, q) for f, F, z, h, q in base.feeds], DECANTER["specs"])
    u, info = c.solve(c.start_from(f1_u, True))
    out["cases"][DECANTER["id"]] = {"title": DECANTER["title"], "phases": "VLL", "case": DECANTER, "rigorous": profile_vll(c, u, info, decanter=True)}
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
