"""
Independent reference for the rigorous column (proposal 0015, Part I, section 1; milestones M1 and M2a): the MESH
equations of an equilibrium-stage distillation column, solved all at once with scipy, for the benchmark cases of
validation/data/columns/ (their conventions: validation/data/columns/README.md). It shares no code with the JavaScript
engine (src/units/columns/, W2's).

The equations, per stage j = 1..N from the top (1 the condenser, N the partial reboiler), with L_j and V_j the liquid
and vapour leaving stage j, F_j the feed or feeds entering it (composition z, molar enthalpy h_F; a case may have
several, column.feeds), y_j = K_j(x_j, T_j) x_j:

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
Jacobian (built by groups of columns, as each stage's equations involve only its neighbours) and step halving
(scipy.optimize.root, hybrid Powell then Levenberg-Marquardt, where Newton stalls), until
every stage's scaled residual is below 1e-12. The start: constant molar overflow, then the compositions and
temperatures of the bubble-point method at those flows.

The thermodynamics:
  - "constant-alpha" (model systems): K_i = alpha_i p(T) / P, ln(p/kPa) = A - B/T; h_L = 0 and h_V = latent heat for
    every component, so H gives constant molar overflow exactly; the feed's enthalpy is (1 - q) times the latent heat.
  - "chepta" NRTL or UNIQUAC with an ideal-gas vapour: reference_model.System (the parameter records of
    src/data/binaries.json and the vapour-pressure records of src/data/components.json, the default sets),
    K = gamma p_sat / P; the enthalpies of reference_enthalpy.py (liquid on the liquid-heat-capacity basis plus the
    excess enthalpy from the thermo library; ideal-gas vapour), the same formulas as the engine, written independently.
    A feed is given by its temperature (a liquid below its bubble point) or by q = 1 (saturated liquid) or q = 0
    (saturated vapour). With cmo_latent_heat_J_mol, the enthalpies of the model systems (constant molar overflow), only
    to compare with a published example solved that way (B2).
  - "chepta" Peng-Robinson or SRK for both phases: the cubic of reference_eos.py (its Z and parameters, the databank's
    k_ij), with ln phi and the residual enthalpy in closed form; K = phi_L(x) / phi_V(y), y = K x by successive
    substitution; h = the ideal-gas enthalpy plus the residual enthalpy of the phase.

Milestone M2b:
  - two liquids on the stages (a case's "phases": "VLL"; ActivityVLL): each stage's liquid is its stable liquid state,
    one liquid or two in liquid-liquid equilibrium (the tangent-plane test, then the split), and the stage's K-values
    and liquid enthalpy are those of the overall liquid, K_i = y_i / x_i with y in equilibrium with both liquids, h_L =
    the two liquids' enthalpy. This is the averaging that The ChemSep Book documents for three-phase distillation
    (H. A. Kooijman and R. Taylor, 2nd edition, 2006, public domain, http://www.chemsep.org/downloads/docs/book2.pdf,
    section 13.7.2, eqs. 13.45-13.52, read 2026-10-30), written here with the split solved at each stage;
  - a decanter on the condenser (condenser "decanter", spec decanter_reflux): the condensate, at its bubble point,
    splits into two liquids; all of the one richer in a named component is the reflux, all of the other the distillate;
  - the column's own method (the G cases, boundary_case): the feed, given in the flowsheet's method, crosses into the
    column's method with its component flows, pressure and enthalpy flow (a P-H flash there), the column is solved in
    its own method, and each product crosses back the same way; with a recycle, the loop is converged by direct
    substitution; the overall energy balance in the flowsheet's method, and a refusal where the column's method has no
    P-H solution within its records' range (G3).

Besides the profiles, it writes checks with exact or independent answers: McCabe-Thiele's construction for the binary
(A1, and A4 with two feeds); the phase stability of every stage's liquid by the tangent-plane distance (the cases with
real mixtures; F1 must split); the published ChemSep Book profile against the reference (B2); the model's azeotropes
(B1, B3); the limit of a large reflux ratio against Fenske's alpha^(N-1) (A1); the reflux the rigorous column needs at
101 stages against Underwood's minimum (A2); the model's azeotrope against the measured one, for information (B1); the
dry-stage ratios (D1); the boil-up arithmetic (E2); and the shortcut results of reference_fug.py.

Writes validation/fixtures/columns.json, which test/benchmark-columns.test.js reads.
Regenerate: python validation/python/reference_mesh.py      (about ten minutes; numpy, scipy, thermo, iapws)
"""
import json
import math
import time
from pathlib import Path

import numpy as np
from scipy.optimize import brentq, root

from reference_model import System, psat_kpa, ALL_BINARIES
from reference_enthalpy import liquid_h, vapour_h, h_ig
from reference_eos import Cubic, R as R_GAS
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


class Activity:
    """NRTL or UNIQUAC with an ideal-gas vapour (CHEPTA's default parameter sets). With enthalpy
    "constant-molar-overflow" the enthalpies are those of the model systems (h_L = 0, h_V = latent heat), for a
    comparison with a published example solved that way; otherwise CHEPTA's enthalpies."""

    def __init__(self, ids, P, model="NRTL", cmo_latent=None):
        self.ids, self.P, self.lam = ids, P, cmo_latent
        self.s = System(ids, model)
        self.memo = {}

    def K(self, x, T):
        return self.s.gamma(x, T) * np.array([psat_kpa(c, T) for c in self.s.c]) / self.P

    def hL(self, x, T):
        if self.lam is not None:
            return 0.0
        key = ("L", T, *x)        # remembered: the Jacobian's columns leave most stages unchanged
        if key not in self.memo:
            self.memo[key] = liquid_h(self.s, np.clip(x, 0, None) / np.sum(np.clip(x, 0, None)), T, "ideal")[0]
        return self.memo[key]

    def hV(self, y, T):
        if self.lam is not None:
            return self.lam
        key = ("V", T, *y)
        if key not in self.memo:
            self.memo[key] = vapour_h(self.ids, np.clip(y, 0, None), T, self.P, "ideal")
        return self.memo[key]

    def lnfug_liquid(self, x, T):
        return np.log(x) + np.log(self.s.gamma(x, T))

    def feed_T(self, feed):
        """A feed given by q: q = 1 a saturated liquid (its bubble point), q = 0 a saturated vapour (its dew point)."""
        z = np.asarray(feed["z"], float)
        if feed["q"] == 1:
            return bubble_T(self, z)
        assert feed["q"] == 0, "a real mixture's feed is given by T_K, or by q = 1 or q = 0"
        return brentq(lambda T: float(np.sum(z / self.K(z / np.sum(z / self.K(z, T)), T))) - 1, 200.0, 700.0, xtol=1e-12)

    def feed_h(self, feed):
        z = np.asarray(feed["z"], float)
        if "q" in feed:
            T = self.feed_T(feed)
            return self.hL(z, T) if feed["q"] == 1 else self.hV(z, T)
        T = feed["T_K"]
        assert np.sum(self.K(z, T) * z) < 1, "the feed is meant to be a liquid below its bubble point"
        return self.hL(z, T)


