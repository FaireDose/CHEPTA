"""
Independent reference for the shortcut column (proposal 0015, Part I, section 1; milestone M1): the method of Fenske,
Underwood and Gilliland for a light and a heavy key at constant relative volatility. It shares no code with the
JavaScript engine (src/units/columns/, W2's, not built when this was written).

The equations, as the open source code of DWSIM documents them (DWSIM, GPL-3.0, file
DWSIM.UnitOperations/UnitOperations/ShortcutColumn.vb, branch "windows",
https://github.com/DanWBR/dwsim/blob/windows/DWSIM.UnitOperations/UnitOperations/ShortcutColumn.vb, read
2026-10-29). The original articles (Fenske 1932, Underwood 1948, Gilliland 1940, Eduljee 1975) are paywalled and not
used for numbers; this file is written anew from the equations, not translated from DWSIM's code:

  Fenske, minimum stages at total reflux (DWSIM: "Nmin calculation (Fenske)"):
      N_min = ln[(x_D,LK / x_D,HK) (x_B,HK / x_B,LK)] / ln(alpha_LK / alpha_HK)
  Fenske, the distribution of a non-key i (DWSIM: "calculate nonkeys distribution"), written with the key ratio:
      (d_i / b_i) = (d_HK / b_HK) (alpha_i / alpha_HK)^N_min
  Underwood, minimum reflux (DWSIM: "calculate minimum reflux by Underwood's method", the function rminfunc and the
  sum after it), with one root theta between alpha_HK and alpha_LK (no non-key distributes between the keys; DWSIM
  solves a linear system of several roots otherwise, which is not needed for these cases and refused here):
      sum_i alpha_i z_i / (alpha_i - theta) = 1 - q,        R_min = sum_i alpha_i x_D,i / (alpha_i - theta) - 1
  Gilliland's correlation in Eduljee's form (DWSIM: "actual number of stages by Gilliland's method"):
      X = (R - R_min) / (R + 1),   Y = 0.75 (1 - X^0.5668),   Y = (N - N_min) / (N + 1)  so  N = (Y + N_min) / (1 - Y)
  The feed stage (DWSIM: "optimum feed stage by Fenske's method"): the stages below the feed in the same ratio to N as
  the stripping section's Fenske minimum to N_min:
      N_min,S = ln[(z_LK / z_HK) (x_B,HK / x_B,LK)] / ln(alpha_LK / alpha_HK),   N_S = N_min,S N / N_min

Conventions (validation/data/columns/README.md): alpha relative to any component (only ratios enter); q the feed's
liquid fraction (1 saturated liquid, 0 saturated vapour); N and N_min count equilibrium stages, the partial reboiler
included and a total condenser not. Gilliland's correlation is a fit to columns, not an identity: the N it gives is
not compared with a rigorous column as a numerical check (validation/data/columns/README.md, "Tolerances").

A reflux ratio at or below R_min is refused (Gilliland's X would be zero or negative): no stage count is returned.

Usage: python validation/python/reference_fug.py       (prints the shortcut cases; reference_mesh.py writes the
fixture validation/fixtures/columns.json with these results)
"""
import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import brentq

CASES = Path(__file__).resolve().parents[1] / "data" / "columns"


