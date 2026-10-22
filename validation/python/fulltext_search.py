"""Candidate open articles for each "no open data" marker, by a full-text search (proposal 0014, step 2).

The maintainer's idea of 2026-10-22: "in the articles where you see simulations they have some data and cited sources
for comparison? use those". Modelling and simulation papers often print the measured values they compare with, or
measure some themselves (Baird et al. 2019 measured levoglucosenone's vapour pressure for a PC-SAFT paper). Such tables
are not found by searching for the property in a title or abstract, only in the full text.

For each component and missing property (from missing_properties.gaps), the script asks open full-text indexes for
articles that mention one of the component's names together with the property:

- Europe PMC (https://europepmc.org, EMBL-EBI): searches the full texts of its open-access articles, no key needed.
  For each hit with a full text there, the text is read, and the paragraphs and tables where a name and the property
  appear together are listed with a short excerpt; a table with numbers ranks first.
- OpenAlex (`fulltext.search`) and CORE (full texts of open repositories), each with its free key (an environment
  variable or a network secret, see open_copy.py); an index that refuses is named in the report as not asked.

It finds candidates; it never takes a number. A person (or an assistant, whose reading a person then checks) opens each
candidate, decides whether its values are measured and where they come from (docs/DATA_RULES.md section 1: values a
paper quotes from a databank or a handbook are not taken; values it measured, or quotes with the measuring article
named, are), and adds what was read to the marker's `searched`, found or not.

    python validation/python/fulltext_search.py --cache DIR --out candidates.json [--only ID ...] [--props KEY ...]
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from missing_properties import load, gaps  # noqa: E402
from open_copy import get_json, Unavailable, EMAIL  # noqa: E402

EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query={q}&format=json&pageSize={n}&resultType=lite"
EPMC_XML = "https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"
OPENALEX = "https://api.openalex.org/works?filter={f}&per-page={n}&select=doi,title,publication_year,open_access&mailto={e}"
CORE = "https://api.core.ac.uk/v3/search/works?q={q}&limit={n}"

TERMS = {
    "vapourPressure": ["vapor pressure", "vapour pressure", "saturated vapor pressure", "saturation pressure"],
    "critical": ["critical temperature", "critical pressure", "critical point"],
    "Tb": ["normal boiling point", "normal boiling temperature", "boiling point"],
    "liquidDensity": ["density", "densities"],
    "liquidHeatCapacity": ["heat capacity", "heat capacities"],
    "idealGasHeatCapacity": ["ideal gas heat capacity", "ideal-gas heat capacity", "gas phase heat capacity"],
    "heatOfVaporization": ["enthalpy of vaporization", "enthalpy of vaporisation", "heat of vaporization",
                           "vaporization enthalpy", "vaporization enthalpies"],
    "surfaceTension": ["surface tension"],
    "liquidViscosity": ["viscosity", "viscosities"],
    "liquidThermalConductivity": ["thermal conductivity"],
    "vapourViscosity": ["gas viscosity", "vapor viscosity", "vapour viscosity"],
    "vapourThermalConductivity": ["gas thermal conductivity", "vapor thermal conductivity"],
    "fusion": ["enthalpy of fusion", "heat of fusion", "fusion enthalpy", "melting temperature", "melting point"],
    "formation": ["enthalpy of formation", "enthalpy of combustion", "energy of combustion", "heat of combustion"],
    "formationG": ["standard molar entropy", "standard entropy", "Gibbs energy of formation", "absolute entropy"],
}
# By default the properties a calculation needs (docs/MISSING_PROPERTIES_*.md, "Where to start"). The transport
# properties, used by no calculation yet, and the ideal-gas heat capacity, derived by Kirchhoff's path, only with
# --props: their names ("viscosity", "density") also match countless articles about other things.
DEFAULT_PROPS = ["vapourPressure", "liquidDensity", "heatOfVaporization", "liquidHeatCapacity", "fusion", "formation",
                 "formationG", "critical", "Tb"]


def names(c):
    """The names to search: the name and the aliases, without acronyms (GVL, EMF, lgo), which match other
    substances; the CAS number too, which some articles print in their table of chemicals."""
    out = [c["name"]] + [a for a in (c.get("aliases") or []) if len(a) > 4 and not (a.isupper() and len(a) <= 6)]
    if c.get("cas"):
        out.append(c["cas"])
    seen, keep = set(), []
    for n in out:
        if n.lower() not in seen:
            seen.add(n.lower())
            keep.append(n)
    return keep


def _quoted(xs):
    return " OR ".join('"%s"' % x.replace('"', "") for x in xs)


def _cached(cache, kind, key, fetch):
    f = Path(cache) / kind / (re.sub(r"[^A-Za-z0-9._-]+", "_", key)[:180] + ".json")
    if f.exists():
        return json.loads(f.read_text())
    v = fetch()
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(v))
    return v


def epmc_search(cache, nm, terms, n):
    q = "(%s) AND (%s) AND OPEN_ACCESS:y" % (_quoted(nm), _quoted(terms))
    def fetch():
        time.sleep(0.2)
        ans = get_json(EPMC.format(q=urllib.parse.quote(q), n=n)) or {}
        return {"hitCount": ans.get("hitCount", 0), "result": [
            {k: r.get(k) for k in ("pmcid", "doi", "title", "pubYear", "journalTitle", "authorString")}
            for r in (ans.get("resultList") or {}).get("result", [])]}
    return _cached(cache, "europepmc", q, fetch)


def epmc_fulltext(cache, pmcid):
    def fetch():
        import urllib.request
        time.sleep(0.2)
        req = urllib.request.Request(EPMC_XML.format(pmcid=pmcid), headers={"User-Agent": "CHEPTA data script"})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            return ""
    return _cached(cache, "europepmc_xml", pmcid, fetch)


def _plain(xml):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", xml)).strip()


def _find(text, words):
    """The first word found as a whole word (levoglucosenone is not found in dihydrolevoglucosenone), and its place."""
    for w in words:
        m = re.search(r"(?<![A-Za-z])%s(?![A-Za-z])" % re.escape(w.lower()), text)
        if m:
            return w, m.start()
    return None, -1


def screen(xml, nm, terms):
    """The blocks (tables, then paragraphs) of a full text where a name and a property term appear together."""
    blocks = [("table", m) for m in re.findall(r"<table-wrap.*?</table-wrap>", xml, flags=re.S)]
    blocks += [("paragraph", m) for m in re.findall(r"<p>.*?</p>", xml, flags=re.S)]
    hits = []
    for kind, b in blocks:
        t = _plain(b)
        low = t.lower()
        name, i = _find(low, nm)
        term, _ = _find(low, terms)
        if not (name and term):
            continue
        numbers = len(re.findall(r"\d+\.\d+", t))
        excerpt = t[max(0, i - 120): i + 180]
        hits.append({"kind": kind, "name": name, "term": term, "numbers": numbers, "excerpt": excerpt})
    hits.sort(key=lambda h: (h["kind"] != "table", -h["numbers"]))
    return hits[:3]


def openalex_search(cache, nm, terms, n):
    key = os.environ.get("OPENALEX_API_KEY")   # without it, a network secret may add the key (open_copy.py)
    auth = {"Authorization": "Bearer " + key} if key else None
    out = []
    for name in nm[:3]:
        for term in terms[:2]:
            f = "fulltext.search:%s,fulltext.search:%s,is_oa:true" % (urllib.parse.quote('"%s"' % name),
                                                                         urllib.parse.quote('"%s"' % term))
            ans = _cached(cache, "openalex_fulltext", name + "|" + term, lambda: get_json(
                OPENALEX.format(f=f, n=n, e=urllib.parse.quote(EMAIL)), headers=auth) or {})
            for w in ans.get("results", []):
                out.append({"doi": (w.get("doi") or "").replace("https://doi.org/", ""), "title": w.get("title"),
                            "pubYear": w.get("publication_year"), "oa_url": (w.get("open_access") or {}).get("oa_url")})
    return out


def core_search(cache, nm, terms, n):
    key = os.environ.get("CORE_API_KEY")
    auth = {"Authorization": "Bearer " + key} if key else None
    q = "fullText:(%s) AND fullText:(%s)" % (_quoted(nm[:4]), _quoted(terms))
    ans = _cached(cache, "core_fulltext", q, lambda: get_json(CORE.format(q=urllib.parse.quote(q), n=n),
                                                              headers=auth) or {})
    return [{"doi": r.get("doi"), "title": r.get("title"), "pubYear": r.get("yearPublished"),
             "oa_url": r.get("downloadUrl")} for r in ans.get("results", [])]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True, help="the candidates, as JSON")
    ap.add_argument("--only", nargs="*", help="component ids")
    ap.add_argument("--props", nargs="*", default=DEFAULT_PROPS, help="property keys (default: %(default)s)")
    ap.add_argument("--predicted", action="store_true", help="also search the properties that are predicted only")
    ap.add_argument("--hits", type=int, default=8, help="articles read per search (default 8)")
    a = ap.parse_args()

    comps = load()
    out, notes = {}, set()
    for cid, c in comps.items():
        if a.only and cid not in a.only:
            continue
        g = gaps(c)
        want = [k for k in a.props if g.get(k) == "missing" or (a.predicted and g.get(k) == "predicted")]
        if not want:
            continue
        nm = names(c)
        for key in want:
            terms = TERMS[key]
            res = epmc_search(a.cache, nm, terms, a.hits)
            with ThreadPoolExecutor(4) as pool:
                texts = list(pool.map(lambda r: epmc_fulltext(a.cache, r["pmcid"]) if r.get("pmcid") else "",
                                      res["result"]))
            cands = []
            for r, xml in zip(res["result"], texts):
                hits = screen(xml, nm, terms)
                if hits:
                    cands.append({**r, "index": "Europe PMC", "blocks": hits})
            for fn, label in ((openalex_search, "OpenAlex"), (core_search, "CORE")):
                try:
                    cands += [{**r, "index": label, "blocks": []} for r in fn(a.cache, nm, terms, a.hits)]
                except Unavailable as e:
                    notes.add("%s not asked: %s" % (label, e))
            out.setdefault(cid, {})[key] = {"names": nm, "terms": terms, "europepmc_hits": res["hitCount"],
                                           "candidates": cands}
            shown = [x for x in cands if x["blocks"]]
            print("%s / %s: %d Europe PMC hits, %d with the name and the property together%s" % (
                cid, key, res["hitCount"], len(shown),
                "".join("\n    %s %s (%s): %s %s, %d numbers: ...%s..." % (
                    x.get("pubYear"), x.get("doi") or x.get("pmcid"), (x.get("title") or "")[:70],
                    x["blocks"][0]["kind"], x["blocks"][0]["term"], x["blocks"][0]["numbers"],
                    x["blocks"][0]["excerpt"][:160]) for x in shown[:4])), flush=True)
    a.out.write_text(json.dumps({"notes": sorted(notes), "candidates": out}, indent=1, ensure_ascii=False))
    for n in sorted(notes):
        print(n)


if __name__ == "__main__":
    main()
