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

With --three-phase (proposal 0024, test 3): the cases F3, F4 and F5 on ChemSep's full three-phase stage (class
ThreePhaseColumn below), written to validation/fixtures/columns-vll-three-phase.json, which test/columns-vll.test.js and
test/columns-heteroazeotropic.test.js read. First: node validation/columns_vll_engine_starts.mjs (the starts of F4, F5).
"""
import json
import math
import time
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


# ---------------------------------------------------------------------------------------------------------------------
# The full three-phase stage (proposal 0024, test 3): The ChemSep Book (H. A. Kooijman, R. Taylor, 2nd ed., 2006, public
# domain, http://www.chemsep.org/downloads/docs/book2.pdf), section 13.7.1, eqs. 13.35-13.44, pp. 227-228: on a stage
# with two liquids both liquid flows L'_j, L''_j and compositions x'_j, x''_j are unknowns, with the component balances
# (13.36), the vapour in equilibrium with each liquid, K'_ij x'_ij = y_ij and K''_ij x''_ij = y_ij (13.37-13.38; the
# liquid-liquid equilibrium 13.39 follows), the three summations (13.41-13.43) and the energy balance (13.44): 3c + 4
# equations and unknowns per stage, against 2c + 3 on a stage with one liquid. Both liquids of a stage flow to the stage
# below. Which stages hold two liquids is given (the book's point 2: it is not known before the solution); it is taken
# from the converged column of the mixed K-value reference above and confirmed after the solution by this reference's
# own tangent-plane test on every one-liquid stage and by L''_j > 0 on every two-liquid stage. This formulation shares
# no equation with the mixed K-value form of the column engine (src/units/columns/two-liquids.js) or with the smooth
# stage of proposal 0024: it is the independent check of both.

class ThreePhaseColumn:
    """A distillation column (total condenser or decanter, partial reboiler) on ChemSep's three-phase stage."""

    def __init__(self, th, nc, N, feeds, condenser, specs, two, reflux_liquid="light"):
        self.th, self.nc, self.N = th, nc, N
        self.feeds = [(f - 1, F, np.asarray(z, float), h) for f, F, z, h, _ in feeds]
        self.F = sum(F for _, F, _, _ in self.feeds)
        self.decanter = condenser == "decanter"
        assert condenser in ("total", "decanter")
        self.specs, self.two, self.reflux_liquid = specs, set(two), reflux_liquid
        # the layout of the unknowns, stage by stage
        c = nc
        self.slots, k = [], 0
        for j in range(N):
            if j == 0:
                # the decanter: reflux x1 (flow L1) and distillate x2 (flow D); a total condenser whose condensate splits:
                # its two liquids x1, x2 (flows L1, L2 in the condensate), of which D leaves, the rest refluxed
                names = (["x1", "x2", "T", "L1", "D", "Q"] if self.decanter else ["x1", "x2", "T", "L1", "L2", "D", "Q"] if 0 in self.two
                         else ["x1", "T", "L1", "D", "Q"])
            elif j in self.two:
                names = ["x1", "x2", "y", "L1", "L2", "V", "T"]
            else:
                names = ["x1", "y", "L1", "V", "T"]
            if j == N - 1:
                names = names + ["Q"]
            sl = {}
            for nm in names:
                w = c if nm in ("x1", "x2", "y") else 1
                sl[nm] = slice(k, k + w)
                k += w
            self.slots.append(sl)
        self.n = k

    def K1(self, x, T):
        return Activity.K(self.th, x, T)

    def h(self, x, T):
        return liquid_h(self.th.s, x, T, "ideal")[0]

    def stage(self, u, j):
        """The stage's state: a dict of its unknowns, scaled back (T in K, flows in mol/s, duties in W)."""
        sl, F = self.slots[j], self.F
        g = lambda nm: u[sl[nm]] if nm in sl else None
        st = {nm: (u[v] if v.stop - v.start > 1 else u[v][0]) for nm, v in sl.items()}
        st["T"] = st["T"] * 100
        for nm in ("L1", "L2", "V", "D"):
            if nm in st:
                st[nm] = st[nm] * F
        if "Q" in st:
            st["Q"] = st["Q"] * F * H_SCALE
        return st

    def liquids_out(self, st):
        """(flow, x) of each liquid that leaves stage j for the stage below."""
        out = [(st["L1"], st["x1"])]
        if "L2" in st:
            out.append((st["L2"], st["x2"]))
        return out

    def residual(self, u):
        N, nc, F, th = self.N, self.nc, self.F, self.th
        S = [self.stage(u, j) for j in range(N)]
        hV = [None] + [th.hV(S[j]["y"], S[j]["T"]) for j in range(1, N)]
        r = []
        for j in range(N):
            st, T = S[j], S[j]["T"]
            m, e = np.zeros(nc), 0.0
            if j > 0:
                above = S[j - 1]
                if j == 1 and "L2" in above:                # the reflux: the condensate's two liquids less the distillate
                    f = (above["L1"] + above["L2"] - above["D"]) / (above["L1"] + above["L2"])
                    for Lk, xk in self.liquids_out(above):
                        m += f * Lk * xk; e += f * Lk * self.h(xk, above["T"])
                elif j == 1:                                # the reflux: the condenser's liquid L1 (of x1)
                    m += above["L1"] * above["x1"]; e += above["L1"] * self.h(above["x1"], above["T"])
                else:
                    for Lk, xk in self.liquids_out(above):
                        m += Lk * xk; e += Lk * self.h(xk, above["T"])
            if j < N - 1:
                m += S[j + 1]["V"] * S[j + 1]["y"]; e += S[j + 1]["V"] * hV[j + 1]
            for fj, Ff, zf, hf in self.feeds:
                if fj == j:
                    m += Ff * zf; e += Ff * hf
            if j == 0:
                if self.decanter:                           # reflux x1, distillate x2 (13.36 for the decanter)
                    m -= st["L1"] * st["x1"] + st["D"] * st["x2"]
                    e -= st["L1"] * self.h(st["x1"], T) + st["D"] * self.h(st["x2"], T) + st["Q"]
                    act = np.log(st["x1"]) + th.lng(st["x1"], T) - np.log(st["x2"]) - th.lng(st["x2"], T)
                    r += list(m / F) + list(act) + [np.sum(st["x1"]) - 1, np.sum(st["x2"]) - 1,
                                                     float(np.sum(self.K1(st["x1"], T) * st["x1"])) - 1, e / (F * H_SCALE)]
                elif "L2" in st:                            # the condensate's two liquids: equal activities, the bubble point
                    m -= st["L1"] * st["x1"] + st["L2"] * st["x2"]
                    e -= st["L1"] * self.h(st["x1"], T) + st["L2"] * self.h(st["x2"], T) + st["Q"]
                    act = np.log(st["x1"]) + th.lng(st["x1"], T) - np.log(st["x2"]) - th.lng(st["x2"], T)
                    r += list(m / F) + list(act) + [np.sum(st["x1"]) - 1, np.sum(st["x2"]) - 1,
                                                     float(np.sum(self.K1(st["x1"], T) * st["x1"])) - 1, e / (F * H_SCALE)]
                else:
                    m -= (st["L1"] + st["D"]) * st["x1"]
                    e -= (st["L1"] + st["D"]) * self.h(st["x1"], T) + st["Q"]
                    r += list(m / F) + [np.sum(st["x1"]) - 1, float(np.sum(self.K1(st["x1"], T) * st["x1"])) - 1, e / (F * H_SCALE)]
                continue
            for Lk, xk in self.liquids_out(st):
                m -= Lk * xk; e -= Lk * self.h(xk, T)
            m -= st["V"] * st["y"]; e -= st["V"] * hV[j]
            if j == N - 1:
                e += st["Q"]
            r += list(m / F)                                                         # 13.36
            r += list(self.K1(st["x1"], T) * st["x1"] - st["y"])                     # 13.37
            if "x2" in st:
                r += list(self.K1(st["x2"], T) * st["x2"] - st["y"])                 # 13.38
            r += [np.sum(st["y"]) - 1, np.sum(st["x1"]) - 1]                          # 13.41, 13.42
            if "x2" in st:
                r.append(np.sum(st["x2"]) - 1)                                       # 13.43
            r.append(e / (F * H_SCALE))                                              # 13.44
        D = S[0]["D"]
        B = sum(Lk for Lk, _ in self.liquids_out(S[-1]))
        for sp in self.specs:
            if sp["kind"] == "reflux_ratio":
                reflux = S[0]["L1"] + S[0]["L2"] - D if "L2" in S[0] else S[0]["L1"]
                r.append((reflux - sp["value"] * D) / F)
            elif sp["kind"] == "distillate_flow_mol_s":
                r.append((D - sp["value"]) / F)
            elif sp["kind"] == "bottoms_flow_mol_s":
                r.append((B - sp["value"]) / F)
            else:
                raise ValueError(f"specification {sp['kind']} is not in the three-phase reference")
        r = np.array(r, float)
        assert len(r) == self.n, (len(r), self.n)
        return r

    def rows(self):
        """The residual rows of each stage (the specifications' rows at the end belong to the condenser and the
        reboiler)."""
        out, k, c = [], 0, self.nc
        for j in range(self.N):
            if j == 0:
                w = (2 * c + 4) if (self.decanter or 0 in self.two) else (c + 3)
            else:
                w = 2 * c + 3 + ((c + 1) if j in self.two else 0)
            out.append(np.arange(k, k + w)); k += w
        return out, np.arange(k, self.n)

    def jacobian(self, u):
        """Central differences. A stage's residuals depend on its own unknowns and its neighbours' only, so the
        unknowns of stages three apart (2 to N - 1) are perturbed together; the condenser's and the reboiler's alone
        (the specifications' rows hold both)."""
        J = np.zeros((self.n, self.n))
        rows, spec_rows = self.rows()
        groups = [[0], [self.N - 1]] + [[j for j in range(1, self.N - 1) if j % 3 == m] for m in range(3)]
        for g in groups:
            for q in range(max(sum(v.stop - v.start for v in self.slots[j].values()) for j in g)):
                cols = []
                for j in g:
                    start = min(v.start for v in self.slots[j].values())
                    if q < sum(v.stop - v.start for v in self.slots[j].values()):
                        cols.append((j, start + q))
                if not cols:
                    continue
                up, um = u.copy(), u.copy()
                hs = {}
                for j, k in cols:
                    hs[k] = 1e-7 * max(1.0, abs(u[k])); up[k] += hs[k]; um[k] -= hs[k]
                d = self.residual(up) - self.residual(um)
                for j, k in cols:
                    for jj in (j - 1, j, j + 1):
                        if 0 <= jj < self.N:
                            J[rows[jj], k] = d[rows[jj]] / (2 * hs[k])
                    if j in (0, self.N - 1) and len(cols) == 1:
                        J[spec_rows, k] = d[spec_rows] / (2 * hs[k])
        return J

    def pack(self, stages):
        """From a list of per-stage dicts (T in K, flows in mol/s, Q in W) to the scaled unknowns."""
        u = np.zeros(self.n)
        for j, st in enumerate(stages):
            for nm, v in self.slots[j].items():
                val = st[nm]
                if nm == "T":
                    val = val / 100
                elif nm in ("L1", "L2", "V", "D"):
                    val = val / self.F
                elif nm == "Q":
                    val = val / (self.F * H_SCALE)
                u[v] = val
        return u

    def solve(self, u0):
        t0 = time.time()
        u = u0.copy()
        f = self.residual(u)
        steps = 0
        for steps in range(1, 80):
            nf = np.max(np.abs(f))
            if nf < 1e-13:
                break
            J = self.jacobian(u)
            du = np.linalg.solve(J, -f)
            lam = 1.0
            while lam > 1e-6:
                w = u + lam * du
                ok = all(np.all(w[sl[nm]] > 0) for sl in self.slots for nm in ("x1", "x2", "y", "L1", "L2", "V", "D") if nm in sl)
                if ok:
                    fw = self.residual(w)
                    if np.max(np.abs(fw)) < nf:
                        break
                lam /= 2
            else:
                raise RuntimeError(f"the three-phase reference stopped at a scaled residual of {nf:.3g}")
            u, f = w, fw
        res = float(np.max(np.abs(self.residual(u))))
        if not res < 1e-10:
            raise RuntimeError(f"the three-phase reference did not converge: scaled residual {res:.3g}")
        return u, {"solver": "Newton (central-difference Jacobian)", "newton_steps": steps, "scaled_residual": res, "seconds": round(time.time() - t0, 1)}

    def check(self, u):
        """The stages' phases confirmed: L'' > 0 and x' apart from x'' on every two-liquid stage, and the liquid of every
        one-liquid stage stable by this reference's tangent-plane test."""
        out = []
        for j in range(0 if not self.decanter else 1, self.N):
            st = self.stage(u, j)
            if j == 0 and j not in self.two:
                continue
            if j in self.two:
                assert st["L2"] > 0 and np.max(np.abs(st["x1"] - st["x2"])) > 1e-4, f"stage {j + 1}: the second liquid vanished"
            else:
                tm, _ = self.th.tpd(st["x1"], st["T"])
                assert not tm < -1e-9, f"stage {j + 1}: one liquid, but not stable (tm {tm:.3g})"
                out.append(j + 1)
        return {"two_liquid_stages": sorted(j + 1 for j in self.two), "one_liquid_stages_stable": out}

    def profile(self, u, info):
        stages = []
        for j in range(self.N):
            st = self.stage(u, j)
            L = st["L1"] + st.get("L2", 0.0)
            x = (st["L1"] * st["x1"] + st.get("L2", 0.0) * (st["x2"] if "L2" in st else 0)) / L
            if j == 0 and "L2" in st:
                L = L - st["D"]                             # the profile's L of a total condenser: the reflux
            row = {"stage": j + 1, "T_K": st["T"], "L_mol_s": L, "V_mol_s": 0.0 if j == 0 else st["V"], "x": x.tolist(),
                   "y": None if j == 0 else st["y"].tolist()}
            if j > 0 and "L2" in st:
                a = {"x": st["x1"].tolist(), "flow_mol_s": st["L1"], "rho_kg_m3": density(self.th, st["x1"], st["T"])}
                b = {"x": st["x2"].tolist(), "flow_mol_s": st["L2"], "rho_kg_m3": density(self.th, st["x2"], st["T"])}
                light, heavy = (a, b) if a["rho_kg_m3"] <= b["rho_kg_m3"] else (b, a)
                row["liquids"] = {"light": light, "heavy": heavy}
            elif j > 0:
                row["liquids"] = None
            if j == 0 and self.decanter:
                row["x"] = st["x1"].tolist(); row["x_distillate"] = st["x2"].tolist()
            stages.append(row)
        S0, SN = self.stage(u, 0), self.stage(u, self.N - 1)
        return {"stages": stages, "D_mol_s": S0["D"], "B_mol_s": sum(Lk for Lk, _ in self.liquids_out(SN)),
                "Q_condenser_W": S0["Q"], "Q_reboiler_W": SN["Q"], "solver": info, "check": self.check(u)}

    def start_from(self, prof):
        """The unknowns from a converged profile of the mixed K-value reference (or of the decanter reference): on a
        stage with two liquids, its two liquids and their flows."""
        stages = []
        for j, s in enumerate(prof["stages"]):
            st = {"T": s["T_K"]}
            if j == 0:
                st.update({"x1": np.asarray(s["x"]), "L1": s["L_mol_s"], "D": prof["D_mol_s"], "Q": prof["Q_condenser_W"]})
                if self.decanter:
                    st["x2"] = np.asarray(prof["x_D"])
                elif 0 in self.two:
                    b, x1, x2 = self.th.split(np.asarray(s["x"]), s["T_K"])
                    C = s["L_mol_s"] + prof["D_mol_s"]
                    st.update({"x1": x1, "L1": (1 - b) * C, "x2": x2, "L2": b * C})
            else:
                st.update({"y": np.asarray(s["y"]), "V": s["V_mol_s"]})
                if j in self.two:
                    q = s["liquids"]
                    if "x_I" in q:                          # reference_mesh.py's form: x_I, x_II and the share of II
                        a = {"x": q["x_I"], "flow_mol_s": (1 - q["beta_II"]) * s["L_mol_s"]}
                        b = {"x": q["x_II"], "flow_mol_s": q["beta_II"] * s["L_mol_s"]}
                    else:
                        a, b = q["light"], q["heavy"]
                    st.update({"x1": np.asarray(a["x"]), "L1": a["flow_mol_s"], "x2": np.asarray(b["x"]), "L2": b["flow_mol_s"]})
                else:
                    st.update({"x1": np.asarray(s["x"]), "L1": s["L_mol_s"]})
            if j == self.N - 1:
                st["Q"] = prof["Q_reboiler_W"]
            stages.append(st)
        return self.pack(stages)


