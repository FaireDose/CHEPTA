"""The component registry (validation/data/component_registry.json): every component the data scripts build, listed
once, and the lists the scripts need, derived from it.

    from registry import REG
    REG.ids                 all components fitted by fit_properties.py, in record order
    REG.batch(n)            the components of add_components.py batch n: (id, name, CoolProp fluid or None, aliases)
    REG.coolprop            {id: CoolProp fluid}
    REG.not_in_coolprop     the components that are not CoolProp fluids (ChemSep, or the v0.1 records)
    REG.vp_fitted           the components whose vapour-pressure record fit_properties.py makes
    REG.chemsep_cas         {id: CAS} of the components taken from ChemSep
    REG.chemsep2            CAS numbers of the compounds taken from chemsep2.xml
    REG.webbook_antoine     {id: WebBook ID} of the batch components that are not CoolProp fluids (Antoine cross-check)
    REG.by_proposal(p)      the batch components of proposal p ("0008", "0009")
    REG.thermoml            {id: names searched in the ThermoML Archive}

Adding a batch is one entry in the JSON file; nothing else lists the components.
"""
import json
from pathlib import Path

FILE = Path(__file__).resolve().parents[2] / "validation" / "data" / "component_registry.json"


class Registry:
    def __init__(self, path=FILE):
        d = json.loads(Path(path).read_text())
        self.base = d["base"]["components"]
        self.own_vp = d["base"]["liquids_with_own_vapour_pressure"]
        self.batches = {b["number"]: b for b in d["batches"]}
        self.all = self.base + [c for n in sorted(self.batches) for c in self.batches[n]["components"]]
        ids = [c["id"] for c in self.all]
        if len(set(ids)) != len(ids):
            raise SystemExit("component_registry.json: a component is listed twice: %s" %
                             sorted({i for i in ids if ids.count(i) > 1}))
        base_ids = {c["id"] for c in self.base}
        self.ids = ids
        self.coolprop = {c["id"]: c["coolprop"] for c in self.all if c.get("coolprop")}
        self.not_in_coolprop = [i for i in ids if i not in self.coolprop]
        self.vp_fitted = [i for i in ids if i not in self.own_vp]
        # cas: of a component taken from ChemSep, and of every compound taken from chemsep2.xml (also the CoolProp fluids
        # whose missing properties come from it)
        missing = [c["id"] for c in self.all if c.get("chemsep_file") == 2 and not c.get("cas")]
        if missing:
            raise SystemExit("component_registry.json: chemsep_file 2 needs the CAS number: %s" % missing)
        self.chemsep_cas = {c["id"]: c["cas"] for c in self.all if c.get("cas") and not c.get("coolprop")}
        self.chemsep2 = {c["cas"] for c in self.all if c.get("chemsep_file") == 2}
        self.webbook_antoine = {c["id"]: "C" + c["cas"].replace("-", "") for c in self.all
                                if c["id"] not in base_ids and not c.get("coolprop")}
        self.thermoml = {c["id"]: c["thermoml"] for c in self.all if c.get("thermoml")}

    def batch(self, n):
        return [(c["id"], c["name"], c.get("coolprop"), c.get("aliases", [])) for c in self.batches[n]["components"]]

    def by_proposal(self, p):
        return [c["id"] for n in sorted(self.batches) if self.batches[n]["proposal"] == p
                for c in self.batches[n]["components"]]


REG = Registry()