Nrtl = Activity


class ActivityVLL(Activity):
    """Two liquids on the stages (phases "VLL", proposal 0015, Part I, section 3; milestone M2b): a stage's liquid, of
    overall composition x at T, is the stable liquid state of x: one liquid where the tangent-plane test finds x
    stable, else two liquids x_I and x_II in liquid-liquid equilibrium (equal activities x_i gamma_i, the overall
    balance x = (1 - beta) x_I + beta x_II). The vapour is in equilibrium with both liquids, y_i = x_I,i gamma_i(x_I)
    p_sat,i / P, so the stage's K is written on the overall liquid, K_i = y_i / x_i, and the MESH equations of
    Column are unchanged; the liquid's enthalpy is (1 - beta) h_L(x_I) + beta h_L(x_II). This is the equilibrium
    stage with two liquids written from first principles (the Gibbs energy is lowest when the liquid splits where the
    tangent-plane distance of a trial liquid is negative); the phase split shares no code with the engine's three-phase
    flash."""

    def lng(self, x, T):
        return np.log(self.s.gamma(x, T))

    def split(self, x, T):
        """(x_I, x_II, beta) of the stable liquid state of overall liquid x at T, or None for one liquid. Liquid I is
        the one richer in the first component."""
        x = np.clip(np.asarray(x, float), 1e-300, None); x = x / x.sum()
        key = ("split", T, *x)
        if key in self.memo:
            return self.memo[key]
        out = None
        w = self.unstable_trial(x, T)
        if w is not None:
            out = self.ll_flash(x, T, w)
        self.memo[key] = out
        return out

    def unstable_trial(self, x, T):
        """Michelsen's tangent-plane test by successive substitution, ln W_i = ln x_i + ln gamma_i(x) - ln gamma_i(w),
        from a start near each pure component: the trial liquid with the most negative tangent-plane distance
        tm = 1 + sum W_i (ln W_i + ln gamma_i(w) - d_i - 1), or None where none is below -1e-10 (stable)."""
        n = len(x)
        d = np.log(x) + self.lng(x, T)
        best, bw = -1e-10, None
        for i in range(n):
            W = np.full(n, 0.02 / max(n - 1, 1)); W[i] = 0.98
            for _ in range(2000):
                Wn = np.exp(d - self.lng(W / W.sum(), T))
                done = np.max(np.abs(np.log(Wn) - np.log(W))) < 1e-13
                W = Wn
                if done:
                    break
            w = W / W.sum()
            if np.max(np.abs(w - x)) < 1e-6:
                continue                       # the trivial solution
            tm = 1 + float(np.sum(W * (np.log(W) + self.lng(w, T) - d - 1)))
            if tm < best:
                best, bw = tm, w
        return bw

    def ll_flash(self, x, T, w):
        """The two liquids of x at T, from the unstable trial w: successive substitution on K_i = gamma_i(x_I) /
        gamma_i(x_II) with the Rachford-Rice equation for beta, then Newton's method (scipy root) on the equal
        activities, to 1e-14. None when the split collapses to one liquid or beta leaves (0, 1)."""
        xa, xb = x.copy(), w.copy()
        beta = 0.5
        for _ in range(5000):
            K = np.exp(self.lng(xa, T) - self.lng(xb, T))          # x_II / x_I
            g = lambda b: float(np.sum(x * (K - 1) / (1 + b * (K - 1))))
            lo, hi = 1 / (1 - K.max()) + 1e-12, 1 / (1 - K.min()) - 1e-12
            if not (g(max(lo, -50)) > 0 > g(min(hi, 50))):
                return None
            beta = brentq(g, max(lo, -50), min(hi, 50), xtol=1e-15)
            xan = x / (1 + beta * (K - 1)); xbn = K * xan
            step = max(np.max(np.abs(xan - xa)), np.max(np.abs(xbn - xb)))
            xa, xb = xan / xan.sum(), xbn / xbn.sum()
            if step < 1e-12:
                break
        if not 0 < beta < 1 or np.max(np.abs(xa - xb)) < 1e-6:
            return None

        def F(u):
            a = np.exp(u[:-1]); a = a / a.sum(); b = u[-1]
            bb = (x - (1 - b) * a) / b
            if np.any(bb <= 0):
                return np.full(len(u), 1e3)
            return np.r_[np.log(a) + self.lng(a, T) - np.log(bb) - self.lng(bb, T), np.sum(np.exp(u[:-1])) - 1]
        sol = root(F, np.r_[np.log(xa), beta], method="hybr", options={"xtol": 1e-15})
        a = np.exp(sol.x[:-1]); a = a / a.sum(); beta = sol.x[-1]
        b = (x - (1 - beta) * a) / beta
        if np.max(np.abs(F(sol.x))) > 1e-11 or not 0 < beta < 1:
            raise RuntimeError(f"the liquid-liquid split did not converge at T = {T} K, x = {x}")
        if a[0] < b[0]:
            a, b, beta = b, a, 1 - beta
        return a, b, beta

    def bubble_T(self, x):
        """The bubble temperature, bracketed from 273.15 K (the liquid-liquid split is not sought far below the
        records' ranges)."""
        return brentq(lambda T: float(np.sum(self.K(x, T) * x)) - 1, 273.15, 700.0, xtol=1e-12)

    def K(self, x, T):
        x = np.clip(np.asarray(x, float), 1e-300, None); x = x / x.sum()
        sp = self.split(x, T)
        if sp is None:
            return Activity.K(self, x, T)
        xa = sp[0]
        return Activity.K(self, xa, T) * xa / x

    def hL(self, x, T):
        sp = self.split(np.clip(np.asarray(x, float), 1e-300, None) / np.sum(np.clip(x, 1e-300, None)), T)
        if sp is None or self.lam is not None:
            return Activity.hL(self, x, T)
        xa, xb, beta = sp
        return (1 - beta) * Activity.hL(self, xa, T) + beta * Activity.hL(self, xb, T)


