"""
Independent reference for the rigorous column (proposal 0015, Part I, section 1; milestones M1 and M2a): the MESH
equations of an equilibrium-stage distillation column, solved all at once with scipy, for the benchmark cases of
validation/data/columns/ (their conventions: validation/data/columns/README.md). It shares no code with the JavaScript
engine (src/units/columns/, W2's).

The equations, per stage j = 1..N from the top (1 the condenser, N the partial reboiler), with L_j and V_j the liquid
and vapour leaving stage j, F_j the feed (composition z, molar enthalpy h_F), y_j = K_j(x_j, T_j) x_j:

  M  L_{j-1} x_{j-1} + V_{j+1} y_{j+1} + F_j z - L_j x_j - V_j y_j = 0       (one per component)
  E  y_j = K_j x_j                                                            (substituted into M, S and H)
  S  sum x_j = 1,  sum y_j = 1
  H  L_{j-1} h_L,{j-1} + V_{j+1} h_V,{j+1} + F_j h_F - L_j h_L,j - V_j h_V,j - Q_j = 0
  with the condenser's duty Q_1 (removed) and the reboiler's Q_N (added, Q = -Q_N); everywhere else Q_j = 0.
  Total condenser: stage 1 is not an equilibrium stage; its liquid leaves as the reflux L_1 and the distillate D, both
  of composition x_1 at their bubble point (sum K_1 x_1 = 1); no vapour leaves it. Partial condenser: stage 1 is an
  equilibrium stage whose vapour V_1 is the distillate D.
  Two specifications close the system (reflux ratio L_1 / D, distillate flow D, bottoms flow L_N).

These are the MESH equations as the open documentation of the column solvers cited in the proposal states them
(NeqSim's column documentation, https://equinor.github.io/neqsim/wiki/distillation_column, and DWSIM's source; read
2026-10-29); they are the material and energy balances of a stage, written here from first principles. All unknowns
(x, T, L, V of every stage, and the two duties) are solved together by Newton's method with a finite-difference
Jacobian and step halving (scipy.optimize.root, hybrid Powell then Levenberg-Marquardt, where Newton stalls), until
every stage's scaled residual is below 1e-12. The start: constant molar overflow, then the compositions and
temperatures of the bubble-point method at those flows.

The thermodynamics:
  - "constant-alpha" (model systems): K_i = alpha_i p(T) / P, ln(p/kPa) = A - B/T; h_L = 0 and h_V = latent heat for
    every component, so H gives constant molar overflow exactly; the feed's enthalpy is (1 - q) times the latent heat.
  - "chepta" NRTL with an ideal-gas vapour: reference_model.System (the parameter records of src/data/binaries.json and
    the vapour-pressure records of src/data/components.json, the default sets), K = gamma p_sat / P; the enthalpies of
    reference_enthalpy.py (liquid on the liquid-heat-capacity basis plus the excess enthalpy from the thermo library;
    ideal-gas vapour), the same formulas as the engine, written independently.

Besides the profiles, it writes checks with exact or independent answers: McCabe-Thiele's construction for the binary
(A1); the limit of a large reflux ratio against Fenske's alpha^(N-1) (A1); the reflux the rigorous column needs at
101 stages against Underwood's minimum (A2); the model's azeotrope against the measured one, for information (B1); the
dry-stage ratios (D1); the boil-up arithmetic (E2); and the shortcut results of reference_fug.py.

Writes validation/fixtures/columns.json, which test/benchmark-columns.test.js reads.
Regenerate: python validation/python/reference_mesh.py      (about a minute; numpy, scipy, thermo, iapws)
"""
import json
import math
import time
from pathlib import Path

import numpy as np
from scipy.optimize import brentq, root

from reference_model import System, psat_kpa, ALL_BINARIES
from reference_enthalpy import liquid_h, vapour_h
import reference_fug

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / "validation" / "data" / "columns"
OUT = ROOT / "validation" / "fixtures" / "columns.json"
H_SCALE = 1e4   # J/mol: the energy residuals are divided by F * H_SCALE
SOLVE_TOL = 1e-12