def feed_enthalpy(th, feed):
    """J/mol of a feed: a saturated liquid (q = 1, its bubble point) or, given T_K, its vapour-liquid flash at T and P
    (successive substitution on K_i = gamma_i(x) p_sat,i / P with the Rachford-Rice equation; the liquid checked
    stable by the tangent-plane test)."""
    z = np.asarray(feed["z"], float)
    if "T_K" not in feed:
        return th.feed_h(feed)
    T = feed["T_K"]
    x = z.copy()
    for _ in range(500):
        K = Activity.K(th, x, T)
        if np.sum(K * z) <= 1:
            return liquid_h(th.s, z, T, "ideal")[0]
        if np.sum(z / K) <= 1:
            return th.hV(z, T)
        b = brentq(lambda v: float(np.sum(z * (K - 1) / (1 + v * (K - 1)))), 0.0, 1.0, xtol=1e-15)
        xn = z / (1 + b * (K - 1)); xn /= xn.sum()
        done = np.max(np.abs(xn - x)) < 1e-14
        x = xn
        if done:
            break
    y = K * x / np.sum(K * x)
    tm, _ = th.tpd(x, T)
    assert not tm < -1e-9, "the feed's liquid would split: this flash does not represent it"
    return (1 - b) * liquid_h(th.s, x, T, "ideal")[0] + b * th.hV(y, T)


