# 2026-11-04-05: When in doubt, check what other simulators do (a method rule)

The maintainer, 2026-11-04, after the absorber's refusal of an equation of state with a light gas and a polar liquid
(PR #194, question 2): "for question 2 at the absorber we need to have a working equipment. is PR or SRK also refused in
other simulators? Something should work also without the electrolyte model, please check", then: "check again what the
other simulators are doing where you have a doubt, put this as a method in fact".

## What changed

- docs/METHOD_SELECTION.md, new section "When in doubt: what other simulators do": which simulators (those with
  open documentation: DWSIM, ChemSep and COCO, open method guides), what to record (page, date, quoted sentences), what
  it decides (offered, refused or warned; never the source of numbers), and a table of the cases checked.
- AGENTS.md, rules for code: one sentence pointing to it.

## What was checked (2026-11-04)

- DWSIM Property Packages Guide (https://dwsim.org/tutorials/en/reference/property-packages-guide.html): PR with k_ij for
  sour gas; PR/SRK "performs poorly for water/alcohol mixtures"; a specialized Sour Water package for NH3, H2S and CO2
  in water; electrolyte NRTL for aqueous electrolytes.
- DWSIM class library: the base property package has a `UseHenryConstants` switch (its page gives no description).
- The COLAN forum (ChemSep and COCO) was searched; the pages read did not state how ChemSep or COCO treat dissolved
  gases, so nothing is taken from them.

## What the maintainer decided (2026-11-04)

- The absorber: an activity model with Henry's law for the dissolved gases (proposal 1 of the coordinating session's
  answer), built as proposal 0017 (decision file 2026-11-04-07-henry-absorber.md).
- Peng-Robinson and SRK with a light gas and a polar liquid: offered with a warning where the pair has a k_ij, refused
  without one, as DWSIM's guide recommends k_ij for sour gas; sour water and amines wait for the electrolyte methods (M5).
- Wilson: the ThermoML fits next (2026-11-04-06-wilson-fits.md).
