"""
Independent reference for the absorber, the stripper and columns with nonvolatile components (proposal 0015, Part II,
step 7; milestone M3; proposal 0009, step 5), for the cases of validation/data/columns/absorber-stripper/cases.json.
It shares no code with the JavaScript engine (src/units/columns/engine.js).

The column without a condenser: every stage j = 1..N (from the top) is an equilibrium stage, the last one a partial
reboiler when the case has one. With L_j, V_j the liquid and vapour leaving stage j, x_j its liquid, y_j = K_j x_j its
vapour, f_j the feeds entering it (h_F their enthalpy flow) and Q_j the heat added to it:

  M  L_{j-1} x_{j-1} + V_{j+1} y_{j+1} + f_j - L_j x_j - V_j y_j = 0          (one per component)
  S  sum x_j = 1,  sum K_j x_j = 1
  H  L_{j-1} h_L,{j-1} + V_{j+1} h_V,{j+1} + h_F,j + Q_j - L_j h_L,j - V_j h_V,j = 0
  with L_0 = 0 and V_{N+1} = 0: the liquid feed enters stage 1, the gas stage N; the top gas is V_1, the bottom liquid
  L_N. Q_j is the case's stage duty (0: adiabatic); with a reboiler Q_N is unknown and the case's one specification
  (boil-up ratio V_N / L_N, bottoms flow L_N) closes the system.

These are the MESH equations of reference_mesh.py written for a column without a condenser (the material and energy
balances of a stage, from first principles). All unknowns (x, T, L, V per stage, and Q_N with a reboiler) are solved
together by Newton's method with a dense finite-difference Jacobian and step halving (scipy.optimize.root, hybrid
Powell then Levenberg-Marquardt, where Newton stalls), until every scaled residual is below 1e-12. The start: constant
molar overflow from the feeds' phases, the temperatures between the feeds', then the compositions of the component
balances at those flows and temperatures.

The distillation case with a nonvolatile component (H7) uses reference_mesh.Column, with the thermodynamics below.

The thermodynamics, written here or taken from the other references (not from the engine):
  - "kremser-model": the model system of the M2a cases (K = alpha p(T) / P, ln(p/kPa) = A - B/T; h_L = 0, h_V = the
    latent heat) for the carrier gas and the solvent, and a constant K for the solute;
  - "polynomial": The ChemSep Book's correlations of its absorber problem (section 1.6.7, Table 1.4; K_i = alpha_i +
    beta_i T, H_V,i = A_i + B_i T, H_L,i = a_i + b_i T, ideal mixing of the enthalpies), as printed;
  - "chepta" NRTL: reference_mesh.Activity; Peng-Robinson: reference_mesh.Eos;
  - "chepta" ideal with a nonvolatile component: Raoult's law (K = p_sat / P, the vapour-pressure records; a
    nonvolatile component 1e-20 kPa, as docs/DATA_RULES.md section 10 states), the liquid enthalpy of
    reference_enthalpy.py for the volatile components (no excess enthalpy) and, for a nonvolatile one, the integral of
    its liquid heat capacity from 298.15 K (its reference state, DATA_RULES section 10); the ideal-gas vapour of
    reference_enthalpy.py.

Writes validation/fixtures/columns_absorber.json, which test/columns-absorber.test.js reads.
Regenerate: python validation/python/reference_mesh_absorber.py      (about a minute; numpy, scipy, thermo, iapws)
"""
import json
import math
import time
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from scipy.integrate import quad
from scipy.optimize import brentq, root

from reference_model import COMPONENTS, psat_kpa
from reference_enthalpy import h_liquid_pure, h_ig, cp_liquid, T_REF
from reference_mesh import Activity, Eos, Column as DistillationColumn, bubble_T as ref_bubble_T

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / "validation" / "data" / "columns" / "absorber-stripper" / "cases.json"
OUT = ROOT / "validation" / "fixtures" / "columns_absorber.json"
H_SCALE = 1e4
SOLVE_TOL = 1e-12
NV_PSAT_KPA = 1e-20


class KremserModel:
    def __init__(self, th, P):
        self.alpha, self.KA = np.asarray(th["alpha"], float), th["K_solute"]
        self.A, self.B = th["reference_vapour_pressure"]["A"], th["reference_vapour_pressure"]["B_K"]
        self.lam, self.P = th["latent_heat_J_mol"], P

    def K(self, x, T):
        return np.concatenate([self.alpha * math.exp(self.A - self.B / T) / self.P, [self.KA]])

    def hL(self, x, T):
        return 0.0

    def hV(self, y, T):
        return self.lam


