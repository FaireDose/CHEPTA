"""
Independent reference for the phase envelope of src/equilibrium/envelope.js (proposal 0013, step 7): CoolProp 8.0.0
(MIT), its Peng-Robinson backend ("PR"), which traces a mixture's envelope its own way (dew curve "all the way
around", stepping in the vapour density: src/Backends/Helmholtz/PhaseEnvelopeRoutines.cpp) and finds the mixture's
critical points by its own method (all_critical_points). CoolProp shares no code with the JavaScript engine. Its
critical constants and acentric factors are those of CHEPTA's records for these components (both from CoolProp's fluid
files); the binary parameters are set to zero on both sides, so that the comparison checks the algorithm, not the
parameters. Natural gas SNG27 of Zhang et al., ACS Omega 5 (2020) 9235 (Table 2), with its neopentane counted as
isopentane (CHEPTA has no neopentane), as in validation/data/envelope/zhang2020_natural_gas.json.

Writes validation/fixtures/envelope.json.

Usage: python validation/python/reference_envelope.py
"""
import json
from pathlib import Path

import CoolProp
import CoolProp.CoolProp as CP

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "fixtures" / "envelope.json"
COOLPROP = {"methane": "Methane", "ethane": "Ethane", "propane": "Propane", "isobutane": "IsoButane", "n-butane": "n-Butane",
            "isopentane": "Isopentane", "n-pentane": "n-Pentane", "n-hexane": "n-Hexane", "nitrogen": "Nitrogen",
            "carbon-dioxide": "CarbonDioxide"}


def cases():
    yield "methane + n-butane", {"methane": 0.7, "n-butane": 0.3}
    gas = json.loads((ROOT / "data" / "envelope" / "zhang2020_natural_gas.json").read_text())
    g = next(m for m in gas["mixtures"] if m["id"] == "SNG27")
    yield "natural gas SNG27 (Zhang et al. 2020)", g["chepta_mole_fractions"]


def main():
    out = {"_about": f"Phase envelopes from CoolProp {CoolProp.__version__}, PR backend, k_ij = 0. Written by "
                     "validation/python/reference_envelope.py.", "cases": []}
    for name, comp in cases():
        ids = list(comp)
        AS = CP.AbstractState("PR", "&".join(COOLPROP[i] for i in ids))
        z = [comp[i] for i in ids]
        s = sum(z)
        AS.set_mole_fractions([v / s for v in z])
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                AS.set_binary_interaction_double(i, j, "kij", 0.0)
        AS.build_phase_envelope("")
        pe = AS.get_phase_envelope_data()
        T, p = list(pe.T), [v / 1000 for v in pe.p]
        ib = max(range(len(p)), key=lambda k: p[k])
        it = max(range(len(T)), key=lambda k: T[k])
        # CoolProp's saturation solver at a grid of pressures (not its envelope trace, which drifts on the bubble side
        # of the natural gas): the bubble (Q = 0) and dew (Q = 1) temperatures
        flashes = []
        for P in [100, 200, 500, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 7600, 7700]:
            for Q in (0, 1):
                try:
                    AS.update(CP.PQ_INPUTS, P * 1e3, Q)
                    flashes.append({"P_kPa": P, "Q": Q, "T_K": AS.T()})
                except ValueError:
                    pass
        crit = []
        try:
            crit = [{"T_K": c.T, "P_kPa": c.p / 1000, "stable": bool(c.stable)} for c in AS.all_critical_points()]
        except Exception as e:   # noqa: BLE001 - CoolProp's own message is kept
            crit = [{"error": str(e)}]
        row = {"name": name, "components": ids, "z": [v / s for v in z],
               "points": [[round(a, 4), round(b, 4)] for a, b in zip(T, p)],
               "cricondenbar": {"T_K": T[ib], "P_kPa": p[ib]}, "cricondentherm": {"T_K": T[it], "P_kPa": p[it]},
               "critical": crit, "flashes": flashes}
        out["cases"].append(row)
        print(name, len(T), row["cricondenbar"], row["cricondentherm"], crit)
    OUT.write_text(json.dumps(out, indent=1) + "\n")


if __name__ == "__main__":
    main()
