"""Legal free copies of articles, from Unpaywall, OpenAlex and CORE (the maintainer, 2026-10-15; proposal 0014, step 1).

Unpaywall (https://unpaywall.org, by OurResearch; the database behind the Unpaywall browser extension) lists, for a
DOI, the copies anyone may read for free and legally: the publisher's open-access version, or an accepted or submitted
manuscript in a repository (a university repository, arXiv, PubMed Central, ...). It does not bypass paywalls. A copy it
finds is an open source in the sense of AGENTS.md rule 1; an accepted or submitted manuscript is cited as the published
article with the link to the copy, and the version is stated (docs/DATA_RULES.md, section 1).

It does not know every copy, so two more open indexes are asked for every copy of the DOI (proposal 0014, step 1):

- OpenAlex (https://openalex.org, also by OurResearch) lists each location of a work, repositories included. Baird et
  al. (2019) has five: Unpaywall gave only the publisher's, which refuses scripts; OpenAlex also gives the Aalto and OSF
  copies. Without a key OpenAlex shares one small daily budget among everyone on the same network address; a free key
  (https://help.openalex.org/api/authentication/) in OPENALEX_API_KEY gives it its own.
- CORE (https://core.ac.uk, The Open University) aggregates the full texts of open repositories. It needs a free key
  (https://core.ac.uk/services/api) in CORE_API_KEY; without one it is skipped and the report says so.

Neither knows the free NIST reprints of J. Phys. Chem. Ref. Data, so "no copy found" is still not "no open data" by
itself: search further before writing it.

A server may answer "200 OK" with an HTML page (a login, a cookie wall, a robot check) where a PDF was asked for.
`fetch_pdf` keeps a download only when it starts with "%PDF". A repository's landing page is HTML too; when it names
its PDF in a `citation_pdf_url` meta tag (the Google Scholar tag that DSpace, Pure, HAL and most repositories write),
that PDF is fetched instead. Otherwise the next copy is tried.

The APIs ask for a contact e-mail: the project's address, info@cheptasim.org (CHEPTA_CONTACT_EMAIL overrides it).
Answers are cached per DOI in the cache directory.

    python validation/python/open_copy.py 10.1016/j.fluid.2014.06.010 10.1021/je500123x --cache DIR
    python validation/python/open_copy.py 10.1007/s10765-019-2570-9 --cache DIR --all --fetch DIR/pdf
"""
import argparse
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.unpaywall.org/v2/{doi}?email={email}"
OPENALEX = "https://api.openalex.org/works/doi:{doi}?mailto={email}"
CORE = "https://api.core.ac.uk/v3/search/works?q={q}&limit=20"
EMAIL = os.environ.get("CHEPTA_CONTACT_EMAIL", "info@cheptasim.org")
UA = "CHEPTA data script (https://github.com/FaireDose/CHEPTA)"
VERSION = {"publishedVersion": "published version", "acceptedVersion": "accepted manuscript",
           "submittedVersion": "submitted manuscript"}


class Unavailable(Exception):
    """An index that cannot be asked now (no key, or the shared budget is used up); the report names it."""


def _cache_file(cache, kind, doi):
    return Path(cache) / kind / (urllib.parse.quote(doi, safe="") + ".json")


def get_json(url, headers=None, not_found=(404,)):
    """The JSON answer of a GET, None for a not-found status. Retries server errors; a 429 or 401 raises Unavailable."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in not_found:
                return None
            if e.code in (401, 403, 429):
                raise Unavailable("HTTP %d (%s)" % (e.code, "a key is needed or the shared daily budget is used up"))
            if e.code not in (500, 502, 503, 504) or attempt == 3:
                raise
            time.sleep(5 * 2 ** attempt)
    return None


def lookup(doi, cache):
    """Unpaywall's record of a DOI (dict), or None when Unpaywall does not know the DOI. Cached in cache/unpaywall/."""
    doi = doi.strip().lower()
    f = _cache_file(cache, "unpaywall", doi)
    if f.exists():
        return json.loads(f.read_text()) or None
    rec = get_json(API.format(doi=urllib.parse.quote(doi, safe="/"), email=urllib.parse.quote(EMAIL)))
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(rec or {}))
    time.sleep(0.1)  # stay far below Unpaywall's limit (100 000 requests a day)
    return rec


def openalex(doi, cache):
    """OpenAlex's work record of a DOI, or None. Cached in cache/openalex/. Raises Unavailable without budget."""
    doi = doi.strip().lower()
    f = _cache_file(cache, "openalex", doi)
    if f.exists():
        return json.loads(f.read_text()) or None
    url = OPENALEX.format(doi=urllib.parse.quote(doi, safe="/"), email=urllib.parse.quote(EMAIL))
    key = os.environ.get("OPENALEX_API_KEY")
    rec = get_json(url, headers={"Authorization": "Bearer " + key} if key else None)
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(rec or {}))
    return rec


def core(doi, cache):
    """CORE's records of a DOI (list), or None without a key (CORE_API_KEY). Cached in cache/core/."""
    key = os.environ.get("CORE_API_KEY")
    if not key:
        raise Unavailable("no CORE_API_KEY")
    doi = doi.strip().lower()
    f = _cache_file(cache, "core", doi)
    if f.exists():
        return json.loads(f.read_text())
    ans = get_json(CORE.format(q=urllib.parse.quote('doi:"%s"' % doi)), headers={"Authorization": "Bearer " + key})
    recs = (ans or {}).get("results") or []
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(recs))
    return recs