class Eos:
    """Peng-Robinson or SRK for both phases (reference_eos.Cubic, the databank's k_ij, 0 where there is none):
    K_i = phi_i^L(x) / phi_i^V(y), with y = K x found by successive substitution at the stage's x and T; the
    enthalpies the ideal-gas enthalpy (reference_enthalpy.h_ig) plus the residual enthalpy of the phase, the form of
    the engine's equation-of-state systems."""

    def __init__(self, ids, P, model, cmo_latent=None):
        self.ids, self.P, self.lam = ids, P, cmo_latent
        self.cub = Cubic(model, ids)
        self.memo = {}

    def lnphi(self, x, T, phase):
        """ln phi_i in closed form for the generic cubic (Z from reference_eos.Cubic.Z):
        ln phi_i = b_i/b (Z - 1) - ln(Z - B) - A / (B (d1 - d2)) (2 sum_j x_j a_ij / a - b_i/b) ln((Z + d1 B)/(Z + d2 B)),
        the derivative that reference_eos.Cubic.lnphi takes numerically (they agree to about 1e-9; a closed form keeps
        the column's residuals smooth for Newton's method)."""
        key = ("phi", phase, T, *x)
        if key not in self.memo:
            c, P = self.cub, self.P * 1000
            x = np.asarray(x, float) / np.sum(x)
            ai = c.Oa * R_GAS ** 2 * c.Tc ** 2 / c.Pc * (1 + c.m * (1 - np.sqrt(T / c.Tc))) ** 2
            aij = (1 - c.k) * np.sqrt(np.outer(ai, ai))
            a, b = x @ aij @ x, x @ c.b_i
            Z, _ = c.Z(T, P, x, phase)
            A, B = a * P / (R_GAS * T) ** 2, b * P / (R_GAS * T)
            br = c.b_i / b
            L = math.log((Z + c.d1 * B) / (Z + c.d2 * B))
            self.memo[key] = br * (Z - 1) - math.log(Z - B) - A / (B * (c.d1 - c.d2)) * (2 * (aij @ x) / a - br) * L
        return self.memo[key]

    def h_res(self, z, T, phase):
        """H - H_ideal gas in closed form, R T (Z - 1) + (T da/dT - a) / (b (d1 - d2)) ln((Z + d1 B)/(Z + d2 B)), the
        temperature derivative that reference_eos.Cubic.h_res takes numerically (they agree to about 1e-6 J/mol)."""
        c, P = self.cub, self.P * 1000
        sq = np.sqrt(T / c.Tc)
        ac = c.Oa * R_GAS ** 2 * c.Tc ** 2 / c.Pc
        ai = ac * (1 + c.m * (1 - sq)) ** 2
        dai = -ac * c.m * (1 + c.m * (1 - sq)) / np.sqrt(T * c.Tc)
        g = np.sqrt(np.outer(ai, ai))
        aij = (1 - c.k) * g
        daij = (1 - c.k) * (np.outer(dai, ai) + np.outer(ai, dai)) / (2 * g)
        a, da, b = z @ aij @ z, z @ daij @ z, z @ c.b_i
        Z, _ = c.Z(T, P, z, phase)
        B = b * P / (R_GAS * T)
        return R_GAS * T * (Z - 1) + (T * da - a) / (b * (c.d1 - c.d2)) * math.log((Z + c.d1 * B) / (Z + c.d2 * B))

    def K(self, x, T):
        x = np.clip(np.asarray(x, float), 1e-300, None); x = x / x.sum()
        lnL = self.lnphi(x, T, "liquid")
        y = x * np.exp(lnL - self.lnphi(x, T, "vapour"))
        last = math.inf
        for _ in range(500):
            K = np.exp(lnL - self.lnphi(y / y.sum(), T, "vapour"))
            yn = K * x
            step = np.max(np.abs(yn - y)) / np.sum(yn)
            if step <= 1e-15 or (step < 1e-12 and step >= last):    # converged, or at the rounding floor
                return K
            y, last = yn, step
        raise RuntimeError("the vapour composition of a stage did not converge")

    def lnfug_liquid(self, x, T):
        return np.log(x) + self.lnphi(x, T, "liquid")

    def bubble_T(self, x):
        """The bubble temperature, bracketed upwards in steps of 2 K from 40 K below Wilson's estimate (ln K_i =
        ln(Pc_i/P) + 5.373 (1 + omega_i)(1 - Tc_i/T)), below the temperatures where the two roots merge and K = 1 solves
        sum K x = 1 trivially."""
        x = np.asarray(x, float)
        c = self.cub
        f = lambda T: float(np.sum(self.K(x, T) * x)) - 1
        wilson = lambda T: float(np.sum(x * c.Pc / (self.P * 1000) * np.exp(5.373 * (1 + c.w) * (1 - c.Tc / T)))) - 1
        T = brentq(wilson, 50.0, float(np.max(c.Tc)), xtol=1e-6) - 40.0
        while f(T) > 0:
            T -= 40.0
        while f(T + 2.0) < 0:
            T += 2.0
            if T > 1000:
                raise RuntimeError("no bubble point found")
        return brentq(f, T, T + 2.0, xtol=1e-12)

    def h(self, z, T, phase):
        z = np.clip(np.asarray(z, float), 0, None); z = z / z.sum()
        key = ("h", phase, T, *z)
        if key not in self.memo:
            self.memo[key] = sum(zi * h_ig(c, T) for c, zi in zip(self.ids, z) if zi > 0) + self.h_res(z, T, phase)
        return self.memo[key]

    def hL(self, x, T):
        return 0.0 if self.lam is not None else self.h(x, T, "liquid")

    def hV(self, y, T):
        return self.lam if self.lam is not None else self.h(y, T, "vapour")

    feed_T = Activity.feed_T

    def feed_h(self, feed):
        z, T = np.asarray(feed["z"], float), self.feed_T(feed)
        return self.hL(z, T) if feed["q"] == 1 else self.hV(z, T)