class Alpha:
    def __init__(self, th, P):
        self.alpha = np.asarray(th["alpha"], float)
        self.A, self.B = th["reference_vapour_pressure"]["A"], th["reference_vapour_pressure"]["B_K"]
        self.lam, self.P = th["latent_heat_J_mol"], P

    def K(self, x, T):
        return self.alpha * math.exp(self.A - self.B / T) / self.P

    def K_all(self, x, T):
        return self.alpha[None, :] * np.exp(self.A - self.B / T)[:, None] / self.P

    def bubble_T(self, x):
        return self.B / (self.A - math.log(self.P / float(np.sum(self.alpha * x))))

    def hL(self, x, T):
        return 0.0

    def hV(self, y, T):
        return self.lam

    def feed_h(self, feed):
        return (1 - feed["q"]) * self.lam


class Nrtl:
    def __init__(self, ids, P):
        self.ids, self.P = ids, P
        self.s = System(ids, "NRTL")

    def K(self, x, T):
        return self.s.gamma(x, T) * np.array([psat_kpa(c, T) for c in self.s.c]) / self.P

    def hL(self, x, T):
        return liquid_h(self.s, np.clip(x, 0, None) / np.sum(np.clip(x, 0, None)), T, "ideal")[0]

    def hV(self, y, T):
        return vapour_h(self.ids, np.clip(y, 0, None), T, self.P, "ideal")

    def feed_h(self, feed):
        z, T = np.asarray(feed["z"], float), feed["T_K"]
        assert np.sum(self.K(z, T) * z) < 1, "the feed is meant to be a liquid below its bubble point"
        return self.hL(z, T)


def thermo_of(case):
    th, P = case["thermo"], case["pressure_kPa"]
    if th["kind"] == "constant-alpha":
        return Alpha(th, P)
    assert th["model"] == "NRTL" and th["vapour"] == "ideal" and th["sets"] == "default"
    return Nrtl(case["components"], P)


def bubble_T(th, x, lo=200.0, hi=700.0):
    if hasattr(th, "bubble_T"):
        return th.bubble_T(x)
    return brentq(lambda T: float(np.sum(th.K(x, T) * x)) - 1, lo, hi, xtol=1e-12)