def three_phase(case, prof, th, decanter=False):
    """The case solved on ChemSep's three-phase stage, started from the mixed K-value reference's profile `prof`, its
    two-liquid stages taken from that profile."""
    two = [j for j, s in enumerate(prof["stages"]) if j > 0 and s.get("liquids") and (s["liquids"].get("beta_II", 0.5) > 1e-9)]
    s0 = prof["stages"][0]
    if case["column"]["condenser"] == "total" and th.split(np.asarray(s0["x"]), s0["T_K"]) is not None:
        two = [0] + two                                     # the condensate of a total condenser splits
    f = case["column"]["feed"]
    feeds = [(f["stage"], f["flow_mol_s"], f["z"], feed_enthalpy(th, f), 1.0)]
    c = ThreePhaseColumn(th, len(case["components"]), case["column"]["stages"], feeds, case["column"]["condenser"],
                         case["specs"], two, case["column"].get("reflux_liquid", "light"))
    # started away from that profile (each temperature 0.5 K higher, each flow and duty 3 % larger, each composition
    # tilted by 2 % and renormalized), so that the solution is this reference's own, not the profile handed to it
    u0 = c.start_from(prof)
    for sl in c.slots:
        for nm, v in sl.items():
            if nm == "T":
                u0[v] += 0.005
            elif nm in ("L1", "L2", "V", "D", "Q"):
                u0[v] *= 1.03
            else:
                w = u0[v] * (1 + 0.02 * np.cos(np.arange(c.nc)))
                u0[v] = w / w.sum()
    u, info = c.solve(u0)
    return {**c.profile(u, info), "feed_enthalpy_J_mol": [h for _, _, _, h in c.feeds]}


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