def thermo_of(case):
    th, P = case["thermo"], case["pressure_kPa"]
    if th["kind"] == "constant-alpha":
        return Alpha(th, P)
    if th["model"] in ("PR", "SRK"):
        assert th["sets"] == "default"
        return Eos(case["components"], P, th["model"], th.get("cmo_latent_heat_J_mol"))
    assert th["model"] in ("NRTL", "UNIQUAC") and th["vapour"] == "ideal" and th["sets"] == "default"
    if case.get("phases", "VL") == "VLL":
        return ActivityVLL(case["components"], P, th["model"], th.get("cmo_latent_heat_J_mol"))
    return Activity(case["components"], P, th["model"], th.get("cmo_latent_heat_J_mol"))


def bubble_T(th, x, lo=200.0, hi=700.0):
    if hasattr(th, "bubble_T"):
        return th.bubble_T(x)
    return brentq(lambda T: float(np.sum(th.K(x, T) * x)) - 1, lo, hi, xtol=1e-12)


class Column:
    """The MESH system of one column. Unknowns per stage: x (nc), T, L, V (stage 1: V holds the distillate D);
    then Q_c and Q_r."""

    def __init__(self, th, nc, N, feeds, condenser, specs):
        """feeds: one or more (stage from the top, flow, z, molar enthalpy, q for the start)."""
        self.th, self.nc, self.N = th, nc, N
        self.feeds = [(f - 1, F, np.asarray(z, float), h, q) for f, F, z, h, q in feeds]
        self.F = sum(F for _, F, _, _, _ in self.feeds)
        self.z = sum(F * z for _, F, z, _, _ in self.feeds) / self.F
        self.f = self.feeds[0][0]
        self.total = condenser in ("total", "decanter")
        self.decanter = condenser == "decanter"
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
            if j == 1 and self.decanter:       # the reflux is the decanter's refluxed liquid, not the condensate
                xr = self.decanted(x[0], T[0])[0]
                m += L[0] * xr; e += L[0] * th.hL(xr, T[0])
            elif j > 0:
                m += L[j - 1] * x[j - 1]; e += L[j - 1] * hL[j - 1]
            if j < N - 1:
                m += V[j + 1] * y[j + 1]; e += V[j + 1] * hV[j + 1]
            for fj, Ff, zf, hf, _ in self.feeds:
                if j == fj:
                    m += Ff * zf; e += Ff * hf
            if j == 0 and self.decanter:       # the condensate x_1 splits: reflux L_1 of one liquid, distillate D of the other
                xr, xd, _ = self.decanted(x[0], T[0])
                m -= L[0] * xr + V[0] * xd; e -= L[0] * th.hL(xr, T[0]) + V[0] * th.hL(xd, T[0]) + Qc
            elif j == 0 and self.total:          # reflux L_1 and liquid distillate D = V slot, both x_1
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
            elif s["kind"] == "decanter_reflux":
                sp.append(L[0] - self.decanted(x[0], T[0])[2] * (L[0] + D))
            else:
                raise ValueError(f"specification {s['kind']} is not in this reference")
        return mat, summ, en, np.array(sp), y

    def decanted(self, x, T):
        """The decanter (condenser "decanter", spec decanter_reflux): the condensate x at its bubble point T splits into
        two liquids; all of the liquid richer in the spec's component is the reflux, all of the other the distillate.
        Returns (reflux composition, distillate composition, the reflux's share of the condensate). With one liquid
        (no split) the whole condensate would be refluxed: share 1, and both compositions x."""
        k = next(s["rich_in"] for s in self.specs if s["kind"] == "decanter_reflux")
        sp = self.th.split(x, T)
        if sp is None:
            return x, x, 1.0
        a, b, beta = sp
        return (a, b, 1 - beta) if a[k] > b[k] else (b, a, beta)

    def residual(self, u):
        mat, summ, en, sp, _ = self.groups(u)
        return np.concatenate([(mat / self.F).ravel(), summ.ravel(), en / (self.F * H_SCALE), sp / self.F])

    def start(self):
        th, N, nc, F, z = self.th, self.N, self.nc, self.F, self.z
        R = next((s["value"] for s in self.specs if s["kind"] == "reflux_ratio"), None)
        if R is None:
            R = next(s["start_reflux_ratio"] for s in self.specs if s["kind"] == "decanter_reflux")
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
        L, V = np.full(N, R * D), np.full(N, (R + 1) * D)   # constant molar overflow with each feed's q
        for fj, Ff, _, _, q in self.feeds:
            L[fj:] += q * Ff
            V[fj + 1:] -= (1 - q) * Ff
        L[-1], V[0] = B, D
        x, T = self.bubble_point_start(x, T, L, V)
        u = self.pack(x, T, L, V, 0.0, 0.0)
        _, _, en, _, _ = self.groups(u)
        x_, T_, L_, V_, _, _ = self.unpack(u)
        Qc = en[0]               # the duty that closes the condenser's balance at the start
        Qr = -en[-1]
        return self.pack(x_, T_, L_, V_, Qc, Qr)

    def bubble_point_start(self, x, T, L, V, sweeps=None):
        """The compositions and temperatures for the start's flows, by the bubble-point method (the component balances
        as one tridiagonal system per component at fixed K, then each stage's bubble temperature, repeated): only a
        first guess for the simultaneous solution, which closes every equation."""
        from scipy.linalg import solve_banded
        N, nc, F = self.N, self.nc, self.F
        sweeps = sweeps or (40 if hasattr(self.th, "split") else 300)   # two liquids: each sweep costs phase splits
        feed = np.zeros((N, nc))
        for fj, Ff, zf, _, _ in self.feeds:
            feed[fj] += Ff * zf
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
        """The finite-difference Jacobian, by groups of columns: a stage's equations involve only its own unknowns and
        those of the stages next to it (and the duties), so the unknowns of stages three apart are perturbed together
        (the last stage in a group of its own, as the specifications involve the first and the last stage)."""
        N, nc, w = self.N, self.nc, self.w
        J = np.zeros((len(r), len(u)))
        rows = lambda j: np.r_[j * nc:(j + 1) * nc, N * nc + 2 * j:N * nc + 2 * j + 2, N * nc + 2 * N + j]
        spec = np.arange(N * nc + 3 * N, len(r))
        colours = [[j for j in range(N - 1) if j % 3 == c] for c in range(3)] + [[N - 1]]
        for group in colours:
            for v in range(w):
                ks = [j * w + v for j in group]
                h = 1e-7 * np.maximum(1.0, np.abs(u[ks]))
                uu = u.copy(); uu[ks] += h
                d = self.residual(uu) - r
                for j, k, hk in zip(group, ks, h):
                    for jj in range(max(0, j - 1), min(N, j + 2)):
                        J[rows(jj), k] = d[rows(jj)] / hk
                    if j in (0, N - 1):
                        J[spec, k] = d[spec] / hk
        for k in (len(u) - 2, len(u) - 1):     # the duties
            h = 1e-7 * max(1.0, abs(u[k]))
            uu = u.copy(); uu[k] += h
            J[:, k] = (self.residual(uu) - r) / h
        return J

    def safe_residual(self, u):
        """The residuals, or large ones where a trial point leaves the records' ranges (for scipy's root)."""
        try:
            return self.residual(u)
        except (OverflowError, ValueError, FloatingPointError, NotImplementedError, RuntimeError, AssertionError):
            return np.full(len(u), 1e6)

    def norm(self, u):
        """The 2-norm of the scaled residuals, or infinity where a trial step leaves the physical domain (T <= 0,
        or outside a record's range)."""
        try:
            return float(np.linalg.norm(self.residual(u)))
        except (OverflowError, ValueError, FloatingPointError, NotImplementedError, RuntimeError, AssertionError):
            return math.inf     # outside a record's range (iapws), or a liquid split that fails there

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
        if hasattr(self.th, "split"):           # two liquids on the stages: each stage's liquids
            for j, st in enumerate(stages):
                ll = self.th.split(x[j], T[j])
                st["liquids"] = None if ll is None else {"x_I": ll[0].tolist(), "x_II": ll[1].tolist(), "beta_II": float(ll[2])}
        if self.decanter:
            xr, xd, share = self.decanted(x[0], T[0])
            xD = xd
            stages[0]["decanter"] = {"reflux_x": xr.tolist(), "distillate_x": xd.tolist(), "reflux_share_of_condensate": share}
        return {"stages": stages, "D_mol_s": D, "B_mol_s": B, "x_D": xD.tolist(), "x_B": x[-1].tolist(),
                "Q_condenser_W": Qc, "Q_reboiler_W": Qr, "feed_enthalpy_J_mol": [h for _, _, _, h, _ in self.feeds],
                "residuals": {"material_mol_s": float(np.abs(mat).max()), "summation": float(np.abs(summ).max()),
                              "equilibrium": float(max(s["residuals"]["equilibrium"] for s in stages)),
                              "energy_W": float(np.abs(en).max()), "specifications_mol_s": float(np.abs(sp).max())},
                "solver": info}


