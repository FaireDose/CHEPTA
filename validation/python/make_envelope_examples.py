"""
The phase-envelope examples of the workbench (src/data/envelope-examples.json): real natural gases with measured dew
points, from validation/data/envelope/*.json (the mixtures that are made of CHEPTA components: chepta_mole_fractions).
Each example keeps the source id (src/data/sources.json) and the measured dew points, which the envelope view draws
over the calculated curve.

Usage: python validation/python/make_envelope_examples.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "data" / "envelope-examples.json"
FILES = [("validation/data/envelope/zhang2020_natural_gas.json", "zhang2020-natural-gas",
          "Zhang et al., ACS Omega 5 (2020) 8463, Tables 2 and 3")]


def main():
    out = {"_about": "Phase-envelope examples: natural gases with measured dew points (chilled mirror). Written by "
                     "validation/python/make_envelope_examples.py from the files named in each example; T in K, P in kPa.",
           "examples": []}
    for rel, sid, where in FILES:
        d = json.loads((ROOT / rel).read_text())
        for m in d["mixtures"]:
            if not m.get("chepta_mole_fractions"):
                continue
            comp = m["chepta_mole_fractions"]
            out["examples"].append({
                "id": m["id"], "label": f"Natural gas {m['id']} (measured dew points)",
                "components": list(comp), "z": list(comp.values()),
                "dew_points": [[round(T + 273.15, 2), round(P * 1000, 1)] for P, T in m["dew_points"]["rows"]],
                "source_ids": [sid], "source": where, "file": rel,
                "note": "Neopentane counted as isopentane (CHEPTA has no neopentane)." if "neoC5" in m["composition_mol_percent"] else None,
            })
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(out['examples'])} examples")


if __name__ == "__main__":
    main()
