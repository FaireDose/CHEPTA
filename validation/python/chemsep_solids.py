"""
Solid densities from the ChemSep pure-component database of ChemSep Lite 8.32 (chemsep1.xml, created 2022-08-30;
Artistic License 2.0), as the open chemicals library ships it (chemicals/Misc/ChemSep8.32.xml). The maintainer,
2026-11-06: "import the ChemSep 8.32 solid densities as they are, with the version stated per record". CHEPTA's other
ChemSep records come from v8.3 and v8.31 (fit_properties.py); this file is newer, so every record names its version.

For each CHEPTA component found by CAS, the <SolidDensity> correlation is stored as the component's `solidDensity`
record, taken as it is (docs/DATA_RULES.md, section 1): ChemSep equations 1-4 are polynomials of degree eqno - 1
(DIPPR 100 with the higher coefficients zero; DWSIM, PropertyPackage.vb, CalcCSTDepProp), converted from kmol/m3 to
kg/m3 with ChemSep's own molar mass; equation 100 is the full polynomial. Records whose range starts at 0 K (0-9.5 K in
the file: a placeholder, not a measured range) are left out and listed. Many records are one constant over a 9.5 K
span below the melting point; they are taken as they are. Nothing else is taken from the file here: terephthalic acid's ChemSep 8.32
enthalpy of fusion (0) is not a value, so its melting data stay "no open data" (the maintainer, 2026-11-06).

    python validation/python/chemsep_solids.py [--chemsep PATH] [--write]
"""
import argparse
import json
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMP_FILE = ROOT / "src" / "data" / "components.json"
VERSION = "ChemSep Lite 8.32 (chemsep1.xml, created 2022-08-30)"


def default_path():
    import chemicals
    return Path(chemicals.__file__).parent / "Misc" / "ChemSep8.32.xml"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--chemsep", type=Path, default=None)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    path = a.chemsep or default_path()
    root = ET.parse(path).getroot()
    assert "chemsepl8v32" in root.get("file", "") and root.get("create-date") == "30-8-2022", "not the ChemSep Lite 8.32 file"
    by_cas = {c.find("CAS").get("value"): c for c in root.findall("compound") if c.find("CAS") is not None}
    doc = json.loads(COMP_FILE.read_text())
    taken, skipped = [], []
    for cid, comp in doc["components"].items():
        comp.pop("solidDensity", None)
        c = by_cas.get(comp.get("cas"))
        el = c.find("SolidDensity") if c is not None else None
        if el is None or el.find("eqno") is None:
            continue
        eq = int(el.find("eqno").get("value"))
        Tmin, Tmax = float(el.find("Tmin").get("value")), float(el.find("Tmax").get("value"))
        if Tmin == 0:
            skipped.append(f"{cid}: range {Tmin:g}-{Tmax:g} K (a placeholder)")
            continue
        if not (1 <= eq <= 4 or eq == 100) or el.get("units") != "kmol/m3":
            skipped.append(f"{cid}: ChemSep equation {eq} in {el.get('units')} (not read here)")
            continue
        MW = float(c.find("MolecularWeight").get("value"))
        k = {L: (float(el.find(L).get("value")) if el.find(L) is not None and i < eq else 0.0) for i, L in enumerate("ABCDE")} if eq <= 4 else \
            {L: (float(el.find(L).get("value")) if el.find(L) is not None else 0.0) for L in "ABCDE"}
        name = c.find("CompoundID").get("value")
        comp["solidDensity"] = {
            "equation": "DIPPR100", "coefficients": {L: v * MW for L, v in k.items()}, "units": "kg/m3",
            "Tmin_K": Tmin, "Tmax_K": Tmax, "tier": "databank",
            "source": {"name": VERSION, "compound": name, "version": "8.32",
                       "fit": (f"taken as it is: ChemSep equation {eq} (DIPPR 100" + (" with the higher coefficients zero), " if eq <= 4 else "), ") +
                               f"converted from kmol/m3 to kg/m3 with the ChemSep molar mass {MW:g} kg/kmol "
                               "(validation/python/chemsep_solids.py)"),
                       "access": "Artistic License 2.0, via the chemicals library"},
            "source_ids": ["chemsep-8.32"],
        }
        rho = lambda T: sum(v * T ** i for i, v in enumerate(comp["solidDensity"]["coefficients"].values()))
        taken.append(f"{cid}: {Tmin:g}-{Tmax:g} K, {rho(Tmin):.1f}-{rho(Tmax):.1f} kg/m3")
    print("taken:", *taken, sep="\n  ")
    print("left out:", *skipped, sep="\n  ")
    if a.write:
        COMP_FILE.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
        print("wrote", COMP_FILE.relative_to(ROOT))


if __name__ == "__main__":
    main()