def feeds_of(case):
    """The case's feeds: column.feed (one) or column.feeds (several)."""
    col = case["column"]
    return col["feeds"] if "feeds" in col else [col["feed"]]


def column_of(case, th=None, specs=None, stages=None, feed_stage=None):
    th = th or thermo_of(case)
    col = case["column"]
    nc = len(case["components"])
    feeds = [((feed_stage if feed_stage and k == 0 else f["stage"]), f["flow_mol_s"], f["z"], th.feed_h(f), f.get("q", 1.0))
             for k, f in enumerate(feeds_of(case))]
    specs = [dict(s, rich_in=case["components"].index(s["rich_in"])) if s["kind"] == "decanter_reflux" else s
             for s in (specs or case["specs"])]       # the decanter's component by its index
    return Column(th, nc, stages or col["stages"], feeds, col["condenser"], specs)


def solve_case(case, u0=None, **kw):
    """Solve a case; u0, a solution of the same column with other specifications, is the start when given."""
    c = column_of(case, **kw)
    u, info = c.solve(c.start() if u0 is None else u0)
    return c, u, c.profile(u, info)


def mccabe_thiele(case, prof):
    """McCabe-Thiele's construction from x_D, with the column's own flows (constant molar overflow): step down from the
    condenser by the equilibrium curve and the operating line of each section (a balance from the top to stage j:
    V_{j+1} y_{j+1} = L_j x_j + D x_D - the feeds on stages 1..j); the construction must equal the profile."""
    a = case["thermo"]["alpha"][0] / case["thermo"]["alpha"][1]
    st, feeds = prof["stages"], feeds_of(case)
    D, xD = prof["D_mol_s"], prof["x_D"][0]
    x, out = xD, [xD]
    for j in range(1, len(st)):              # stage j+1 receives liquid x_j from stage j
        fed = sum(f["flow_mol_s"] * f["z"][0] for f in feeds if f["stage"] <= j)
        y = (st[j - 1]["L_mol_s"] * x + D * xD - fed) / st[j]["V_mol_s"]
        x = y / (a - (a - 1) * y)
        out.append(x)
    dev = max(abs(out[j] - st[j]["x"][0]) for j in range(len(st)))
    return {"x_A_by_stage": out, "max_deviation_from_profile": dev, "tolerance": 1e-9,
            "why": "an exact construction for constant relative volatility and constant molar overflow: only rounding"}