class Column:
    """The MESH system of one column. Unknowns per stage: x (nc), T, L, V (stage 1: V holds the distillate D);
    then Q_c and Q_r."""

    def __init__(self, th, nc, N, f, F, z, hF, condenser, specs):
        self.th, self.nc, self.N, self.f, self.F = th, nc, N, f - 1, F
        self.z, self.hF, self.total = np.asarray(z, float), hF, condenser == "total"
        self.specs = specs
        self.w = nc + 3

    def unpack(self, u):
        S = u[:-2].reshape(self.N, self.w)
        x, T, L, V = S[:, :self.nc], S[:, self.nc] * 100, S[:, self.nc + 1] * self.F, S[:, self.nc + 2] * self.F
        return x, T, L, V, u[-2] * self.F * H_SCALE, u[-1] * self.F * H_SCALE

    def pack(self, x, T, L, V, Qc, Qr):
        S = np.column_stack([x, T / 100, L / self.F, V / self.F])
        return np.concatenate([S.ravel(), [Qc / (self.F * H_SCALE), Qr / (self.F * H_SCALE)]])

    def groups(self, u):
        """Residuals by group, unscaled: material (mol/s, N x nc), summation (N x 2), energy (W, N), specs (mol/s)."""
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
            if j == self.f:
                m += self.F * self.z; e += self.F * self.hF
            if j == 0 and self.total:          # reflux L_1 and liquid distillate D = V slot, both x_1
                m -= (L[0] + V[0]) * x[0]; e -= (L[0] + V[0]) * hL[0] + Qc
            else:
                m -= L[j] * x[j] + V[j] * y[j]; e -= L[j] * hL[j] + V[j] * hV[j]
                if j == 0:
                    e -= Qc
            if j == N - 1:
                e += Qr
            mat[j], en[j] = m, e
            summ[j] = [np.sum(x[j]) - 1, np.sum(y[j]) - 1]
        D, B = V[0], L[-1]
        sp = []
        for s in self.specs:
            if s["kind"] == "reflux_ratio":
                sp.append(L[0] - s["value"] * D)
            elif s["kind"] == "distillate_flow_mol_s":
                sp.append(D - s["value"])
            elif s["kind"] == "bottoms_flow_mol_s":
                sp.append(B - s["value"])
            else:
                raise ValueError(f"specification {s['kind']} is not in this reference")
        return mat, summ, en, np.array(sp), y

    def residual(self, u):
        mat, summ, en, sp, _ = self.groups(u)
        return np.concatenate([(mat / self.F).ravel(), summ.ravel(), en / (self.F * H_SCALE), sp / self.F])

    def start(self, q_guess):
        th, N, nc, F, z = self.th, self.N, self.nc, self.F, self.z
        R = next(s["value"] for s in self.specs if s["kind"] == "reflux_ratio")
        D = next((s["value"] for s in self.specs if s["kind"] == "distillate_flow_mol_s"), None)
        if D is None:
            D = F - next(s["value"] for s in self.specs if s["kind"] == "bottoms_flow_mol_s")
        B = F - D
        # product estimates: the distillate takes the most volatile components first (K at the feed's bubble point)
        Kf = th.K(z, bubble_T(th, z))
        d, left = np.zeros(nc), D
        for i in np.argsort(-Kf):
            d[i] = min(0.97 * F * z[i], left) if left > 0 else 0.0
            left -= d[i]
        d = np.clip(d, 1e-6 * F, None)
        b = np.clip(F * z - d, 1e-6 * F, None)
        xD, xB = d / d.sum(), b / b.sum()
        x = np.array([xD + (xB - xD) * j / (N - 1) for j in range(N)])
        T = np.array([bubble_T(th, x[j]) for j in range(N)])
        Lr, Vr = R * D, (R + 1) * D
        Ls, Vs = Lr + q_guess * F, Vr - (1 - q_guess) * F
        L = np.array([Lr if j < self.f else Ls for j in range(N)]); L[-1] = B
        V = np.array([Vr if j <= self.f else Vs for j in range(N)]); V[0] = D
        x, T = self.bubble_point_start(x, T, L, V)
        u = self.pack(x, T, L, V, 0.0, 0.0)
        _, _, en, _, _ = self.groups(u)
        x_, T_, L_, V_, _, _ = self.unpack(u)
        Qc = en[0]               # the duty that closes the condenser's balance at the start
        Qr = -en[-1]
        return self.pack(x_, T_, L_, V_, Qc, Qr)

    def bubble_point_start(self, x, T, L, V, sweeps=20000):
        """The compositions and temperatures for the start's flows, by the bubble-point method (the component balances
        as one tridiagonal system per component at fixed K, then each stage's bubble temperature, repeated): only a
        first guess for the simultaneous solution, which closes every equation."""
        from scipy.linalg import solve_banded
        N, nc, F = self.N, self.nc, self.F
        feed = np.zeros((N, nc)); feed[self.f] = F * self.z
        for _ in range(sweeps):
            K = self.th.K_all(x, T) if hasattr(self.th, "K_all") else np.array([self.th.K(x[j], T[j]) for j in range(N)])
            xn = np.empty_like(x)
            for i in range(nc):
                ab = np.zeros((3, N))
                ab[0, 1:] = V[1:] * K[1:, i]                      # above the diagonal: vapour from the stage below
                ab[1] = -(L + V * K[:, i])
                if self.total:
                    ab[1, 0] = -(L[0] + V[0])
                ab[2, :-1] = L[:-1]                               # below the diagonal: liquid from the stage above
                xn[:, i] = solve_banded((1, 1), ab, -feed[:, i])
            xn = np.clip(xn, 1e-300, None)
            xn /= xn.sum(axis=1, keepdims=True)
            Tn = np.array([bubble_T(self.th, xn[j]) for j in range(N)])
            done = np.max(np.abs(Tn - T)) < 1e-11 and np.max(np.abs(xn - x)) < 1e-14
            x, T = xn, Tn
            if done:
                break
        return x, T

    def jacobian(self, u, r):
        J = np.empty((len(r), len(u)))
        for k in range(len(u)):
            h = 1e-7 * max(1.0, abs(u[k]))
            v = u.copy(); v[k] += h
            J[:, k] = (self.residual(v) - r) / h
        return J

    def norm(self, u):
        """The 2-norm of the scaled residuals, or infinity where a trial step leaves the physical domain (T <= 0)."""
        try:
            return float(np.linalg.norm(self.residual(u)))
        except (OverflowError, ValueError, FloatingPointError):
            return math.inf

    def newton(self, u, steps):
        """Newton's method with a finite-difference Jacobian, halving the step until the residual falls."""
        for k in range(1, steps + 1):
            r = self.residual(u)
            nr = np.linalg.norm(r)
            if np.max(np.abs(r)) < SOLVE_TOL:
                return u, k - 1
            try:
                du = np.linalg.solve(self.jacobian(u, r), r)
            except np.linalg.LinAlgError:
                return u, k
            lam = 1.0
            while lam > 1e-4 and not self.norm(u - lam * du) < nr:
                lam /= 2
            u = u - lam * du
        return u, steps

    def solve(self, u0):
        t0 = time.time()
        u, steps = self.newton(u0, 60)
        how = "Newton"
        if not np.max(np.abs(self.residual(u))) < SOLVE_TOL:
            sol = root(self.residual, u0, method="hybr", options={"xtol": 1e-14, "maxfev": 200000})
            u, how = sol.x, "hybr"
            if np.max(np.abs(self.residual(u))) > 1e-8:
                sol = root(self.residual, u, method="lm", options={"xtol": 1e-15, "ftol": 1e-15, "maxiter": 20000})
                u, how = sol.x, "hybr, then lm"
            u, steps = self.newton(u, 10)
            how += ", then Newton"
        res = np.max(np.abs(self.residual(u)))
        if not res < 1e-10:
            raise RuntimeError(f"the reference MESH solution did not converge: scaled residual {res:.3g}")
        return u, {"solver": how, "newton_steps": steps, "scaled_residual": float(res), "seconds": round(time.time() - t0, 1)}

    def profile(self, u, info):
        x, T, L, V, Qc, Qr = self.unpack(u)
        mat, summ, en, sp, y = self.groups(u)
        K = np.array([self.th.K(x[j], T[j]) for j in range(self.N)])
        eq = np.abs(y - K * x).max(axis=1)
        stages = []
        for j in range(self.N):
            liquid_only = j == 0 and self.total
            stages.append({"stage": j + 1, "T_K": T[j], "L_mol_s": L[j], "V_mol_s": 0.0 if liquid_only else V[j],
                           "x": x[j].tolist(), "y": None if liquid_only else y[j].tolist(),
                           "residuals": {"material_mol_s": float(np.abs(mat[j]).max()), "summation": float(np.abs(summ[j]).max()),
                                         "equilibrium": 0.0 if liquid_only else float(eq[j]), "energy_W": float(abs(en[j]))}})
        D, B = V[0], L[-1]
        xD = x[0] if self.total else y[0]
        return {"stages": stages, "D_mol_s": D, "B_mol_s": B, "x_D": xD.tolist(), "x_B": x[-1].tolist(),
                "Q_condenser_W": Qc, "Q_reboiler_W": Qr, "feed_enthalpy_J_mol": self.hF,
                "residuals": {"material_mol_s": float(np.abs(mat).max()), "summation": float(np.abs(summ).max()),
                              "equilibrium": float(max(s["residuals"]["equilibrium"] for s in stages)),
                              "energy_W": float(np.abs(en).max()), "specifications_mol_s": float(np.abs(sp).max())},
                "solver": info}


