"""
Independent reference for columns without a condenser (proposal 0015, Part I, section 1; milestone M3, step 7, W2's
task): an absorber (no condenser, no reboiler: a liquid fed at the top, a gas at the bottom) and a stripper (no
condenser; a reboiler or none). It is W7's MESH system of reference_mesh.py (reference_mesh.Column, unchanged: x, T, L, V
of every stage and the two duties, solved together by Newton's method, then scipy's hybrid and Levenberg-Marquardt
methods where Newton stalls), with:
  - stage 1 an equilibrium stage whose vapour V_1 is the top product (Column's "partial" top), and the condenser duty
    held at zero (an equation Q_c = 0 in place of a specification);
  - without a reboiler, the reboiler duty held at zero (Q_r = 0), so stage N is an adiabatic equilibrium stage whose
    liquid is the bottoms; with one, one specification (the boil-up ratio V_N / B, or the bottoms flow);
  - feeds given by their temperature and phase (a liquid below its bubble point, a gas above its dew point), their
    enthalpy that phase's at T.
Written by W2 because W7's M3 cases were not on main when this task was done (2026-10-30). It shares no code with the
JavaScript engine (src/units/columns/).

The cases (W2's): a lean-oil absorber (methane, ethane, propane, n-butane washed by n-decane, Peng-Robinson, 6 stages,
2758 kPa); a live-steam stripper (ethanol from water, NRTL, 8 stages); a reboiled stripper (the same feed, no steam, a
boil-up ratio of 0.15). Writes validation/fixtures/columns-open.json, which test/columns-open.test.js reads.
Regenerate: python validation/python/reference_mesh_open.py      (numpy, scipy, thermo)
"""
import json
from pathlib import Path

import numpy as np

from reference_mesh import Activity, Column, Eos, H_SCALE, bubble_T

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "validation" / "fixtures" / "columns-open.json"


class OpenColumn(Column):
    """reference_mesh.Column without a condenser (and without a reboiler, or with one and one specification)."""

    def __init__(self, th, nc, N, feeds, reboiler, specs, feed_T):
        super().__init__(th, nc, N, feeds, "partial", [])
        self.reboiled = reboiler == "partial"
        self.open_specs = specs
        self.feed_T = feed_T

    def groups(self, u):
        mat, summ, en, _, y = super().groups(u)          # self.specs is empty: only the stages' equations
        x, T, L, V, Qc, Qr = self.unpack(u)
        sp = [Qc / H_SCALE]                              # no condenser (residual divides by F: Q / (F H_SCALE))
        if not self.reboiled:
            sp.append(Qr / H_SCALE)                      # no reboiler
        for s in self.open_specs:
            if s["kind"] == "boilup_ratio":
                sp.append(V[-1] - s["value"] * L[-1])
            elif s["kind"] == "bottoms_flow_mol_s":
                sp.append(L[-1] - s["value"])
            else:
                raise ValueError(s["kind"])
        return mat, summ, en, np.array(sp), y

    def start(self):
        th, N, nc, F = self.th, self.N, self.nc, self.F
        L, V = np.zeros(N), np.zeros(N)
        liquid = np.zeros(nc)
        for fj, Ff, zf, _, q in self.feeds:
            L[fj:] += q * Ff
            V[:fj + 1] += (1 - q) * Ff
            liquid += q * Ff * zf + 0.05 * (1 - q) * Ff * zf
        if self.reboiled:
            V += next(s["value"] for s in self.open_specs if s["kind"] == "boilup_ratio") * 0.9 * L[-1]
        L, V = np.maximum(L, 0.01 * F), np.maximum(V, 0.01 * F)
        x = np.tile(liquid / liquid.sum(), (N, 1))
        # the temperatures held between the feeds' (the bubble-point method's temperatures are far off in an absorber,
        # whose stages are set by the energy balances); the compositions from the component balances at those K-values
        T = np.linspace(self.feed_T[0], self.feed_T[-1], N)
        from scipy.linalg import solve_banded
        feed = np.zeros((N, nc))
        for fj, Ff, zf, _, _ in self.feeds:
            feed[fj] += Ff * zf
        def Kstart(xj, Tj):
            # an equation of state: Wilson's K-values (ln K = ln(Pc/P) + 5.373 (1 + omega)(1 - Tc/T)), since the cubic's
            # own K-values at a gas-like trial liquid are all near 1 (one root: the trivial solution)
            if isinstance(th, Eos):
                cb = th.cub
                return cb.Pc / (th.P * 1000) * np.exp(5.373 * (1 + cb.w) * (1 - cb.Tc / Tj))
            return th.K(xj, Tj)
        for _ in range(50):
            K = np.array([Kstart(x[j], T[j]) for j in range(N)])
            xn = np.empty_like(x)
            for i in range(nc):
                ab = np.zeros((3, N))
                ab[0, 1:] = V[1:] * K[1:, i]
                ab[1] = -(L + V * K[:, i])
                ab[2, :-1] = L[:-1]
                xn[:, i] = solve_banded((1, 1), ab, -feed[:, i])
            xn = np.clip(xn, 1e-300, None)
            xn /= xn.sum(axis=1, keepdims=True)
            done = np.max(np.abs(xn - x)) < 1e-12
            x = xn
            if done:
                break
        return self.pack(x, T, L, V, 0.0, 0.0)


