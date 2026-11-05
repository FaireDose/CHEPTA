"""
Independent reference for the liquid-liquid cascade of the column engine (src/units/columns/extraction.js; proposal
0015, milestone M3, step 8): a countercurrent extraction of N equilibrium stages at one temperature, written anew with
numpy and scipy from the same equations, sharing no code with the engine.

    python validation/python/reference_extraction.py      # writes validation/fixtures/extraction.json

Stage j (1..N) holds two liquids: the raffinate (flowing from stage 1 to N; the feed enters stage 1) and the extract
(flowing from N to 1; the solvent enters stage N). Unknowns: the component flows of both liquids leaving every stage.
Equations: the component balances, and equal activities of every component in the two liquids,
x_ij gamma_i(x_j) = y_ij gamma_i(y_j). The activity coefficients are those of validation/python/reference_model.py
(NRTL, UNIQUAC) with the parameter sets named in each case. Solved by scipy's least_squares (trust region) in the
logarithms of the flows, from a start of this script's own: the stage-by-stage method (each stage a liquid-liquid
flash of what enters it, swept until the flows stop changing), then the full system.
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares

sys.path.insert(0, str(Path(__file__).resolve().parent))
from reference_model import System, ALL_BINARIES  # noqa: E402
from scipy.optimize import brentq  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "extraction.json"
IDS = ["water", "acetic-acid", "ethyl-acetate"]
SET = "fitted-lle-roque2018"

# (model, set, N, T_K, feed mol/s, solvent mol/s)
CASES = [
    ("NRTL", SET, 1, 298.15, [0.9, 0.1, 0.0], [0.0, 0.0, 1.0]),
    ("NRTL", SET, 3, 298.15, [0.9, 0.1, 0.0], [0.0, 0.0, 1.0]),
    ("NRTL", SET, 6, 298.15, [0.9, 0.1, 0.0], [0.0, 0.0, 1.0]),
    ("NRTL", SET, 4, 303.15, [0.95, 0.05, 0.0], [0.0, 0.0, 0.5]),
    ("NRTL", SET, 5, 293.15, [0.88, 0.12, 0.0], [0.01, 0.0, 0.8]),
    ("UNIQUAC", SET, 4, 298.15, [0.9, 0.1, 0.0], [0.0, 0.0, 1.0]),
]


def split_ll(s, z, T, K):
    """Two liquids of feed z at T by successive substitution on K = gamma(I) / gamma(II) with Rachford-Rice over the
    components present; (x_I, x_II) or None (one liquid)."""
    K = np.clip(np.asarray(K, float), 1e-8, 1e8)
    on = z > 0
    for _ in range(3000):
        Ka = K[on]
        if Ka.max() <= 1 or Ka.min() >= 1:
            return None
        rr = lambda b: np.sum(z[on] * (Ka - 1) / (1 + b * (Ka - 1)))
        b = brentq(rr, 1 / (1 - Ka.max()) + 1e-12, 1 / (1 - Ka.min()) - 1e-12, xtol=1e-15)
        x1 = np.where(on, z / (1 + b * (K - 1)), 0.0)
        x2 = K * x1
        x1, x2 = x1 / x1.sum(), x2 / x2.sum()
        Kn = np.where(on, s.gamma(x1, T) / s.gamma(x2, T), K)
        if np.sum(np.log(Kn[on]) ** 2) < 1e-10:
            return None
        if np.max(np.abs(np.log(Kn[on] / K[on]))) < 1e-12:
            return x1, x2
        K = Kn
    return None


def system(model, set_name):
    ps = [p for p in ALL_BINARIES if p["model"] == model and p.get("set") == set_name and p["i"] in IDS and p["j"] in IDS]
    assert len(ps) == 3, (model, set_name)
    return System(IDS, model, params=ps)


def stagewise(s, N, T, feed, solv, sweeps=400):
    """The start: each stage a liquid-liquid flash of what enters it (raffinate from above, extract from below)."""
    feed, solv = np.array(feed, float), np.array(solv, float)
    R = np.tile(feed, (N, 1)) * 0.9 + 1e-9
    E = np.tile(solv, (N, 1)) + 1e-9
    K = None
    zall = (feed + solv) / (feed + solv).sum()
    for K0 in ([0.25, 3.0, 30.0], [0.1, 1.5, 100.0], [0.5, 2.0, 10.0]):   # water, acid, ester: guesses for the first split
        try:
            o = split_ll(s, zall, T, np.array(K0))
        except ValueError:
            o = None
        if o is not None:
            x1, x2 = o if o[0][0] > o[1][0] else (o[1], o[0])
            K = x2 / x1
            break
    if K is None:
        raise RuntimeError("the mixed feeds make one liquid")
    for _ in range(sweeps):
        Rn, En = R.copy(), E.copy()
        for j in range(N):
            zin = (feed if j == 0 else Rn[j - 1]) + (solv if j == N - 1 else E[j + 1])
            tot = zin.sum()
            z = zin / tot
            o = split_ll(s, z, T, K)
            if o is None:   # on the way, a stage can pass through one liquid: keep its last flows
                continue
            x1, x2 = o
            # the raffinate is the liquid richer in water (the feed's carrier)
            if x1[0] < x2[0]:
                x1, x2 = x2, x1
            # the fraction of liquid 2 from the balance of the component that differs most
            k = int(np.argmax(np.abs(x1 - x2)))
            b = (z[k] - x1[k]) / (x2[k] - x1[k])
            Rn[j], En[j] = (1 - b) * tot * x1, b * tot * x2
        if np.max(np.abs(Rn - R)) < 1e-13 and np.max(np.abs(En - E)) < 1e-13:
            return Rn, En
        R, E = Rn, En
    return R, E


def solve(model, set_name, N, T, feed, solv):
    s = system(model, set_name)
    feed, solv = np.array(feed, float), np.array(solv, float)
    R0, E0 = stagewise(s, N, T, feed, solv)
    act = [i for i in range(3) if feed[i] + solv[i] > 0]
    Ftot = feed.sum() + solv.sum()

    def unpack(u):
        R = np.zeros((N, 3)); E = np.zeros((N, 3))
        u = u.reshape(N, 2, len(act))
        R[:, act] = np.exp(u[:, 0]); E[:, act] = np.exp(u[:, 1])
        return R, E

    def res(u):
        R, E = unpack(u)
        r = []
        for j in range(N):
            rin = feed if j == 0 else R[j - 1]
            ein = solv if j == N - 1 else E[j + 1]
            r += list((R[j] + E[j] - rin - ein)[act] / Ftot)
            x, y = R[j] / R[j].sum(), E[j] / E[j].sum()
            r += list((np.log(np.clip(x, 1e-300, None) * s.gamma(x, T)) - np.log(np.clip(y, 1e-300, None) * s.gamma(y, T)))[act])
        return np.array(r)

    u0 = np.stack([np.log(np.maximum(R0[:, act], 1e-300)), np.log(np.maximum(E0[:, act], 1e-300))], axis=1).ravel()
    sol = least_squares(res, u0, xtol=1e-15, ftol=1e-15, gtol=1e-15, method="trf")
    R, E = unpack(sol.x)
    return R, E, float(np.max(np.abs(sol.fun)))


def main():
    cases = []
    for model, set_name, N, T, feed, solv in CASES:
        R, E, worst = solve(model, set_name, N, T, feed, solv)
        print(f"{model} N={N} T={T}: raffinate {np.round(R[-1], 6)} extract {np.round(E[0], 6)}; largest residual {worst:.1e}")
        cases.append({"components": IDS, "model": model, "set": set_name, "stages": N, "T_K": T,
                      "feed_mol_s": feed, "solvent_mol_s": solv,
                      "raffinate_mol_s": [list(r) for r in R], "extract_mol_s": [list(e) for e in E], "residual": worst})
    OUT.write_text(json.dumps({"_about": "Written by validation/python/reference_extraction.py: countercurrent liquid-liquid "
                                         "cascades from an independent implementation; per stage (1..N) the component "
                                         "flows of the raffinate and of the extract leaving it, mol/s.", "cases": cases}, indent=1) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