def column_of(case, th=None, specs=None, stages=None, feed_stage=None):
    th = th or thermo_of(case)
    col = case["column"]
    nc = len(case["components"])
    return Column(th, nc, stages or col["stages"], feed_stage or col["feed"]["stage"], col["feed"]["flow_mol_s"],
                  col["feed"]["z"], th.feed_h(col["feed"]), col["condenser"], specs or case["specs"])


def solve_case(case, u0=None, **kw):
    """Solve a case; u0, a solution of the same column with other specifications, is the start when given."""
    c = column_of(case, **kw)
    u, info = c.solve(c.start(case["column"]["feed"].get("q", 1.0)) if u0 is None else u0)
    return c, u, c.profile(u, info)


def mccabe_thiele(case, prof):
    """McCabe-Thiele's construction from x_D, with the column's own flows (constant molar overflow): step down from the
    condenser by the equilibrium curve and the operating lines; the last stage's x must be the column's x_B."""
    a = case["thermo"]["alpha"][0] / case["thermo"]["alpha"][1]
    st, f = prof["stages"], case["column"]["feed"]["stage"]
    F, zA = case["column"]["feed"]["flow_mol_s"], case["column"]["feed"]["z"][0]
    D, B, xD = prof["D_mol_s"], prof["B_mol_s"], prof["x_D"][0]
    xB = (F * zA - D * xD) / B
    x, out = xD, [xD]
    for j in range(1, len(st)):              # stage j+1 receives liquid x_j from above
        Lj, Vn = st[j - 1]["L_mol_s"], st[j]["V_mol_s"]
        y = (Lj * x + D * xD) / Vn if j < f else (Lj * x - B * xB) / Vn
        x = y / (a - (a - 1) * y)
        out.append(x)
    dev = max(abs(out[j] - st[j]["x"][0]) for j in range(len(st)))
    return {"x_A_by_stage": out, "max_deviation_from_profile": dev, "tolerance": 1e-9,
            "why": "an exact construction for constant relative volatility and constant molar overflow: only rounding"}


