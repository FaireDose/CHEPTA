# 2026-11-10-06: gas-liquid flow in the Pipe block, Lockhart-Martinelli (proposal 0020, step 4)

## What the maintainer decided (2026-11-10, relayed by the coordinating session)

"The liquid-gas flow comes in its own PR, Lockhart-Martinelli first, then Beggs-Brill, once open sources are found."
This pull request is the Lockhart-Martinelli part. Beggs-Brill is a later pull request. (The coordinating session
called it "step 3"; in the proposal, step 3 is the flowsheet palette, which is PR #219, and two-phase flow is step 4.)

## Sources searched (2026-11-10)

| Source | Result |
|---|---|
| Lockhart and Martinelli (1949), Chem. Eng. Prog. 45(1) 39-48 | no DOI and no legal free copy found; not used directly |
| Chisholm (1967), Int. J. Heat Mass Transfer 10, 1767-1778, doi:10.1016/0017-9310(67)90047-6 | `open_copy.py --all`: 0 copies (Unpaywall, OpenAlex, CORE) |
| **Filip, Băltăreţu, Damian (2014)**, "Comparison of two-phase pressure drop models for condensing flows in horizontal tubes", Math. Model. Civ. Eng. 10(4) 19-27, doi:10.2478/mmce-2014-0019 | **used.** Open access, CC BY-NC-ND 3.0 (Crossref), PDF from sciendo.com. Eqs. (10)-(16) on p. 21 and eq. (17) on p. 22 give Chisholm's φ_L² = 1 + C/X + 1/X², X² = (dp/dz)_L/(dp/dz)_G, Re_L = G(1-x)D/μ_L, Re_G = GxD/μ_G, and C = 5, 10, 12, 20 for V-V, T-V, V-T, T-T with "V" below Re 1500. Eqs. (5)-(6), p. 21: the homogeneous density. Read on the page image (the text extraction loses the < and > signs). |
| **Wambsganss, Jendrzejczyk, France (1992)**, "Two-phase flow and pressure drop in flow passages of compact heat exchangers", Argonne National Laboratory, ANL/CP-74646 (CONF-920233-2), OSTI 10119434 | **used as the second source of C.** U.S. government report, https://www.osti.gov/servlets/purl/10119434. Eq. (4), p. 13, the same φ²; Table 1, p. 20: "viscous-viscous vv 5, turbulent-viscous tv 10, viscous-turbulent vt 12, turbulent-turbulent tt 20" (taken from Collier 1981). Read on the page images. It gives no Reynolds limit: "Laminar-to-turbulent transition is typically determined experimentally from single-phase tests". |
| **C. E. Brennen, Fundamentals of Multiphase Flow**, Cambridge University Press (2005) | **used for the scope and accuracy.** The author's free copy on CaltechAUTHORS (https://authors.library.caltech.edu/records/n710r-5mn62). Section 8.3.1, pp. 205-211: the theory of the correlation (no C values). p. 210: "the scatter in the data is significant (about a factor of 3 in φ_G) and ... the Lockhart-Martinelli prediction often yields an overestimate of the friction". p. 211: "the Lockhart-Martinelli correlations work best under conditions that do not imply large velocity differences", the turbulent case. Fig. 8.11, p. 210: the liquid is slower than the gas. Section 8.3.2: Martinelli-Nelson, for a phase change (not used). |
| Bertani, Malandrone, Panella (2014), J. Phys.: Conf. Ser. 501, 012013 (open access, CORE) | read: Chisholm with C = 10 and 20 for a T-junction's branches. Its C for local (fitting) losses is fitted to its own junction, so it was not used for fittings. |
| Fohrman (1960), ANL-6256 (U.S. government report, CORE) | read: measured two-phase pressure drops of viscous liquids, but the table's text is OCR-garbled; not used. |
| Wolverine Engineering Data Book III (Thome), ch. 13 | only unofficial uploads (Scribd and others) found; not used |
| Awad and Muzychka (2014), Adv. Mech. Eng., doi:10.1155/2014/327653 (open access) | the publisher refused the download (403); not read |
| EPFL thesis TH3337 (Moreno Quibén 2005) | the repository answered with an HTML page (robot check); not read |
| Lecture notes: SNU OCW Lecture05-1 (Lockhart-Martinelli worked example, gas-oil) | **the host is not allowed in this session's network** (ocw.snu.ac.kr); not read. ceng.tu.edu.iq lec07: TLS certificate fails; not read |
| MDPI articles (Fluids 2025, Appl. Sci. 2021, Energies 2022 and 2024, Micromachines 2021) | 403 to scripts; not read |
| DWSIM, LockhartMartinelli.vb (GPL-3.0), read on 2026-11-10 | what another simulator does (METHOD_SELECTION.md): C = 20 always, each phase alone with its own friction factor and the roughness, no-slip holdup for the elevation |
| The `fluids` library 1.3.1 (MIT), `fluids.two_phase.Lockhart_Martinelli` | an openly documented implementation: Chisholm's form with C = 5, 10, 12, 20, a settable Reynolds limit (2000 by default) and its own smooth-tube friction factor. Used as an independent check of the reference script. |

**No open worked example with numbers was found** (the SNU lecture might hold one, if its host is allowed). The
checks are therefore the independent Python reference and the `fluids` library.

## What was built

- **The engine** (`src/units/pipe.js`; equations and sources in its header):
  - The phases at each node come from the system's flash (the P-H flash of the energy balance). Each phase's density
    and viscosity are taken as for one phase: the vapour model and Wilke's rule for the gas, the liquid records.
  - Where a node is vapour and liquid, the frictional gradient is Lockhart-Martinelli in Chisholm's form
    (`lockhartMartinelli`, `CHISHOLM_C`, `RE_CHISHOLM`). Each phase flowing alone uses the block's own friction factor
    with the wall's roughness, as DWSIM does. Filip et al. use a smooth tube.
  - The gradient is computed as (dp/dz)_L + C √((dp/dz)_L (dp/dz)_G) + (dp/dz)_G, the same number. It becomes the
    single-phase gradient as x goes to 0 or 1. Over a segment, the mean of its two ends.
  - Elevation and acceleration use the homogeneous (no-slip) density (`homogeneous`; Filip et al. eqs. 5-6), as
    DWSIM.
  - The profile's nodes carry `two_phase` (quality, holdup, X, C, φ_L², Re_L, Re_G, f_L, f_G); the state carries
    `two_phase` (method, the C used, quality, holdup, X and φ_L² at the inlet and the outlet).
  - Notes: the method, its scope and its accuracy (Brennen), and, when the fluid boils or condenses in the pipe, that
    the correlation is applied at each node's quality.
  - Warnings (new codes in `WARNING_CODES`): `TWO_PHASE_ELEVATION` for an elevation change, because the no-slip
    holdup underestimates the liquid uphill; `TWO_PHASE_VISCOUS` when a phase alone is below Re 1500. Also
    `FLOW_TRANSITION` for a phase alone between Re 2000 and 3500.
  - Refused, with the reason (`NOT_AVAILABLE`):
    - fittings in gas-liquid flow (no open two-phase loss coefficients found);
    - your own friction factor or viscosity in gas-liquid flow;
    - two liquid phases;
    - critical (choked) gas-liquid flow. When no outlet pressure balances a segment's momentum, the message gives
      G²(−dv/dP) along the pipe's path, which is 1 at the singularity of eq. (9.9). The singularity of eq. (9.9),
      dP (1 − G² (−dv/dP)) = ..., is derived here, not taken from a source.
- **Heat loss, solved anew:** with heat "U", the segment's heat is now solved for Q from a P-H flash:
  Q = U A ΔT_lm(T(P, H − Q)). The old way solved for the temperature, which has no root at a condensing point. The
  single-phase results are unchanged (the fixture test passes at its old tolerances).
- **Tests changed** (AGENTS.md rule 6: the method changed, not the data):
  - `test/pipe.test.js` and `test/pipe-workspace.test.js`: three streams that were refused as two-phase are now
    computed by Lockhart-Martinelli. At their flows they choke, so the tests now expect the choked-flow refusal. Each
    test says why in a comment.
  - By hand, saturated water near 1 bar has a no-slip critical mass flux of about 1100 kg/(m² s). The workspace case
    runs at 2546 kg/(m² s), and the message gives 5.78 ≈ (2546/1070)².
- **The workspace's hint** (`src/ui/pipe-view.js`, one line) now says what is computed and what is refused.
  PR #219 adds the Pipe to the flowsheet palette with its own hint ("one fluid phase only, a two-phase stream is
  refused"). When #219 is merged, that hint must be updated in the merge.

## Checks

- `test/pipe-two-phase.test.js` (5 tests):
  - C and the form of φ² as both open sources print them, the limits, and the no-slip density;
  - five two-component cases (air or a liquid of its own, all four regimes, uphill and downhill) through `pipeProfile`
    against the reference: 20 segments against 2000, within 0.2 %;
  - three steam-water cases through the whole block against CoolProp's IAPWS-95: wet steam, wet steam uphill, and hot
    water that flashes. The drops are within 2.6 %. CHEPTA's ideal-gas steam is 4.5 % lighter than IAPWS-95 at
    500 kPa, which makes the uphill elevation term 4.2 % lower. The liquid density agrees within 0.2 %.
  - a steam pipe that condenses as it loses heat; a valve and a flashing pipe in a flowsheet;
  - the refusals and the warnings.
- `validation/python/reference_pipe.py` writes `validation/fixtures/pipe-two-phase.json`. Its Lockhart-Martinelli
  agrees with `fluids.two_phase.Lockhart_Martinelli` to 4e-16, over all four regimes, with fluids' friction factor and
  Re_c = 1500. `validation/fixtures/pipe.json` is unchanged.
- `npm run build` and `npm test`: see the pull request.

## What the maintainer must check

1. **Filip et al. 2014**, p. 22, eq. (17): C = 5, 10, 12, 20 and the Re limit 1500. **ANL/CP-74646**, Table 1,
   p. 20: the same C. Also the form of eqs. (10)-(16), p. 21.
2. The Brennen quotes (pp. 210-211) in the block's note and the header.
3. The choked-flow refusal on the three formerly refused test streams, and whether the explanation in each test is
   right.

## What the maintainer decided (2026-11-10, relayed by the coordinating session after review)

1. **The Reynolds limit for C:** keep 1500, as Filip et al. print it.
2. **An elevation change in gas-liquid flow:** warns (`TWO_PHASE_ELEVATION`), as built; not refused.
3. **Fittings in gas-liquid flow:** stay refused until an open source is found.
4. **A worked example:** not needed before merging; ocw.snu.ac.kr is not opened.

## Merged with main (2026-11-10)

PR #219 (the Pipe in the flowsheet palette, project format 8) and #218 were merged first. The merge keeps both sides of
`WARNING_CODES` (main's `TWO_LIQUIDS`, these two), joins the ROADMAP row and the proposal's status (step 3 built in
#219; step 4 here), and updates what #219 said about two-phase flow:
- the palette's description and the pipe block's inlet hint now say one fluid phase or gas and liquid, and what is
  refused;
- `test/pipe-project.test.js`: its two-phase refusal test now expects the choked-flow refusal (half steam at 1 atm,
  255 kg/(m² s) in the 5 cm default pipe), and says why.

## What was put to the maintainer (answered above)


1. **The Reynolds limit for C:** 1500, as Filip et al. print it, while the block's own laminar limit is 2000 (DOE).
   ANL/CP-74646 leaves the limit to single-phase tests, and fluids defaults to 2000. *Recommendation:* keep 1500, the
   limit printed with the C values, and say so (as now).
2. **An elevation change in gas-liquid flow:** now computed with the no-slip holdup and a warning, as DWSIM does.
   The alternative is to refuse until Beggs-Brill. *Recommendation:* keep the warning. A small slope is common, and
   the friction usually dominates. Beggs-Brill replaces this for inclined pipes.
3. **Fittings in gas-liquid flow:** refused (no open source found). An alternative is the Lockhart-Martinelli
   multiplier on their Leq/D, a common practice but without an open source in hand. *Recommendation:* keep the
   refusal until an open source is found.
4. **A phase change along the pipe:** the correlation at each node's quality, with a note, rather than
   Martinelli-Nelson. *Recommendation:* keep it. Martinelli-Nelson's charts (Brennen figs. 8.12-8.14) are for
   steam-water only.
5. **A worked example:** allow ocw.snu.ac.kr in the environment's network so the SNU lecture's example can be read,
   or name another open one. *Recommendation:* yes, if a worked example is wanted before merging.