class EosStart(Eos):
    """reference_mesh.Eos whose stage vapour starts from Wilson's K-values: its own successive substitution starts at
    y = x K(x, x), which is the trivial solution K = 1 where the cubic has one root at the liquid's composition (a
    decane-rich liquid in an absorber). The same equations, phi_L(x) / phi_V(y) at the converged y."""

    def K(self, x, T):
        x = np.clip(np.asarray(x, float), 1e-300, None); x = x / x.sum()
        c = self.cub
        lnL = self.lnphi(x, T, "liquid")
        y = x * c.Pc / (self.P * 1000) * np.exp(5.373 * (1 + c.w) * (1 - c.Tc / T))
        last = np.inf
        for _ in range(2000):
            K = np.exp(lnL - self.lnphi(y / y.sum(), T, "vapour"))
            yn = K * x
            step = np.max(np.abs(yn - y)) / np.sum(yn)
            if step <= 1e-15 or (step < 1e-12 and step >= last):
                return K
            y, last = yn, step
        raise RuntimeError("the vapour composition of a stage did not converge")


def feed(th, stage, flows, T, phase):
    flows = np.asarray(flows, float)
    F = flows.sum()
    z = flows / F
    h = th.hL(z, T) if phase == "liquid" else th.hV(z, T)
    return (stage, F, z.tolist(), h, 1.0 if phase == "liquid" else 0.0)


CASES = [
    {"id": "W2-ABS1-lean-oil", "title": "A lean-oil absorber: methane, ethane, propane and n-butane washed by n-decane, Peng-Robinson, 6 stages, 2758 kPa",
     "method_choice": "docs/METHOD_SELECTION.md rule 1: hydrocarbons at 28 bar, Peng-Robinson for both phases (the databank's k_ij, 0 where there is none)",
     "components": ["methane", "ethane", "propane", "n-butane", "n-decane"], "model": "PR", "pressure_kPa": 2758.0,
     "stages": 6, "reboiler": "none", "specs": [],
     "feeds": [{"stage": 1, "flows_mol_s": [0, 0, 0, 0, 30], "T_K": 305.4, "phase": "liquid"},
               {"stage": 6, "flows_mol_s": [85, 8, 5, 2, 0], "T_K": 305.4, "phase": "vapour"}]},
    {"id": "W2-STR1-steam-stripper", "title": "Live-steam stripping of ethanol from water, NRTL, 8 stages, 101.325 kPa",
     "method_choice": "docs/METHOD_SELECTION.md rule 3: polar, below 10 bar, NRTL with the default (fitted) set, ideal-gas vapour",
     "components": ["ethanol", "water"], "model": "NRTL", "pressure_kPa": 101.325, "stages": 8, "reboiler": "none", "specs": [],
     "feeds": [{"stage": 1, "flows_mol_s": [2, 98], "T_K": 360.0, "phase": "liquid"},
               {"stage": 8, "flows_mol_s": [0, 15], "T_K": 385.0, "phase": "vapour"}]},
    {"id": "W2-STR2-reboiled-stripper", "title": "A reboiled stripper: the same feed, no steam, a boil-up ratio of 0.15, NRTL, 8 stages",
     "method_choice": "as W2-STR1",
     "components": ["ethanol", "water"], "model": "NRTL", "pressure_kPa": 101.325, "stages": 8, "reboiler": "partial",
     "specs": [{"kind": "boilup_ratio", "value": 0.15}],
     "feeds": [{"stage": 1, "flows_mol_s": [2, 98], "T_K": 360.0, "phase": "liquid"}]},
]


def main():
    out = {"_about": "Written by validation/python/reference_mesh_open.py (W2's independent reference for columns without a "
                     "condenser, on reference_mesh.py's MESH equations). Converged reference profiles are not validated "
                     "against data.", "H_scale_J_mol": H_SCALE, "cases": {}}
    for case in CASES:
        print(case["id"], flush=True)
        P = case["pressure_kPa"]
        th = EosStart(case["components"], P, "PR") if case["model"] == "PR" else Activity(case["components"], P, case["model"])
        feeds = [feed(th, f["stage"], f["flows_mol_s"], f["T_K"], f["phase"]) for f in case["feeds"]]
        c = OpenColumn(th, len(case["components"]), case["stages"], feeds, case["reboiler"], case["specs"], [f["T_K"] for f in case["feeds"]])
        u, info = c.solve(c.start())
        prof = c.profile(u, info)
        prof["feed_enthalpy_J_mol"] = [f[3] for f in feeds]
        out["cases"][case["id"]] = {"case": case, "rigorous": prof}
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
