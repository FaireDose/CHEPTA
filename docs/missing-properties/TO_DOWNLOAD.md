# Files to download by hand

The maintainer asked for this list on 2026-10-25 and asked to make it clear on 2026-10-29. These documents are free to read, but their servers refuse scripts, so an assistant cannot open them.

**What to do:**

1. Open the link in your browser.
2. If the page asks you to pay or log in, skip that document: it is not open (docs/DATA_RULES.md, section 1).
3. Otherwise, download the PDF.
4. Upload the PDF in the chat, with its number from this list.

The assistant then reads it, takes the values it holds under DATA_RULES.md, and asks you to check them against the PDF. When a document is done it moves to "Done" at the end of this file, with what it gave.

| # | Document | Link | What to look for | Unlocks |
|---|---|---|---|---|
| 1 | Gowda, MEng thesis, Stellenbosch University (2018): phase equilibrium of limonene and other aromatics | https://scholar.sun.ac.za/handle/10019.1/103666 (the PDF is on that page) | Table 8.12: pure limonene, boiling temperatures at 40-101.4 kPa | limonene's vapour-pressure curve up to 1 atm (held for your decision; MISSING_PROPERTIES_2026-10-28-2.md) |
| 2 | EUR 2282 (Euratom, 1965): thermal conductivity of the saturated vapours of benzene, biphenyl and the terphenyls | http://aei.pitt.edu/61065/1/2282.pdf | the p-terphenyl tables; any density, vapour pressure or critical data it quotes, with their source | p-terphenyl (Rawlings and Ekerdt, Example 4.5) |
| 3 | Z. Naturforsch. B 28 (1973): electrical conductivity of o-, m- and p-terphenyl | https://doi.org/10.1515/znb-1973-5-621 | the density of the molten terphenyls | p-terphenyl's liquid density |
| 4 | J. Sci. Instrum. 35 (1958) 307: a viscometer for organic liquids at high temperature | https://doi.org/10.1088/0950-7671/35/8/307 | viscosities of the terphenyls | p-terphenyl's liquid viscosity |
| 5 | Turk. J. Eng. Environ. Sci. 25 (2001): esterification of acetic acid with ethanol on Amberlyst-15 | https://aj.tubitak.gov.tr/engineering/issues/muh-01-25-6/muh-25-6-2-0001-12.pdf | the rate equation and its constants (k, activation energy, K) | the esterification kinetics example (proposal 0010, step 8) |

## For your decision, not a download

- **Glycolic acid, enthalpy of formation:** the value is in a copy on ResearchGate. Decide whether a ResearchGate copy counts as open: it is open only if the authors put it there legally, for example an accepted manuscript.

## Paywalled, no free copy found

Listed so they are not searched again. Do not download them for use: a paywalled article may be read to check a number, but it is never cited and its numbers are never used (DATA_RULES.md, section 1). Their free supplements were checked on 2026-10-29 with `open_copy.py --supplements`:

| Article | Gap | Free supplement |
|---|---|---|
| Nikitin et al., Fluid Phase Equilib. (2022), doi:10.1016/j.fluid.2022.113523 | alpha-angelica lactone: critical point, heat capacity | yes (mmc1.pdf); read on 2026-10-27 |
| doi:10.1021/es302276t | levoglucosan | yes (figshare, CC BY-NC 4.0); read on 2026-10-27 |
| doi:10.1021/je980119b | levoglucosan | none |
| doi:10.1134/S0036024410080054 | glycolic acid: formation | no script route; check the article page |
| doi:10.1016/j.jct.2018.07.029 | methyl lactate: formation | yes (mmc1.docx); read on 2026-10-27 (the value is held: it is marked "this work" without saying how it was obtained) |
| Clague and Bernstein (1969) | propionic and butyric acid: dimerization | none found |
| Epshtein, Durynina and Pashinkin, Zh. Prikl. Khim. 37 (1964) 2543 | levoglucosan: liquid vapour pressure | none found |

## Done

(none yet)