def main_three_phase():
    """The cases F3, F4 and F5 on ChemSep's three-phase stage: F3 started from reference_mesh.py's profile
    (validation/fixtures/columns.json), F4 and F5 from the engine's (validation/fixtures/columns-vll-engine-starts.json,
    written by validation/columns_vll_engine_starts.mjs), each perturbed. Writes validation/fixtures/columns-vll-three-phase.json."""
    data = ROOT / "validation" / "data" / "columns"
    fx = json.loads((ROOT / "validation" / "fixtures" / "columns.json").read_text())["cases"]
    starts = json.loads((ROOT / "validation" / "fixtures" / "columns-vll-engine-starts.json").read_text())["cases"]
    out = {"_about": "Written by validation/python/reference_mesh_vll.py --three-phase: the two-liquid columns on ChemSep's full "
                     "three-phase stage (The ChemSep Book, 2nd ed., eqs. 13.35-13.44), the independent check of proposal 0024 "
                     "(test 3). Converged reference profiles are not validated against data.", "H_scale_J_mol": H_SCALE, "cases": {}}
    for cid, start in (("F3-ethyl-acetate-ethanol-water-some-stages", fx["F3-ethyl-acetate-ethanol-water-some-stages"]["rigorous"]),
                       ("F4-ethanol-water-cyclohexane-decanter", starts["F4-ethanol-water-cyclohexane-decanter"]),
                       ("F5-ethyl-acetate-product-column-lab", starts["F5-ethyl-acetate-product-column-lab"])):
        print(cid, flush=True)
        rel = f"{cid}.json" if cid.startswith("F3") else f"vll/{cid}.json"   # F4, F5: proposal 0024's cases
        case = json.loads((data / rel).read_text())
        th = TwoLiquids(case["components"], case["pressure_kPa"], case["thermo"]["model"])
        prof = three_phase(case, start, th)
        print("  ", prof["solver"], prof["check"], flush=True)
        out["cases"][cid] = {"case": f"validation/data/columns/{rel}", "three_phase": prof}
    (ROOT / "validation" / "fixtures" / "columns-vll-three-phase.json").write_text(json.dumps(out, indent=1) + "\n")


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
    import sys
    if "--three-phase" in sys.argv:
        main_three_phase()
    else:
        main()