class Refused(Exception):
    """The shortcut cannot give a column for these specifications (code and message as the engine should say)."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def underwood_theta(alpha, z, q, a_lk, a_hk):
    f = lambda t: float(np.sum(alpha * z / (alpha - t)) - (1 - q))
    eps = 1e-12 * (a_lk - a_hk)
    return brentq(f, a_hk + eps, a_lk - eps, xtol=1e-15, rtol=4 * np.finfo(float).eps, maxiter=500)


def fug(alpha, z, F, q, lk, hk, rec_lk, rec_hk, R=None, R_over_Rmin=None):
    """Shortcut column. rec_lk: fraction of the light key's feed in the distillate; rec_hk: fraction of the heavy key's
    feed in the bottoms. Give R or R_over_Rmin. Returns the flows, N_min, R_min, theta, N and the feed stage."""
    alpha, z = np.asarray(alpha, float), np.asarray(z, float)
    n = len(z)
    a_lk, a_hk = alpha[lk], alpha[hk]
    if not a_lk > a_hk:
        raise Refused("BAD_INPUT", "the light key must be more volatile than the heavy key")
    f = F * z
    d, b = np.zeros(n), np.zeros(n)
    d[lk], b[lk] = rec_lk * f[lk], (1 - rec_lk) * f[lk]
    d[hk], b[hk] = (1 - rec_hk) * f[hk], rec_hk * f[hk]
    Nmin = math.log((d[lk] / b[lk]) * (b[hk] / d[hk])) / math.log(a_lk / a_hk)
    for i in range(n):
        if i in (lk, hk):
            continue
        r = (d[hk] / b[hk]) * (alpha[i] / a_hk) ** Nmin       # d_i / b_i by Fenske
        d[i], b[i] = f[i] * r / (1 + r), f[i] / (1 + r)
        if a_hk < alpha[i] < a_lk:
            raise Refused("NOT_AVAILABLE", "a non-key between the keys needs Underwood's several roots (not in this reference)")
    D, B = d.sum(), b.sum()
    xD, xB = d / D, b / B
    theta = underwood_theta(alpha, z, q, a_lk, a_hk)
    Rmin = float(np.sum(alpha * xD / (alpha - theta)) - 1)
    if R is None:
        R = R_over_Rmin * Rmin
    if not R > Rmin:
        raise Refused("BAD_INPUT", f"the reflux ratio {R:.6g} is at or below the minimum reflux ratio {Rmin:.6g} "
                                   "(Underwood): no number of stages reaches the specified recoveries")
    X = (R - Rmin) / (R + 1)
    Y = 0.75 * (1 - X ** 0.5668)
    N = (Y + Nmin) / (1 - Y)
    NminS = math.log((z[lk] / z[hk]) * (xB[hk] / xB[lk])) / math.log(a_lk / a_hk)
    NS = NminS * N / Nmin
    return {"D_mol_s": float(D), "B_mol_s": float(B), "d_mol_s": d.tolist(), "b_mol_s": b.tolist(), "x_D": xD.tolist(), "x_B": xB.tolist(),
            "N_min": Nmin, "theta": theta, "R_min": Rmin, "R": R, "gilliland_X": X, "gilliland_Y": Y, "N": N,
            "N_min_stripping": NminS, "N_below_feed": NS,
            "identities": {  # the defining equations, evaluated at the result (what test/benchmark-columns.test.js rechecks)
                "underwood_theta": float(np.sum(alpha * z / (alpha - theta)) - (1 - q)),
                "component_balance": float(np.max(np.abs(d + b - f)) / F)}}


def shortcut_cases():
    """The case files whose "shortcut" block states the recoveries, in file order (A1 takes them from its rigorous
    solution, in reference_mesh.py)."""
    out = []
    for p in sorted(CASES.glob("*.json")):
        c = json.loads(p.read_text())
        if "recovery_light_key_in_distillate" in c.get("shortcut", {}):
            out.append(c)
    return out


def run_case(c):
    s, th, col = c["shortcut"], c["thermo"], c["column"]
    names = c["components"]
    try:
        r = fug(th["alpha"], col["feed"]["z"], col["feed"]["flow_mol_s"], col["feed"]["q"], names.index(s["light_key"]),
                names.index(s["heavy_key"]), s["recovery_light_key_in_distillate"], s["recovery_heavy_key_in_bottoms"],
                R=s.get("reflux_ratio"), R_over_Rmin=s.get("reflux_over_minimum"))
        return {"outcome": "ok", **r}
    except Refused as e:
        return {"outcome": "refused", "code": e.code, "message": str(e)}


if __name__ == "__main__":
    for c in shortcut_cases():
        print(c["id"], json.dumps(run_case(c), indent=1))