def open_copy(doi, cache):
    """The best legal free copy of a DOI by Unpaywall: {url, version, host, license}, or None (Unpaywall has none)."""
    rec = lookup(doi, cache)
    loc = rec and rec.get("is_oa") and rec.get("best_oa_location")
    if not loc:
        return None
    return {"url": loc.get("url_for_pdf") or loc.get("url") or loc.get("url_for_landing_page"),
            "version": VERSION.get(loc.get("version"), loc.get("version") or "version not stated"),
            "host": loc.get("repository_institution") or loc.get("host_type") or "",
            "license": loc.get("license") or "no licence stated"}


def copies(doi, cache):
    """Every legal free copy the three indexes know: (list of {url, pdf, version, host, license, index}, notes).

    `pdf` is a direct PDF link where the index gives one, else None (the url is a landing page). `notes` names the
    indexes that could not be asked, so a short list is not mistaken for a complete one."""
    out, notes, seen = [], [], set()

    def add(url, pdf, version, host, lic, index):
        u = pdf or url
        if not u or u in seen:
            return
        seen.add(u)
        out.append({"url": url or pdf, "pdf": pdf, "version": VERSION.get(version, version or "version not stated"),
                    "host": host or "", "license": lic or "no licence stated", "index": index})

    rec = lookup(doi, cache)
    if rec and rec.get("is_oa"):
        for loc in rec.get("oa_locations") or [rec.get("best_oa_location")]:
            if loc:
                add(loc.get("url_for_landing_page") or loc.get("url"), loc.get("url_for_pdf"), loc.get("version"),
                    loc.get("repository_institution") or loc.get("host_type"), loc.get("license"), "Unpaywall")
    try:
        w = openalex(doi, cache)
        for loc in (w or {}).get("locations") or []:
            if loc.get("is_oa"):
                add(loc.get("landing_page_url"), loc.get("pdf_url"), loc.get("version"),
                    (loc.get("source") or {}).get("display_name"), loc.get("license"), "OpenAlex")
    except Unavailable as e:
        notes.append("OpenAlex not asked: %s" % e)
    try:
        for r in core(doi, cache) or []:
            add((r.get("links") or [{}])[0].get("url") if r.get("links") else None, r.get("downloadUrl"),
                None, (r.get("dataProviders") or [{}])[0].get("name") if r.get("dataProviders") else "CORE",
                None, "CORE")
    except Unavailable as e:
        notes.append("CORE not asked: %s" % e)
    return out, notes


def is_pdf(data):
    """True when the bytes are a PDF ("%PDF" within the first 1 kB), not an HTML page served with "200 OK"."""
    return b"%PDF" in data[:1024]


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/pdf,text/html;q=0.5"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read()


def fetch_pdf(doi, cache, dest):
    """Download the first copy of a DOI that really is a PDF into dest/<doi>.pdf: (path or None, log lines)."""
    found, notes = copies(doi, cache)
    log = list(notes)
    target = Path(dest) / (urllib.parse.quote(doi.strip().lower(), safe="") + ".pdf")
    for c in found:
        url = c["pdf"] or c["url"]
        try:
            data = _get(url)
            if not is_pdf(data):
                m = re.search(rb'<meta[^>]+name="citation_pdf_url"[^>]+content="([^"]+)"', data[:200000])
                if not m:
                    log.append("%s: answered %d bytes that are not a PDF (an HTML page?)" % (url, len(data)))
                    continue
                log.append("%s: a landing page; its citation_pdf_url is tried" % url)
                url = m.group(1).decode("utf-8", "replace").replace("&amp;", "&")
                data = _get(url)
                if not is_pdf(data):
                    log.append("%s: answered %d bytes that are not a PDF (an HTML page?)" % (url, len(data)))
                    continue
        except Exception as e:  # a copy that cannot be fetched: try the next one
            log.append("%s: %s" % (url, e))
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        log.append("%s: PDF saved (%s, %s)" % (url, c["version"], c["host"]))
        return target, log
    return None, log


def describe(doi, cache):
    """One line for a report: the copy, or that Unpaywall has none."""
    c = open_copy(doi, cache)
    if not c:
        return "no free copy known to Unpaywall"
    return "%s (%s, %s; %s)" % (c["url"], c["version"], c["host"], c["license"])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dois", nargs="+")
    ap.add_argument("--cache", type=Path, required=True, help="directory for the cached answers")
    ap.add_argument("--all", action="store_true", help="every copy from Unpaywall, OpenAlex and CORE, not only Unpaywall's best")
    ap.add_argument("--fetch", type=Path, help="download the first copy that is a real PDF into this directory")
    a = ap.parse_args()
    for doi in a.dois:
        if a.fetch:
            path, log = fetch_pdf(doi, a.cache, a.fetch)
            print("%s: %s" % (doi, path or "no PDF could be fetched"))
            for line in log:
                print("    " + line)
        elif a.all:
            found, notes = copies(doi, a.cache)
            print("%s: %d copies" % (doi, len(found)))
            for c in found:
                print("    %s%s (%s, %s; %s) [%s]" % (c["pdf"] or c["url"], "" if c["pdf"] else " (landing page)",
                                                    c["version"], c["host"], c["license"], c["index"]))
            for n in notes:
                print("    " + n)
        else:
            print("%s: %s" % (doi, describe(doi, a.cache)))


if __name__ == "__main__":
    main()