def stability(th, x, T):
    """The liquid's phase stability by the tangent-plane distance, tpd(w) = sum w_i [ln f_i(w) - ln f_i(x)] / (R T)
    per mole of trial phase, with ln f_i = ln x_i + ln gamma_i (activity models) or ln x_i + ln phi_i of the liquid root
    (equations of state; the common ln P cancels): negative for some trial w means a second liquid forms (the
    tangent-plane criterion; both trial and stage are liquids at the same T and P). Binary: a grid of 20001 trial compositions;
    more components: a minimum from each near-pure start. Returns (smallest tpd, its trial composition)."""
    x = np.asarray(x, float)
    lnf = th.lnfug_liquid(x, T)
    tpd = lambda w: float(np.sum(w * (th.lnfug_liquid(w, T) - lnf)))
    if len(x) == 2:
        best = (math.inf, None)
        for w1 in np.linspace(1e-5, 1 - 1e-5, 20001):
            t = tpd(np.array([w1, 1 - w1]))
            if t < best[0]:
                best = (t, [w1, 1 - w1])
        return best
    from scipy.optimize import minimize
    soft = lambda u: np.exp(u - u.max()) / np.sum(np.exp(u - u.max()))
    best = (math.inf, None)
    for i in range(len(x)):
        u0 = np.full(len(x), math.log(1e-3)); u0[i] = 0.0
        r = minimize(lambda u: tpd(soft(u)), u0, method="Nelder-Mead", options={"xatol": 1e-10, "fatol": 1e-14, "maxiter": 20000})
        if r.fun < best[0]:
            best = (float(r.fun), soft(r.x).tolist())
    return best


def stability_by_stage(th, prof):
    return [{"stage": s["stage"], "tpd_min": t, "trial_x": w} for s in prof["stages"] for t, w in [stability(th, s["x"], s["T_K"])]]


# ---- The boundary between two property methods (proposal 0015, Part I, section 3; milestone M2b) ----

def K_xy(th, x, y, T):
    """K at liquid x and vapour y: gamma p_sat / P (activity model, ideal-gas vapour), or phi_L(x) / phi_V(y)."""
    if isinstance(th, Eos):
        n = lambda v: np.clip(np.asarray(v, float), 1e-300, None) / np.sum(np.clip(v, 1e-300, None))
        return np.exp(th.lnphi(n(x), T, "liquid") - th.lnphi(n(y), T, "vapour"))
    return Activity.K(th, x, T)


def dew_T(th, z):
    """The dew temperature of vapour z: sum z_i / K_i(x, z, T) = 1, with x = (z / K) / sum by successive substitution."""
    z = np.asarray(z, float)

    def f(T):
        x = z / K_xy(th, z, z, T); x = x / x.sum()
        for _ in range(500):
            xn = z / K_xy(th, x, z, T)
            s = xn.sum(); xn = xn / s
            if np.max(np.abs(xn - x)) < 1e-15:
                break
            x = xn
        return s - 1
    Tb = bubble_T(th, z)
    T = Tb + 1.0
    while f(T) > 0:
        T += 1.0
    return brentq(f, T - 1.0, T, xtol=1e-12)


def tp_flash(th, z, T):
    """The vapour-liquid state of z at T and the column's pressure: (vapour fraction, x, y). Between the bubble and
    the dew temperature, successive substitution on K(x, y, T) with the Rachford-Rice equation, to 1e-14."""
    z = np.asarray(z, float)
    Tb, Td = bubble_T(th, z), dew_T(th, z)
    if T <= Tb:
        return 0.0, z, None
    if T >= Td:
        return 1.0, None, z
    v = (T - Tb) / (Td - Tb)
    x, y = z.copy(), z.copy()
    K = K_xy(th, x, y, T)
    for _ in range(5000):
        g = lambda b: float(np.sum(z * (K - 1) / (1 + b * (K - 1))))
        v = brentq(g, 0.0, 1.0, xtol=1e-15)
        xn = z / (1 + v * (K - 1)); yn = K * xn
        step = max(np.max(np.abs(xn - x)), np.max(np.abs(yn - y)))
        x, y = xn, yn
        K = K_xy(th, x, y, T)
        if step < 1e-14:
            break
    return v, x, y


def h_state(th, z, T):
    v, x, y = tp_flash(th, z, T)
    return (1 - v) * (th.hL(x, T) if v < 1 else 0.0) + v * (th.hV(y, T) if v > 0 else 0.0), v, x, y


def ph_flash(th, z, h, lo, hi):
    """The P-H flash in a method: the temperature where the molar enthalpy of z (its equilibrium state at the column's
    pressure) equals h, by brentq between lo and hi K, to 1e-10 K. Raises ValueError where h lies outside [h(lo),
    h(hi)]: the method cannot represent that state there."""
    f = lambda T: h_state(th, z, T)[0] - h
    if f(lo) > 0 or f(hi) < 0:
        raise ValueError(f"no temperature between {lo} and {hi} K gives the enthalpy {h} J/mol")
    T = brentq(f, lo, hi, xtol=1e-10, rtol=1e-15)
    hh, v, x, y = h_state(th, z, T)
    return {"T_K": T, "vapour_fraction": v, "x": None if x is None else list(x), "y": None if y is None else list(y),
            "h_J_mol": hh}


def flowsheet_thermo(case):
    ft = case["flowsheet_thermo"]
    if ft["model"] in ("PR", "SRK"):
        return Eos(case["components"], case["pressure_kPa"], ft["model"])
    return Activity(case["components"], case["pressure_kPa"], ft["model"])