class Polynomial:
    def __init__(self, th, P):
        self.al, self.be = np.asarray(th["alpha"], float), np.asarray(th["beta"], float)
        self.Av, self.Bv = np.asarray(th["A_J_kmol"]) / 1000, np.asarray(th["B_J_kmol_K"]) / 1000
        self.aL, self.bL = np.asarray(th["a_J_kmol"]) / 1000, np.asarray(th["b_J_kmol_K"]) / 1000
        self.P = P

    def K(self, x, T):
        K = self.al + self.be * T
        if np.any(K <= 0):
            raise ValueError("a K-value of the correlation is not positive at this temperature")
        return K

    def hL(self, x, T):
        return float(np.sum(np.asarray(x) * (self.aL + self.bL * T)))

    def hV(self, y, T):
        return float(np.sum(np.asarray(y) * (self.Av + self.Bv * T)))


class IdealNonvolatile:
    def __init__(self, ids, P):
        self.ids, self.P = ids, P
        self.c = [COMPONENTS[i] for i in ids]
        self.nv = [c.get("class") == "nonvolatile" for c in self.c]
        self.memo = {}

    def K(self, x, T):
        return np.array([NV_PSAT_KPA if nv else psat_kpa(c, T) for c, nv in zip(self.c, self.nv)]) / self.P

    def h_pure_liquid(self, i, T):
        key = (i, T)
        if key not in self.memo:
            cid = self.ids[i]
            if self.nv[i]:
                self.memo[key] = quad(lambda t: cp_liquid(cid, t), T_REF, T, epsabs=1e-9, epsrel=1e-12)[0]
            else:
                self.memo[key] = h_liquid_pure(cid, T, None, i, len(self.ids), self.c[i])
        return self.memo[key]

    def hL(self, x, T):
        x = np.clip(np.asarray(x, float), 0, None); x = x / x.sum()
        return float(sum(x[i] * self.h_pure_liquid(i, T) for i in range(len(x)) if x[i] > 0))

    def hV(self, y, T):
        y = np.clip(np.asarray(y, float), 0, None); y = y / y.sum()
        return float(sum(y[i] * h_ig(cid, T) for i, cid in enumerate(self.ids) if y[i] > 0 and not self.nv[i]))

    def bubble_T(self, x):
        return brentq(lambda T: float(np.sum(self.K(x, T) * x)) - 1, 250.0, 600.0, xtol=1e-12)


class EosAbsorber(Eos):
    """reference_mesh.Eos with the vapour of K = phi_L(x) / phi_V(y) found by successive substitution from Wilson's
    estimate (ln K_i = ln(Pc_i / P) + 5.373 (1 + omega_i)(1 - Tc_i / T)) instead of from x: the liquid of an absorber
    is mostly a heavy oil, whose own "vapour" root at x is its liquid root (K = 1, the trivial solution)."""

    def K(self, x, T):
        c = self.cub
        x = np.clip(np.asarray(x, float), 1e-300, None); x = x / x.sum()
        lnL = self.lnphi(x, T, "liquid")
        y = x * c.Pc / (self.P * 1000) * np.exp(5.373 * (1 + c.w) * (1 - c.Tc / T))
        last = math.inf
        for _ in range(500):
            K = np.exp(lnL - self.lnphi(y / y.sum(), T, "vapour"))
            yn = K * x
            step = np.max(np.abs(yn / yn.sum() - y / y.sum()))
            if step <= 1e-15 or (step < 1e-12 and step >= last):
                return K
            y, last = yn, step
        raise RuntimeError("the vapour composition of a stage did not converge")


def thermo_of(case, cases):
    th, P = case["thermo"], case["pressure_kPa"]
    if th == "as H2":
        th = next(c for c in cases if c["id"].startswith("H2"))["thermo"]
    if th["kind"] == "kremser-model":
        return KremserModel(th, P)
    if th["kind"] == "polynomial":
        return Polynomial(th, P)
    if th["model"] == "PR":
        return EosAbsorber(case["components"], P, "PR")
    if th["model"] == "NRTL":
        return Activity(case["components"], P, "NRTL")
    assert th["model"] == "ideal"
    return IdealNonvolatile(case["components"], P)


def bubble_T(th, x):
    if hasattr(th, "bubble_T"):
        return th.bubble_T(x)
    return ref_bubble_T(th, x)