def separation(prof, i, k):
    return (prof["x_D"][i] / prof["x_D"][k]) * (prof["x_B"][k] / prof["x_B"][i])


def main():
    cases = {p.stem: json.loads(p.read_text()) for p in sorted(CASES.glob("*.json"))}
    out = {"_about": "Written by validation/python/reference_mesh.py (independent MESH reference) and reference_fug.py "
                     "(shortcut). Regenerate: python validation/python/reference_mesh.py. The cases and their conventions: "
                     "validation/data/columns/. Converged reference profiles are not validated against data.",
           "H_scale_J_mol": H_SCALE, "cases": {}}
    for cid, case in cases.items():
        print(cid, flush=True)
        rec = {"title": case["title"]}
        if cid in ("A1-binary-alpha", "A3-ternary-partial-condenser", "B1-ethanol-water-nrtl", "D1-dry-stage"):
            c, u, prof = solve_case(case)
            rec["rigorous"] = prof
            checks = rec["checks"] = {}
            if cid == "A1-binary-alpha":
                checks["mccabe_thiele"] = mccabe_thiele(case, prof)
                N, a = case["column"]["stages"], case["thermo"]["alpha"][0] / case["thermo"]["alpha"][1]
                big = [{"kind": "reflux_ratio", "value": 1e4}, case["specs"][1]]
                _, _, p_big = solve_case(case, specs=big)
                dev = math.log(separation(p_big, 0, 1)) / ((N - 1) * math.log(a)) - 1
                checks["total_reflux"] = {"reflux_ratio": 1e4, "ln_S": math.log(separation(p_big, 0, 1)), "fenske_ln_S": (N - 1) * math.log(a),
                                          "relative_deviation": dev, "tolerance": 1e-3,
                                          "why": "Fenske is exact at total reflux; at R = 1e4 the remaining difference is of the order of 1/R"}
                d, f_ = np.array(prof["x_D"]) * prof["D_mol_s"], np.array(case["column"]["feed"]["z"]) * 100.0
                r = reference_fug.fug(case["thermo"]["alpha"], case["column"]["feed"]["z"], 100.0, 1.0, 0, 1, d[0] / f_[0], 1 - d[1] / f_[1], R=2.0)
                rec["shortcut"] = {"outcome": "ok", **r, "rigorous_equilibrium_stages": N - 1,
                                   "note": "recoveries of the rigorous solution; Gilliland's N is a correlation, shown for information, not a check"}
            if cid == "B1-ethanol-water-nrtl":
                th = c.th
                f = lambda x: (lambda K: K[0] / K[1] - 1)(th.K(np.array([x, 1 - x]), bubble_T(th, np.array([x, 1 - x]))))
                xa = brentq(f, 0.6, 0.999, xtol=1e-12)
                Ta = bubble_T(th, np.array([xa, 1 - xa]))
                checks["azeotrope"] = {"model_x_ethanol": xa, "model_T_K": Ta, "x_D_ethanol": prof["x_D"][0],
                                       "measured_for_information": {"x_ethanol": 0.892, "T_K": 78.1 + 273.15,
                                                                   "source": "validation/data/azeotropes_101kPa.json (ethanol + water)"}}
                al = lambda s: (lambda K: K[0] / K[1])(th.K(np.array(s["x"]), s["T_K"]))
                checks["relative_volatility"] = {"stage_2": al(prof["stages"][1]), "reboiler": al(prof["stages"][-1])}
                st = prof["stages"]; fs = case["column"]["feed"]["stage"]
                checks["feed_stage_liquid_rise_mol_s"] = st[fs - 1]["L_mol_s"] - st[fs - 2]["L_mol_s"]
            if cid == "D1-dry-stage":
                st = prof["stages"]; Vmax = max(s["V_mol_s"] for s in st)
                checks["liquid_over_max_vapour"] = {str(s["stage"]): s["L_mol_s"] / Vmax for s in st}
        if cid == "A2-ternary-alpha-fug":
            r = reference_fug.run_case(case)
            rec["shortcut"] = r
            # the rigorous column at 101 stages (100 equilibrium stages), the feed placed as the shortcut places it,
            # the shortcut's distillate flow: the reflux ratio that gives the light key's recovery of 0.98
            N = 101
            fstage = N - round(r["N_below_feed"] / r["N"] * (N - 1))
            last = {}   # continuation: each solve starts from the previous solution

            def recovery(R):
                specs = [{"kind": "reflux_ratio", "value": R}, {"kind": "distillate_flow_mol_s", "value": r["D_mol_s"]}]
                _, last["u"], p = solve_case(case_with(case, N, fstage), u0=last.get("u"), specs=specs)
                return p["x_D"][0] * p["D_mol_s"] / (case["column"]["feed"]["flow_mol_s"] * case["column"]["feed"]["z"][0])
            recovery(r["R_min"])
            Rr = brentq(lambda R: recovery(R) - 0.98, 0.95 * r["R_min"], 1.02 * r["R_min"], xtol=1e-9)
            rec["checks"] = {"rmin_against_rigorous": {"stages": N, "feed_stage": fstage, "reflux_ratio_rigorous": Rr, "R_min_underwood": r["R_min"],
                             "ratio": Rr / r["R_min"], "expected": "close to 1: Underwood is exact for constant alpha and constant molar overflow at infinitely many stages; 100 stages need a little more, and the rigorous column puts less of the heavy non-key C in the distillate than Fenske's estimate in the shortcut's x_D, which lowers it a little",
                             "tolerance": [1.0 - 1e-3, 1.0 + 1e-2]}}
        if cid == "E1-shortcut-below-minimum-reflux":
            rec["shortcut"] = reference_fug.run_case(case)
        if cid == "E2-negative-boilup":
            col, (R, D) = case["column"], [s["value"] for s in case["specs"]]
            F, q = col["feed"]["flow_mol_s"], col["feed"]["q"]
            rec["checks"] = {"boilup": {"V_above_feed_mol_s": (R + 1) * D, "feed_vapour_mol_s": (1 - q) * F,
                                        "V_below_feed_mol_s": (R + 1) * D - (1 - q) * F,
                                        "why": "constant molar overflow is exact for this model system: the boil-up would be negative, so no column has these specifications"}}
        if cid == "C1-missing-pair":
            ids = case["components"]
            have = [p for p in ALL_BINARIES if p["model"] == "NRTL" and {p["i"], p["j"]} == {"methanol", "ethylene-glycol"}]
            rec["checks"] = {"missing_pairs": [["methanol", "ethylene-glycol"]] if not have else [],
                             "other_pairs_present": all(any(p["model"] == "NRTL" and {p["i"], p["j"]} == set(pr) for p in ALL_BINARIES)
                                                        for pr in (("methanol", "water"), ("water", "ethylene-glycol")))}
        if cid == "E3-purity-above-azeotrope":
            rec["checks"] = {"azeotrope_from": "B1-ethanol-water-nrtl", "purity": 0.95}
        out["cases"][cid] = rec
    OUT.write_text(json.dumps(out, indent=1, default=float) + "\n")
    print("wrote", OUT)


def case_with(case, N, fstage):
    c = json.loads(json.dumps(case))
    c["column"]["stages"], c["column"]["feed"]["stage"] = N, fstage
    return c


if __name__ == "__main__":
    main()
