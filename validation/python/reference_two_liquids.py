"""Reference splits of the sets fitted jointly to vapour-liquid and liquid-liquid data (proposal 0019, step 2), written
to validation/fixtures/two_liquids.json.

    python validation/python/reference_two_liquids.py

For each partly miscible pair of validation/data/two_liquids/classes.json with a tie-line file, and each of its default
NRTL or UNIQUAC sets fitted to those tie lines (src/data/binaries.json, "liquid-liquid:" in its source): the two liquids
the set gives at up to six of the measured temperatures, by the isoactivity solve of fit_parameters.lle_from_data
(reference_model.System, numpy; independent of the engine), next to the measured liquids. x is the mole fraction of the
set's first component (its "i").
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fit_parameters as F  # noqa: E402
from reference_model import System, ALL_BINARIES  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "validation" / "fixtures" / "two_liquids.json"


def main():
    cases = []
    for key, c in sorted(F.CLASSES.items()):
        if c["class"] != "partly miscible" or not c.get("lle_file"):
            continue
        for r in ALL_BINARIES:
            if (r["model"] not in ("NRTL", "UNIQUAC") or {r["i"], r["j"]} != set(key.split("+")) or not r.get("default", True)
                    or r.get("tier") != "fitted" or "liquid-liquid:" not in r.get("source", "")):
                continue
            pair = (r["i"], r["j"])
            ll, _ = F.class_lle(pair)
            Ts = sorted({round(t, 2) for t, _, _ in ll})
            pick = [Ts[k] for k in sorted(set(np.linspace(0, len(Ts) - 1, min(6, len(Ts))).round().astype(int)))]
            s = System(list(pair), r["model"], params=[r])
            for T in pick:
                a, b = next((a, b) for t, a, b in ll if round(t, 2) == T)
                z = F.lle_from_data(s, T, a, b)
                if z is None:
                    continue
                cases.append({"pair": list(pair), "model": r["model"], "set": r.get("set"), "T_K": T,
                              "x_I": float(z[0]), "x_II": float(z[1]), "measured": [a, b]})
    OUT.write_text(json.dumps({
        "_about": "Two liquids of the jointly fitted sets (proposal 0019, step 2) at measured temperatures, by "
                  "validation/python/reference_two_liquids.py (fit_parameters.lle_from_data, reference_model.System). "
                  "x: mole fraction of the pair's first component; measured: the measured liquids at that temperature "
                  "(validation/data/two_liquids/lle/).",
        "cases": cases}, indent=1) + "\n")
    print(f"{len(cases)} cases, {len({tuple(c['pair']) + (c['model'],) for c in cases})} sets; wrote {OUT}")


if __name__ == "__main__":
    main()