def feed_state(th, f):
    """A feed's molar enthalpy, its liquid fraction for the start, and its temperature."""
    z = np.asarray(f["z"], float)
    if "q" in f:                                   # a model system: (1 - q) times the latent heat
        return (1 - f["q"]) * th.lam, f["q"], None
    if f["phase"] == "liquid":
        return th.hL(z, f["T_K"]), 1.0, f["T_K"]
    if f["phase"] == "vapour":
        return th.hV(z, f["T_K"]), 0.0, f["T_K"]
    assert f["phase"] == "saturated vapour"
    T = bubble_T(th, z)                             # a pure component here: its dew point is its boiling point
    return th.hV(z, T), 0.0, T


class Column:
    """The MESH system of a column without a condenser. Unknowns per stage: x (nc), T / 100, L / F, V / F; then Q_N
    with a reboiler."""

    def __init__(self, th, nc, N, feeds, reboiler, specs, duties):
        self.th, self.nc, self.N, self.reboiler, self.specs = th, nc, N, reboiler, specs
        self.feeds = feeds                          # (stage index, flow, z, h, q, T)
        self.F = sum(f[1] for f in feeds)
        self.f = np.zeros((N, nc)); self.hF = np.zeros(N); self.Q = np.zeros(N)
        for j, Ff, z, h, _, _ in feeds:
            self.f[j] += Ff * np.asarray(z); self.hF[j] += Ff * h
        for d in duties:
            self.Q[d["stage"] - 1] += d["Q_W"]
        self.w = nc + 3

    def unpack(self, u):
        n = self.N * self.w
        S = u[:n].reshape(self.N, self.w)
        x, T, L, V = S[:, :self.nc], S[:, self.nc] * 100, S[:, self.nc + 1] * self.F, S[:, self.nc + 2] * self.F
        Qr = u[n] * self.F * H_SCALE if self.reboiler else 0.0
        return x, T, L, V, Qr

    def pack(self, x, T, L, V, Qr):
        u = np.column_stack([x, T / 100, L / self.F, V / self.F]).ravel()
        return np.concatenate([u, [Qr / (self.F * H_SCALE)]]) if self.reboiler else u

    def groups(self, u):
        x, T, L, V, Qr = self.unpack(u)
        N, th = self.N, self.th
        K = np.array([th.K(x[j], T[j]) for j in range(N)])
        y = K * x
        hL = np.array([th.hL(x[j], T[j]) for j in range(N)])
        hV = np.array([th.hV(y[j], T[j]) for j in range(N)])
        Q = self.Q.copy()
        if self.reboiler:
            Q[-1] += Qr
        mat, summ, en = np.zeros((N, self.nc)), np.zeros((N, 2)), np.zeros(N)
        for j in range(N):
            inn = self.f[j].copy()
            e = self.hF[j] + Q[j] - L[j] * hL[j] - V[j] * hV[j]
            if j > 0:
                inn += L[j - 1] * x[j - 1]; e += L[j - 1] * hL[j - 1]
            if j < N - 1:
                inn += V[j + 1] * y[j + 1]; e += V[j + 1] * hV[j + 1]
            mat[j] = inn - L[j] * x[j] - V[j] * y[j]
            summ[j] = [np.sum(x[j]) - 1, np.sum(y[j]) - 1]
            en[j] = e
        sp = []
        for s in self.specs:
            if s["kind"] == "boilup_ratio":
                sp.append(V[-1] - s["value"] * L[-1])
            elif s["kind"] == "bottoms_flow_mol_s":
                sp.append(L[-1] - s["value"])
            else:
                raise ValueError(s["kind"])
        return mat, summ, en, np.array(sp), y

    def residual(self, u):
        mat, summ, en, sp, _ = self.groups(u)
        return np.concatenate([(mat / self.F).ravel(), summ.ravel(), en / (self.F * H_SCALE), sp / self.F])

    def start(self):
        th, N, nc, F = self.th, self.N, self.nc, self.F
        FL = sum(Ff * q for _, Ff, _, _, q, _ in self.feeds)
        zL = sum(Ff * q * np.asarray(z) for _, Ff, z, _, q, _ in self.feeds) / FL
        Vgas = sum(Ff * (1 - q) for _, Ff, _, _, q, _ in self.feeds)
        zV = sum(Ff * (1 - q) * np.asarray(z) for _, Ff, z, _, q, _ in self.feeds) / Vgas if Vgas > 0 else zL
        Vb = 0.0
        if self.reboiler:
            s = self.specs[0]
            B = FL / (1 + s["value"]) if s["kind"] == "boilup_ratio" else s["value"]
            Vb = FL - B
        # constant molar overflow: the gas rises with the boil-up, the liquid falls
        V = np.full(N, Vgas + Vb)
        L = np.full(N, FL - Vb)
        L[-1] = FL - Vb
        L[:-1] = FL
        Ts = [T for _, _, _, _, _, T in self.feeds if T is not None]
        top = [T for j, _, _, _, _, T in self.feeds if j == 0 and T is not None]
        bot = [T for j, _, _, _, _, T in self.feeds if j == N - 1 and T is not None]
        if Ts:
            Tt, Tb = (top or Ts)[0], (bot or top or Ts)[0]
            if self.reboiler:
                Tb = max(Tb, bubble_T(th, zL))
        else:
            Tt = Tb = bubble_T(th, zL)
        T = np.linspace(Tt, Tb, N)
        x = np.tile(zL, (N, 1))
        from scipy.linalg import solve_banded
        for _ in range(200):
            # an equation of state: the liquid feed's fugacity coefficients over the gas feed's (at a stage's trial
            # liquid, rich in a light gas, the liquid and vapour roots can coincide: K = 1, the trivial solution)
            if isinstance(th, Eos):
                zl = np.clip(zL, 1e-12, None) / np.sum(np.clip(zL, 1e-12, None)); zv = np.clip(zV, 1e-12, None) / np.sum(np.clip(zV, 1e-12, None))
                K = np.array([np.exp(th.lnphi(zl, T[j], "liquid") - th.lnphi(zv, T[j], "vapour")) for j in range(N)])
            else:
                K = np.array([th.K(x[j], T[j]) for j in range(N)])
            xn = np.empty_like(x)
            for i in range(nc):
                ab = np.zeros((3, N))
                ab[0, 1:] = V[1:] * K[1:, i]
                ab[1] = -(L + V * K[:, i])
                ab[2, :-1] = L[:-1]
                xn[:, i] = solve_banded((1, 1), ab, -self.f[:, i])
            xn = np.clip(xn, 1e-300, None)
            xn /= xn.sum(axis=1, keepdims=True)
            if isinstance(th, KremserModel):        # a model system: the stage at its liquid's bubble point
                T = np.array([brentq(lambda t: float(np.sum(th.K(xn[j], t) * xn[j])) - 1, 150.0, 600.0) for j in range(N)])
            elif self.reboiler:
                T[-1] = bubble_T(th, xn[-1])
            done = np.max(np.abs(xn - x)) < 1e-13
            x = xn
            if done:
                break
        u = self.pack(x, T, L, V, Vb * 4e4)
        return u

    def jacobian(self, u, r):
        J = np.zeros((len(r), len(u)))
        for k in range(len(u)):
            h = 1e-7 * max(1.0, abs(u[k]))
            uu = u.copy(); uu[k] += h
            J[:, k] = (self.residual(uu) - r) / h
        return J

    def safe_residual(self, u):
        try:
            r = self.residual(u)
            return r if np.all(np.isfinite(r)) else np.full(len(u), 1e6)
        except (OverflowError, ValueError, FloatingPointError, RuntimeError, AssertionError):
            return np.full(len(u), 1e6)

    def norm(self, u):
        r = self.safe_residual(u)
        return math.inf if np.all(r == 1e6) else float(np.linalg.norm(r))

    def newton(self, u, steps):
        for k in range(1, steps + 1):
            r = self.residual(u)
            if np.max(np.abs(r)) < SOLVE_TOL:
                return u, k - 1
            nr = np.linalg.norm(r)
            try:
                du = np.linalg.solve(self.jacobian(u, r), r)
            except np.linalg.LinAlgError:
                return u, k
            lam = 1.0
            while lam > 1e-6 and not self.norm(u - lam * du) < nr:
                lam /= 2
            u = u - lam * du
        return u, steps

    def solve(self, u0):
        t0 = time.time()
        u, steps = self.newton(u0, 80)
        how = "Newton"
        if not np.max(np.abs(self.safe_residual(u))) < SOLVE_TOL:
            sol = root(self.safe_residual, u0, method="hybr", options={"xtol": 1e-14, "maxfev": 200000})
            u, how = sol.x, "hybr"
            if np.max(np.abs(self.safe_residual(u))) > 1e-8:
                sol = root(self.safe_residual, u, method="lm", options={"xtol": 1e-15, "ftol": 1e-15, "maxiter": 20000})
                u, how = sol.x, "hybr, then lm"
            u, steps = self.newton(u, 10)
            how += ", then Newton"
        res = np.max(np.abs(self.residual(u)))
        if not res < 1e-10:
            raise RuntimeError(f"the reference MESH solution did not converge: scaled residual {res:.3g}")
        x, T, *_ = self.unpack(u)
        same = [j + 1 for j in range(self.N) if np.max(np.abs(self.th.K(x[j], T[j]) * x[j] - x[j])) < 1e-6]
        if same:
            raise RuntimeError(f"the reference reached the trivial solution (vapour = liquid) on stages {same}")
        return u, {"solver": how, "newton_steps": steps, "scaled_residual": float(res), "seconds": round(time.time() - t0, 1)}

    def profile(self, u, info):
        x, T, L, V, Qr = self.unpack(u)
        mat, summ, en, sp, y = self.groups(u)
        stages = [{"stage": j + 1, "T_K": T[j], "L_mol_s": L[j], "V_mol_s": V[j], "x": x[j].tolist(), "y": y[j].tolist(),
                   "duty_W": float(self.Q[j] + (Qr if self.reboiler and j == self.N - 1 else 0.0))} for j in range(self.N)]
        return {"stages": stages, "top_flows_mol_s": (V[0] * y[0]).tolist(), "bottom_flows_mol_s": (L[-1] * x[-1]).tolist(),
                "Q_reboiler_W": Qr, "feed_enthalpy_J_mol": [h for _, _, _, h, _, _ in self.feeds],
                "residuals": {"material_mol_s": float(np.abs(mat).max()), "summation": float(np.abs(summ).max()),
                              "energy_W": float(np.abs(en).max()), "specifications_mol_s": float(np.abs(sp).max()) if len(sp) else 0.0},
                "solver": info}


