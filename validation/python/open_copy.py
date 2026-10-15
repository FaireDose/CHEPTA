"""Legal free copies of articles, from Unpaywall (the maintainer, 2026-10-15).

Unpaywall (https://unpaywall.org, by OurResearch; the database behind the Unpaywall browser extension) lists, for a
DOI, the copies anyone may read for free and legally: the publisher's open-access version, or an accepted or submitted
manuscript in a repository (a university repository, arXiv, PubMed Central, ...). It does not bypass paywalls. A copy it
finds is an open source in the sense of AGENTS.md rule 1; an accepted or submitted manuscript is cited as the published
article with the link to the copy, and the version is stated (docs/DATA_RULES.md, section 1).

It does not know every copy (the free NIST reprints of J. Phys. Chem. Ref. Data, for example, are not in it), so "no
copy found" means only that Unpaywall has none: search further before writing "no open data".

The API asks for a contact e-mail in every request: the project's address, info@cheptasim.org (CHEPTA_CONTACT_EMAIL
overrides it). Answers are cached per DOI in the cache directory.

    python validation/python/open_copy.py 10.1016/j.fluid.2014.06.010 10.1021/je500123x --cache DIR
"""
import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.unpaywall.org/v2/{doi}?email={email}"
EMAIL = os.environ.get("CHEPTA_CONTACT_EMAIL", "info@cheptasim.org")
VERSION = {"publishedVersion": "published version", "acceptedVersion": "accepted manuscript",
           "submittedVersion": "submitted manuscript"}


def lookup(doi, cache):
    """Unpaywall's record of a DOI (dict), or None when Unpaywall does not know the DOI. Cached in cache/unpaywall/."""
    doi = doi.strip().lower()
    f = Path(cache) / "unpaywall" / (urllib.parse.quote(doi, safe="") + ".json")
    if f.exists():
        return json.loads(f.read_text()) or None
    url = API.format(doi=urllib.parse.quote(doi, safe="/"), email=urllib.parse.quote(EMAIL))
    req = urllib.request.Request(url, headers={"User-Agent": "CHEPTA data script (https://github.com/FaireDose/CHEPTA)"})
    rec = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                rec = json.loads(r.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:  # a DOI Unpaywall does not have
                break
            if e.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise
            time.sleep(5 * 2 ** attempt)
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(rec or {}))
    time.sleep(0.1)  # stay far below Unpaywall's limit (100 000 requests a day)
    return rec


def open_copy(doi, cache):
    """The best legal free copy of a DOI: {url, version, host, license}, or None (no copy known to Unpaywall)."""
    rec = lookup(doi, cache)
    loc = rec and rec.get("is_oa") and rec.get("best_oa_location")
    if not loc:
        return None
    return {"url": loc.get("url_for_pdf") or loc.get("url") or loc.get("url_for_landing_page"),
            "version": VERSION.get(loc.get("version"), loc.get("version") or "version not stated"),
            "host": loc.get("repository_institution") or loc.get("host_type") or "",
            "license": loc.get("license") or "no licence stated"}


def describe(doi, cache):
    """One line for a report: the copy, or that Unpaywall has none."""
    c = open_copy(doi, cache)
    if not c:
        return "no free copy known to Unpaywall"
    return "%s (%s, %s; %s)" % (c["url"], c["version"], c["host"], c["license"])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dois", nargs="+")
    ap.add_argument("--cache", type=Path, required=True, help="directory for the cached Unpaywall answers")
    a = ap.parse_args()
    for doi in a.dois:
        print("%s: %s" % (doi, describe(doi, a.cache)))


if __name__ == "__main__":
    main()