def boundary_case(case, recycle=None):
    """G cases: the feed, given in the flowsheet's method, crosses into the column's method with its component flows,
    pressure and enthalpy flow (P-H flash in the column's method); the column is solved in its own method; each
    product crosses back the same way. With recycle (a share of the bottoms mixed with the fresh feed in the
    flowsheet's method), the loop is converged by direct substitution on the recycled stream's flows and enthalpy."""
    fs, col_th = flowsheet_thermo(case), thermo_of(case)
    f = case["column"]["feed"]
    lo, hi = case["boundary"]["T_search_K"]
    z, F = np.asarray(f["z"], float), f["flow_mol_s"]
    h_fresh = fs.hL(z, f["T_K"])
    assert np.sum(K_xy(fs, z, z, f["T_K"]) * z) < 1, "the fresh feed is a liquid in the flowsheet's method"
    rec = {"fresh_feed": {"T_K": f["T_K"], "h_flowsheet_J_mol": h_fresh,
                          "h_column_method_at_same_T_J_mol": col_th.hL(z, f["T_K"])}}
    n_r, h_r, u, it = np.zeros(len(z)), 0.0, None, 0
    while True:
        it += 1
        n = F * z + n_r
        Ft = n.sum(); zt = n / Ft
        H = F * h_fresh + h_r                              # the enthalpy flow (W) of the column's feed
        into = ph_flash(col_th, zt, H / Ft, lo, hi)
        assert into["vapour_fraction"] == 0.0, "the column's feed is a liquid in the column's method"
        c = json.loads(json.dumps(case))
        c["column"]["feed"] = {"stage": f["stage"], "flow_mol_s": Ft, "z": list(zt), "T_K": into["T_K"]}
        if recycle:
            c["specs"] = [case["specs"][0], {"kind": "bottoms_flow_mol_s", "value": case["specs"][1]["value"] + recycle_flow(n_r)}]
        cc, u, prof = solve_case(c, u0=u)
        B, xB = prof["B_mol_s"], np.asarray(prof["x_B"])
        hB = cc.th.hL(xB, prof["stages"][-1]["T_K"])
        if not recycle:
            break
        n_new = recycle * B * xB
        h_new = recycle * B * hB
        done = np.max(np.abs(n_new - n_r)) < 1e-11 * F and abs(h_new - h_r) < 1e-11 * F * H_SCALE
        n_r, h_r = n_new, h_new
        if done:
            break
        if it > 200:
            raise RuntimeError("the recycle did not converge")
    D, xD = prof["D_mol_s"], np.asarray(prof["x_D"])
    hD = cc.th.hL(xD, prof["stages"][0]["T_K"])
    share = 1 - (recycle or 0.0)
    out = {"distillate": (D, xD, hD, prof["stages"][0]["T_K"]), "bottoms": (share * B, xB, hB, prof["stages"][-1]["T_K"])}
    rec["column_feed"] = {"flow_mol_s": Ft, "z": list(zt), "H_W": H, "column_method": into}
    rec["recycle"] = None if not recycle else {"share_of_bottoms": recycle, "flow_mol_s": float(n_r.sum()),
                                               "z": list(n_r / n_r.sum()), "H_W": h_r, "iterations": it}
    rec["products"] = {}
    for name, (Fp, xp, hp, Tp) in out.items():
        back = ph_flash(fs, xp, hp, lo, hi)
        rec["products"][name] = {"flow_mol_s": Fp, "z": list(xp), "column_method": {"T_K": Tp, "h_J_mol": hp},
                                 "flowsheet_method": back, "dT_K": back["T_K"] - Tp,
                                 "h_flowsheet_at_column_T_J_mol": h_state(fs, xp, Tp)[0]}
    Qc, Qr = prof["Q_condenser_W"], prof["Q_reboiler_W"]
    H_out = sum(p["flow_mol_s"] * p["flowsheet_method"]["h_J_mol"] for p in rec["products"].values())
    rec["energy"] = {"in_W": F * h_fresh + Qr - Qc, "out_W": H_out, "imbalance_W": F * h_fresh + Qr - Qc - H_out,
                     "Q_condenser_W": Qc, "Q_reboiler_W": Qr,
                     "imbalance_if_recalculated_at_same_T_W": F * (h_fresh - col_th.hL(z, f["T_K"])) * (0 if recycle else 1)
                     + sum(p["flow_mol_s"] * (p["h_flowsheet_at_column_T_J_mol"] - p["column_method"]["h_J_mol"]) for p in rec["products"].values()),
                     "why": "the boundary keeps the enthalpy flow, so the flowsheet's balance closes to the P-H flashes' "
                            "tolerance; recalculating each stream at the same T in the other method would create or lose the "
                            "energy shown (for information)"}
    return cc, prof, rec


def boundary_record(case):
    """A G case's boundary record: the crossings, the column (in the column's method) and the overall energy balance in
    the flowsheet's method; or, where the column's method cannot represent the feed, the refusal's numbers."""
    fs, col_th = flowsheet_thermo(case), thermo_of(case)
    f = case["column"]["feed"]
    lo, hi = case["boundary"]["T_search_K"]
    z = np.asarray(f["z"], float)
    h = fs.hL(z, f["T_K"])
    try:
        ph_flash(col_th, z, h, lo, hi)
    except ValueError as e:
        return {"refusal": {"feed_T_K": f["T_K"], "h_flowsheet_J_mol": h, "column_method_lowest_T_K": lo,
                            "h_column_method_at_lowest_T_J_mol": h_state(col_th, z, lo)[0], "reason": str(e)}}
    rs = case.get("recycle", {}).get("share_of_bottoms")
    _, prof, rec = boundary_case(case, recycle=rs)
    rec["round_trip"] = round_trip(fs, col_th, z, f["T_K"], lo, hi)
    rec["rigorous"] = prof
    return rec


def round_trip(a, b, z, T, lo, hi):
    """A stream at T in method a crosses to b and back: the temperature it returns at."""
    h = h_state(a, z, T)[0]
    tb = ph_flash(b, z, h, lo, hi)
    back = ph_flash(a, z, tb["h_J_mol"], lo, hi)
    return {"T_K": T, "T_in_other_method_K": tb["T_K"], "T_back_K": back["T_K"], "difference_K": back["T_K"] - T}


def split_record(th, z, T):
    sp = th.split(np.asarray(z, float), T)
    return None if sp is None else {"x_I": sp[0].tolist(), "x_II": sp[1].tolist(), "beta_II": float(sp[2])}


def liquid_stability(th, prof):
    """With two liquids on the stages: the tangent-plane test of each liquid that the reference keeps (a stage's one
    liquid, or each of its two), which must all be stable."""
    out = []
    for s in prof["stages"]:
        liq = [s["x"]] if s["liquids"] is None else [s["liquids"]["x_I"], s["liquids"]["x_II"]]
        out.append({"stage": s["stage"], "tpd_min": [stability(th, x, s["T_K"])[0] for x in liq]})
    return out


