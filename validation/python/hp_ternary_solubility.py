"""Measured ternary gas-solubility data of the NIST TRC ThermoML Archive for the high-pressure separator of a methanol
plant (CO2 + methanol + water; CO2 + hydrogen + methanol), for validation/co2_methanol_check.mjs.

The question (CHEPTA-Lab, case methanol-co2-campos-2022, 2026-11-20): how much CO2 dissolves in the methanol + water
condensate of the flash at 30 degC and 69.25 bar. The binary CO2 + methanol sets are already in
validation/data/eos/ (hp_gas_solubility.py); these are the records with a third component. They were found by
reading every record of the archive's bulk file (ThermoML.v2020-09-30.tgz, doi 10.18434/mds2-2422) for sets that
hold methanol and CO2, H2 or CO with any third compound; the records below are the ones whose sets give equilibrium
states of these ternaries. Each record is fetched by its DOI from trc.nist.gov (NIST open license) and read with
thermoml_read.py; the values are written as stored.

  - Xia, Jodecke, Perez-Salado Kamps, Maurer, J. Chem. Eng. Data 49 (2004) 1756, doi 10.1021/je049803i, set 1:
    CO2 + (methanol + water); the solvent's CO2-free mole fraction of methanol, the molality of CO2 (mol per kg of
    the mixed solvent) and the total pressure, at 313.75, 354.35 and 395.0 K. The mole fractions are computed
    exactly from the molality with the molar masses of src/data/components.json:
    x_CO2 = m / (m + 1000 / M_s), M_s = s M_MeOH + (1 - s) M_W (g/mol), x_MeOH = s (1 - x_CO2).
  - Bezanehtak, Dehghani, Foster, J. Chem. Eng. Data 49 (2004) 430, doi 10.1021/je0301491, set 2: CO2 + H2 +
    methanol at 278-298 K and 2-20 MPa; T, P and x_CO2 as variables, x_H2, y_H2 and y_CO2 as properties.
  - Xie, Brown, Bush, Eckert, J. Chem. Eng. Data 50 (2005) 780, doi 10.1021/je0498614, set 2: bubble pressures of
    CO2 + H2 + methanol liquids at 313.2 K.

Left out: Hohler et al., Fluid Phase Equilib. 459 (2018) 186 (doi 10.1016/j.fluid.2017.12.004), sets 3-4: CO2 in
methanol-rich methanol + water at 258-298 K (water-to-methanol amount ratios 0.05-0.2), far from the separator's
1:1 solvent; Schuler et al., J. Chem. Eng. Data 57 (2012) 2304 (doi 10.1021/je300332b), set 3: at 103 kPa only;
Gemo et al., J. Chem. Thermodyn. 54 (2012) 1 (doi 10.1016/j.jct.2012.03.021): H2 as an amount concentration (mol/dm3),
which needs the liquid density that the record does not give.

    python validation/python/hp_ternary_solubility.py --cache DIR [--write]

A person still compares the rows with the records (AGENTS.md rule 4).
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from measured_components import norm_inchi  # noqa: E402
from vle_batch import ACCESS, COMPS, citation, inchi_of, record  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "validation" / "data" / "eos" / "multicomponent"


def roles(rec, ids):
    by = {inchi_of(c): c for c in ids}
    return {n: by.get(norm_inchi(c["inchi"])) for n, c in rec["compounds"].items()}


def the_set(rec, number):
    return next(s for s in rec["sets"] if s["number"] == number)


def source(rec, doi, set_no, extra=""):
    return {
        "citation": citation(rec),
        "doi": doi,
        "open_copy": f"https://trc.nist.gov/ThermoML/{doi}.html",
        "access": ACCESS,
        "tables": f"ThermoML record, PureOrMixtureData {set_no}. The table number in the article was not checked.",
        "transcription": "Read from the ThermoML XML by validation/python/hp_ternary_solubility.py; values as stored" + extra
                         + ". The person checking compares each row with the record.",
    }


def xia(cache):
    doi = "10.1021/je049803i"
    rec = record(cache, doi)
    ro = roles(rec, ["carbon-dioxide", "methanol", "water"])
    s = the_set(rec, 1)
    v = {k: (x["type"], ro.get(x["compound"])) for k, x in s["variables"].items()}
    assert v["1"][0] == "Temperature, K"
    assert v["2"] == ("Solvent: Mole fraction", "methanol"), v["2"]
    assert v["3"] == ("Molality, mol/kg", "carbon-dioxide"), v["3"]
    assert s["properties"]["1"]["name"] == "Vapor or sublimation pressure, kPa"
    Mm, Mw = COMPS["methanol"]["MW"], COMPS["water"]["MW"]
    rows = []
    for r in s["rows"]:
        T, sm, m, P, UP = r["v1"], r["v2"], r["v3"], r["p1"], r.get("p1_unc")
        Ms = sm * Mm + (1 - sm) * Mw
        x1 = m / (m + 1000 / Ms)
        rows.append([T, P, sm, m, round(x1, 7), round(sm * (1 - x1), 7), UP])
    return doi, {
        "_about": "Carbon dioxide (1) + methanol (2) + water (3): total pressure over liquids of known CO2 molality in a "
                  "methanol + water solvent, 313-395 K, as stored in the ThermoML Archive record; x_1 and x_2 computed "
                  "from the molality (hp_ternary_solubility.py).",
        "components": ["carbon-dioxide", "methanol", "water"],
        "kind": "isothermal-px-ternary",
        "source": source(rec, doi, 1, "; x_1 = m / (m + 1000 / M_s), M_s = s M_methanol + (1 - s) M_water with the molar "
                         "masses of src/data/components.json, x_2 = s (1 - x_1)"),
        "columns": ["T_K", "P_kPa", "s_methanol_CO2_free", "m_1_mol_kg", "x_1", "x_2", "U_P_kPa"],
        "rows": rows,
        "notes": "s is the mole fraction of methanol in the CO2-free solvent; m the molality of CO2 (mol per kg of the "
                 "methanol + water solvent). U_P_kPa is the record's uncertainty of P. To be checked by a person against "
                 "the record (AGENTS.md rule 4).",
    }


def bezanehtak(cache):
    doi = "10.1021/je0301491"
    rec = record(cache, doi)
    ro = roles(rec, ["carbon-dioxide", "hydrogen", "methanol"])
    s = the_set(rec, 2)
    v = {k: (x["type"], ro.get(x["compound"]), x["phase"]) for k, x in s["variables"].items()}
    p = {k: (x["name"], ro.get(x["compound"]), x["phase"][0]) for k, x in s["properties"].items()}
    assert v["1"][0] == "Temperature, K" and v["2"][0] == "Pressure, kPa"
    assert v["3"] == ("Mole fraction", "carbon-dioxide", "Liquid"), v["3"]
    assert p["1"] == ("Mole fraction", "hydrogen", "Liquid"), p["1"]
    assert p["2"] == ("Mole fraction", "hydrogen", "Gas"), p["2"]
    assert p["3"] == ("Mole fraction", "carbon-dioxide", "Gas"), p["3"]
    rows = [[r["v1"], r["v2"], r["v3"], r["p1"], r["p3"], r["p2"], r.get("p1_unc"), r.get("p2_unc")] for r in s["rows"]]
    rows.sort(key=lambda r: (r[0], r[1], r[2]))
    return doi, {
        "_about": "Carbon dioxide (1) + hydrogen (2) + methanol (3): equilibrium liquid and gas compositions at 278-298 K "
                  "and 2-20 MPa, as stored in the ThermoML Archive record.",
        "components": ["carbon-dioxide", "hydrogen", "methanol"],
        "kind": "isothermal-pxy-ternary",
        "source": source(rec, doi, 2),
        "columns": ["T_K", "P_kPa", "x_1", "x_2", "y_1", "y_2", "U_x_2", "U_y_2"],
        "rows": rows,
        "notes": "In every row of the record y_1 + y_2 = 1 within 0.02 (the methanol in the gas is not given). To be "
                 "checked by a person against the record (AGENTS.md rule 4).",
    }


def xie(cache):
    doi = "10.1021/je0498614"
    rec = record(cache, doi)
    ro = roles(rec, ["carbon-dioxide", "hydrogen", "methanol"])
    s = the_set(rec, 2)
    v = {k: (x["type"], ro.get(x["compound"]), x["phase"]) for k, x in s["variables"].items()}
    assert v["1"] == ("Mole fraction", "carbon-dioxide", "Liquid"), v["1"]
    assert v["2"] == ("Mole fraction", "hydrogen", "Liquid"), v["2"]
    assert s["properties"]["1"]["name"] == "Vapor or sublimation pressure, kPa"
    T = next(c["value"] for c in s["constraints"] if c["type"] == "Temperature, K")
    rows = sorted([[T, r["p1"], r["v1"], r["v2"], r.get("p1_unc")] for r in s["rows"]], key=lambda r: (r[2], r[3]))
    return doi, {
        "_about": "Carbon dioxide (1) + hydrogen (2) + methanol (3): bubble pressures of liquids of known composition at "
                  "313.2 K, as stored in the ThermoML Archive record.",
        "components": ["carbon-dioxide", "hydrogen", "methanol"],
        "kind": "isothermal-px-ternary",
        "source": source(rec, doi, 2),
        "columns": ["T_K", "P_kPa", "x_1", "x_2", "U_P_kPa"],
        "rows": rows,
        "notes": "To be checked by a person against the record (AGENTS.md rule 4).",
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    cache = Path(a.cache)
    cache.mkdir(parents=True, exist_ok=True)
    for name, fn in (("carbon-dioxide_methanol_water", xia), ("carbon-dioxide_hydrogen_methanol", bezanehtak),
                     ("carbon-dioxide_hydrogen_methanol", xie)):
        doi, d = fn(cache)
        Ts = sorted({r[0] for r in d["rows"]})
        Ps = [r[1] for r in d["rows"]]
        print(f"{name} {doi}: {len(d['rows'])} rows, T {Ts}, P {min(Ps):g}-{max(Ps):g} kPa")
        if a.write:
            OUT.mkdir(parents=True, exist_ok=True)
            f = OUT / f"thermoml_{name}_{doi.replace('/', '-').replace('.', '-')}.json"
            f.write_text(json.dumps(d, indent=1) + "\n")
            print("   wrote", f.relative_to(ROOT))


if __name__ == "__main__":
    main()
