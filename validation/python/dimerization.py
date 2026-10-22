"""
Dimerization constants of carboxylic acids in the vapour (the chemical theory of src/thermo/vapour.js).

Reads the transcribed constants in validation/data/association/<id>_*.json, fits log10 K = A + B/T (K in 1/mmHg, the
unit of src/thermo/vapour.js) over the rows given, and writes the component's `association` record in
src/data/components.json with its source and the fit's largest deviation. Acetic acid's record (Marek's constants, as
used by Schmid et al. 2007) predates this script and is left as it is.

    python validation/python/dimerization.py            # fit and print
    python validation/python/dimerization.py --write    # and write the records
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "validation" / "data" / "association"
COMP = ROOT / "src" / "data" / "components.json"
MMHG_PER_ATM = 760.0
R = 8.314462618


def fit(doc):
    cols = doc["columns"]
    T = np.array([r[cols.index("T_K")] for r in doc["rows"]], float)
    K = np.array([r[cols.index("K_atm-1")] for r in doc["rows"]], float) / MMHG_PER_ATM
    X = np.column_stack([np.ones_like(T), 1 / T])
    (A, B), *_ = np.linalg.lstsq(X, np.log10(K), rcond=None)
    dev = 10 ** (X @ [A, B]) / K - 1
    return A, B, T, dev


def main():
    comps = json.loads(COMP.read_text())
    for f in sorted(DATA.glob("*.json")):
        doc = json.loads(f.read_text())
        A, B, T, dev = fit(doc)
        dH = -R * math.log(10) * B
        worst = float(np.max(np.abs(dev)) * 100)
        print(f"{doc['component']}: A = {A:.4f}, B = {B:.1f} (1/mmHg), dH_dim = {dH / 1000:.1f} kJ/mol, "
              f"{T.min():.2f}-{T.max():.2f} K, largest deviation {worst:.1f} %")
        s = doc["source"]
        rec = {
            "type": "dimer", "log10K": {"A": round(float(A), 4), "B": round(float(B), 1)}, "K_unit": "1/mmHg",
            "T_range_K": [float(T.min()), float(T.max())],
            "source": f"{s['citation']}, {s['tables']} (open copy: {s['open_copy']}); log10 K = A + B/T fitted to "
                      f"{len(T)} values at {T.min():.2f}-{T.max():.2f} K, largest deviation {worst:.1f} %; "
                      f"dimerization enthalpy -R ln(10) B = {dH / 1000:.1f} kJ/mol. {doc['basis']}",
            "file": str(f.relative_to(ROOT)), "source_ids": doc.get("source_ids", []),
        }
        if "--write" in sys.argv:
            comps["components"][doc["component"]]["association"] = rec
    if "--write" in sys.argv:
        COMP.write_text(json.dumps(comps, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote {COMP.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