def kremser(case, prof):
    """The fraction of the solute not absorbed: (A - 1) / (A^(N+1) - 1), A = L / (K V), lean solvent."""
    f = case["column"]["feeds"]
    L, V, N, K = f[0]["flow_mol_s"], f[1]["flow_mol_s"], case["column"]["stages"], case["thermo"]["K_solute"]
    A = L / (K * V)
    exact = (A - 1) / (A ** (N + 1) - 1)
    solute_in = f[1]["flow_mol_s"] * f[1]["z"][2]
    return {"absorption_factor": A, "fraction_not_absorbed_kremser": exact,
            "fraction_not_absorbed_mesh": prof["top_flows_mol_s"][2] / solute_in,
            "L_constant": [min(s["L_mol_s"] for s in prof["stages"]), max(s["L_mol_s"] for s in prof["stages"])],
            "V_constant": [min(s["V_mol_s"] for s in prof["stages"]), max(s["V_mol_s"] for s in prof["stages"])]}


def solve_distillation(case, th):
    """H7: reference_mesh.Column (total condenser, partial reboiler) with the thermodynamics of this file."""
    col = case["column"]
    feeds = []
    for f in col["feeds"]:
        h, q, _ = feed_state(th, f)
        feeds.append((f["stage"], f["flow_mol_s"], f["z"], h, q))
    c = DistillationColumn(th, len(case["components"]), col["stages"], feeds, col["condenser"], case["specs"])
    u, info = c.solve(c.start())
    return c.profile(u, info)


