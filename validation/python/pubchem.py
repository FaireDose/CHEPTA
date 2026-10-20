"""The identity of a component from PubChem, where the open `chemicals` library files it under another stereo form or
CAS number (proposal 0009, batch 4: D-xylose, which `chemicals` files as dl-xylose, CAS 25990-60-7; cis,cis-muconic
acid, which it files without its double-bond geometry under the trans,trans CAS 3588-17-8).

PubChem (https://pubchem.ncbi.nlm.nih.gov/, National Library of Medicine) is free to read. Its computed descriptors
(formula, SMILES, InChI) are created by NCBI, and "information that is created by or for the US government on this
site is within the public domain"; material deposited by others keeps its depositors' terms
(https://www.ncbi.nlm.nih.gov/home/about/policies/). Only the computed descriptors are used. Each record is stored as
fetched in
validation/data/pure/identity/<id>.json:

  - "compound": the PubChem compound that the component's CAS number names (its title, IUPAC name, formula,
    SMILES, InChI and InChIKey);
  - "structure": the form used for groups (Modified UNIFAC 2.0, Ruzicka-Domalski) and for matching the ThermoML
    Archive's compounds, where it differs from "compound" (D-xylose: its open-chain aldehyde form, as for glucose
    and fructose, which is also the form the archive lists it under), with the reason.

    python validation/python/pubchem.py --fetch      # download the records named in IDENTITY below
    from pubchem import chemical; chemical("58-86-6")   # the identity, else chemicals.search_chemical

`chemical()` returns an object with the attributes the data scripts read from chemicals.search_chemical: CASs,
formula, MW (from the formula, with the atomic weights of `chemicals`), smiles, InChI, InChI_key, common_name.
"""
import argparse
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IDENTITY_DIR = ROOT / "validation" / "data" / "pure" / "identity"
PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/%s/%s/property/Title,IUPACName,MolecularFormula,SMILES,InChI,InChIKey/JSON"
ACCESS = ("PubChem (National Library of Medicine), free to read; computed descriptors created by NCBI, in the public "
          "domain (https://www.ncbi.nlm.nih.gov/home/about/policies/)")

# component id -> CAS, and the PubChem compound of the structure used for groups and matching where it is not the
# CAS's own (with why)
IDENTITY = {
    "xylose": {"cas": "58-86-6", "structure": ("cid", "644160"),
               "why": "the open-chain (aldehyde) form, aldehydo-D-xylose: groups are counted in the open-chain form, as "
                      "for glucose and fructose, and the ThermoML Archive lists D-xylose under this InChI"},
    "muconic-acid": {"cas": "1119-72-8"},
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "CHEPTA data script (https://github.com/FaireDose/CHEPTA)"})
    with urllib.request.urlopen(req, timeout=60) as f:
        return json.loads(f.read().decode("utf-8"))


def lookup(kind, key):
    p = get(PUG % (kind, urllib.parse.quote(key)))["PropertyTable"]["Properties"]
    if len(p) != 1:
        raise SystemExit("PubChem %s %s: %d compounds" % (kind, key, len(p)))
    p = p[0]
    return {"cid": p["CID"], "title": p["Title"], "iupac": p["IUPACName"], "formula": p["MolecularFormula"],
            "smiles": p["SMILES"], "inchi": p["InChI"], "inchikey": p["InChIKey"],
            "url": "https://pubchem.ncbi.nlm.nih.gov/compound/%s" % p["CID"]}


def fetch():
    import datetime
    IDENTITY_DIR.mkdir(parents=True, exist_ok=True)
    for cid, e in IDENTITY.items():
        comp = lookup("name", e["cas"])
        syn = get("https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/%s/synonyms/JSON" % comp["cid"])
        if e["cas"] not in syn["InformationList"]["Information"][0]["Synonym"]:
            raise SystemExit("%s: CAS %s is not a synonym of PubChem CID %s" % (cid, e["cas"], comp["cid"]))
        out = {"component": cid, "cas": e["cas"], "retrieved": datetime.date.today().isoformat(),
               "source": "PubChem PUG REST, %s" % (PUG % ("name", e["cas"])), "access": ACCESS, "compound": comp}
        if "structure" in e:
            out["structure"] = dict(lookup(*e["structure"]), why=e["why"])
            if out["structure"]["formula"] != comp["formula"]:
                raise SystemExit("%s: the structure's formula differs from the compound's" % cid)
        (IDENTITY_DIR / ("%s.json" % cid)).write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
        print("%s: PubChem CID %s (%s)%s" % (cid, comp["cid"], comp["title"],
                                              ", structure CID %s" % out["structure"]["cid"] if "structure" in out else ""))


class Identity:
    def __init__(self, d):
        from chemicals.elements import molecular_weight, simple_formula_parser
        s = d.get("structure", d["compound"])
        self.CASs, self.formula = d["cas"], d["compound"]["formula"]
        self.MW = molecular_weight(simple_formula_parser(self.formula))
        self.smiles, self.InChI, self.InChI_key = s["smiles"], s["inchi"], s["inchikey"]
        self.common_name, self.pubchem = d["compound"]["title"], d


def by_cas():
    out = {}
    for f in sorted(IDENTITY_DIR.glob("*.json")) if IDENTITY_DIR.exists() else []:
        d = json.loads(f.read_text())
        out[d["cas"]] = d
    return out


def chemical(cas):
    """The PubChem identity stored for this CAS number, else chemicals.search_chemical(cas)."""
    d = by_cas().get(cas)
    if d:
        return Identity(d)
    from chemicals.identifiers import search_chemical
    return search_chemical(cas)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fetch", action="store_true")
    if ap.parse_args().fetch:
        fetch()
    else:
        for cas, d in by_cas().items():
            i = Identity(d)
            print(d["component"], cas, i.formula, round(i.MW, 4), i.InChI, file=sys.stdout)