def recycle_flow(n_r):
    return float(np.sum(n_r))


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
        if cid in RIGOROUS:
            c, u, prof = solve_case(case)
            rec["rigorous"] = prof
            checks = rec["checks"] = {}
            if case["thermo"]["kind"] == "chepta":
                checks["stability"] = stability_by_stage(c.th, prof)
                checks["feed_T_K"] = [c.th.feed_T(f) if "q" in f else f["T_K"] for f in feeds_of(case)]
            if cid == "F1-butanol-water-two-liquids":      # milestone M2b: the same column with two liquids on the stages
                vll = dict(case, phases="VLL")
                c2, _, rec["rigorous_VLL"] = solve_case(vll)
                checks["stability_VLL"] = liquid_stability(c2.th, rec["rigorous_VLL"])
                checks["feed_T_K_VLL"] = [c2.th.feed_T(f) for f in feeds_of(vll)]
            if case.get("phases") == "VLL":
                checks["stability"] = liquid_stability(c.th, prof)
                checks["feed_liquids"] = [split_record(c.th, f["z"], T) for f, T in zip(feeds_of(case), checks["feed_T_K"])]
                checks["liquid_liquid_split_by_stage"] = [s["liquids"] is not None for s in prof["stages"]]
            if cid == "A4-binary-two-feeds":
                checks["mccabe_thiele"] = mccabe_thiele(case, prof)
            if cid == "B2-chemsep-benzene-toluene":
                checks["published"] = published_comparison(case, c, prof)
            if cid == "B3-acetone-methanol-azeotrope":
                xa, Ta = model_azeotrope(c.th, 0.5, 0.95)
                checks["azeotrope"] = {"model_x_acetone": xa, "model_T_K": Ta, "x_D_acetone": prof["x_D"][0],
                                       "measured_for_information": {"x_acetone": 0.8, "T_K": 55.7 + 273.15,
                                                                   "source": "validation/data/azeotropes_101kPa.json (acetone + methanol)"}}
            if cid == "P1-performance-alcohols-water":
                checks["reference_seconds_for_information"] = prof["solver"]["seconds"]
                _, _, rec["rigorous_warm"] = solve_case(case, u0=u, specs=case["performance"]["warm_specs"])
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
        if cid in BOUNDARY:
            rec["boundary"] = boundary_record(case)
            if "rigorous" in rec["boundary"]:
                rec["rigorous"] = rec["boundary"].pop("rigorous")
                rec["checks"] = {"feed_T_K": [rec["boundary"]["column_feed"]["column_method"]["T_K"]]}
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
        if cid == "E4-iteration-limit":
            rec["checks"] = {"same_column_as": "B1-ethanol-water-nrtl",
                             "reference_iterations": out["cases"]["B1-ethanol-water-nrtl"]["rigorous"]["solver"]}
        if cid == "E3-purity-above-azeotrope":
            rec["checks"] = {"azeotrope_from": "B1-ethanol-water-nrtl", "purity": 0.95}
        out["cases"][cid] = rec
    OUT.write_text(json.dumps(out, indent=1, default=float) + "\n")
    print("wrote", OUT)


RIGOROUS = ("A1-binary-alpha", "A3-ternary-partial-condenser", "A4-binary-two-feeds", "B1-ethanol-water-nrtl",
            "B2-chemsep-benzene-toluene", "B3-acetone-methanol-azeotrope", "D1-dry-stage", "F1-butanol-water-two-liquids",
            "F2-butanol-water-decanter", "F3-ethyl-acetate-ethanol-water-some-stages", "P1-performance-alcohols-water")
BOUNDARY = {"G1-own-method-boundary": None, "G2-own-method-recycle": "recycle", "G3-own-method-cannot-represent": None}


def model_azeotrope(th, lo, hi):
    """The binary's azeotrope in the model (K_1 = K_2 at the bubble point) between x_1 = lo and hi."""
    f = lambda x: (lambda K: K[0] / K[1] - 1)(th.K(np.array([x, 1 - x]), bubble_T(th, np.array([x, 1 - x]))))
    xa = brentq(f, lo, hi, xtol=1e-12)
    return xa, bubble_T(th, np.array([xa, 1 - xa]))


def published_comparison(case, c, prof):
    """B2: the reference on CHEPTA's method against the published profile, and the same with constant molar overflow
    (the published example's enthalpy model), to tell the K-values' share of the difference from the energy balances';
    and CHEPTA's K of benzene at the published stage compositions and temperatures against the published K."""
    pub = case["published"]
    cmo = json.loads(json.dumps(case)); cmo["thermo"]["cmo_latent_heat_J_mol"] = 30000.0
    _, _, p_cmo = solve_case(cmo)

    def diff(p):
        dT = [s["T_K"] - 273.15 - t for s, t in zip(p["stages"], pub["T_C"])]
        dx = [s["x"][0] - x for s, x in zip(p["stages"], pub["x_benzene"])]
        return {"dT_K": dT, "dx_benzene": dx, "max_abs_dT_K": max(map(abs, dT)), "max_abs_dx": max(map(abs, dx)),
                "dx_D": p["x_D"][0] - pub["x_D"][0], "dx_B": p["x_B"][0] - pub["x_B"][0]}
    K = [float(c.th.K(np.array([x, 1 - x]), t + 273.15)[0]) for x, t in zip(pub["x_benzene"], pub["T_C"])]
    return {"chepta_method": diff(prof), "constant_molar_overflow": diff(p_cmo),
            "K_benzene_chepta_at_published_x_T": K,
            "K_relative_difference_from_published_y_over_x": [k * x / y - 1 for k, x, y in zip(K, pub["x_benzene"], pub["y_benzene"])],
            "K_relative_difference_from_published_K": [k / kp - 1 for k, kp in zip(K, pub["K_benzene"])],
            "note": "For information and for the agreement tolerances of the case; the published numbers come from "
                    "another property method (UNIFAC, ChemSep's Antoine equations, constant molar overflow)."}


def case_with(case, N, fstage):
    c = json.loads(json.dumps(case))
    c["column"]["stages"], c["column"]["feed"]["stage"] = N, fstage
    return c


if __name__ == "__main__":
    main()