def main():
    cases = json.loads(CASES.read_text())["cases"]
    out = {"generated_by": "validation/python/reference_mesh_absorber.py", "cases": {}}
    solved = {}
    for case in cases:
        th = thermo_of(case, cases)
        col = case["column"]
        if col["condenser"] != "none":
            prof = solve_distillation(case, th)
        else:
            feeds = []
            for f in col["feeds"]:
                h, q, T = feed_state(th, f)
                feeds.append((f["stage"] - 1, f["flow_mol_s"], f["z"], h, q, T))
            c = Column(th, len(case["components"]), col["stages"], feeds, col["reboiler"] == "partial", case["specs"],
                       col.get("duties_W", []))
            # a case may start from another's solution (H3 from H2: the same column with a stage duty)
            start = solved[case["reference_start"]] if "reference_start" in case else c.start()
            u, info = c.solve(start)
            solved[case["id"]] = u
            prof = c.profile(u, info)
            # the overall balances: components, and energy with the duties
            Fin = sum(np.asarray(f[2]) * f[1] for f in feeds)
            prof["overall_component_balance_mol_s"] = float(np.max(np.abs(Fin - np.asarray(prof["top_flows_mol_s"]) - np.asarray(prof["bottom_flows_mol_s"]))))
        rec = {"profile": prof}
        if case["thermo"] != "as H2" and case["thermo"]["kind"] == "kremser-model":
            rec["kremser"] = kremser(case, prof)
        out["cases"][case["id"]] = rec
        print(case["id"], prof["solver"], [round(s["T_K"], 3) for s in prof["stages"]])
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
