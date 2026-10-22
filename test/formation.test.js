// Enthalpy and Gibbs energy of formation (proposal 0010, step 1; validation/python/formation_data.py): every component
// has a record or a "no open data" marker; the ChemSep records are the ideal gas at 298.15 K; the measured records
// follow from the values stored in validation/data/pure/formation/measured.json by the combustion cycle, recomputed
// here independently of the script, and that cycle agrees with a measured enthalpy of formation of the same compound.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pure, listComponents } from "../src/index.js";

const comps = JSON.parse(readFileSync(new URL("../src/data/components.json", import.meta.url))).components;
const measured = JSON.parse(readFileSync(new URL("../validation/data/pure/formation/measured.json", import.meta.url)));
const C = measured._codata;
const R = 8.314462618, T = 298.15;
const formula = f => Object.fromEntries([...f.matchAll(/([A-Z][a-z]?)(\d*)/g)].map(([, el, n]) => [el, Number(n || 1)]));
// ΔfH° of CaHbOc from its standard energy of combustion (products CO2 g, H2O l)
const fromCombustionU = (dcU_J_mol, f) => {
  const dcH = dcU_J_mol + ((f.O ?? 0) / 2 - (f.H ?? 0) / 4) * R * T;
  return (f.C ?? 0) * C.dHf_CO2_g_J_mol + (f.H ?? 0) / 2 * C.dHf_H2O_l_J_mol - dcH;
};

test("every component has a formation record or says no open data, with the sources searched", () => {
  for (const [id, c] of Object.entries(comps)) {
    const f = c.formation;
    assert.ok(f, `${id}: formation`);
    if (f.available === false) {
      assert.ok(f.searched.length >= 3, `${id}: the sources searched`);
      assert.equal(pure(id).formation.available, false);
      continue;
    }
    assert.ok(["ideal gas", "liquid", "solid"].includes(f.state), `${id}: state ${f.state}`);
    assert.equal(f.T_K, 298.15);
    assert.ok(f.source && f.source_ids?.length, `${id}: source`);
    const p = pure(id).formation;
    assert.ok(Number.isFinite(p.Hf_J_mol), `${id}: Hf`);
    assert.ok(p.Gf_J_mol === null || Number.isFinite(p.Gf_J_mol), `${id}: Gf`);
  }
  const listed = listComponents().find(c => c.id === "ethanol");
  assert.equal(listed.formation, true);
});

test("ChemSep records: the ideal gas, both values; the elements in their reference state are zero", () => {
  let n = 0;
  for (const [id, c] of Object.entries(comps)) {
    const f = c.formation;
    if (f.available === false || !f.source_ids.some(s => s.startsWith("chemsep"))) continue;
    n++;
    assert.equal(f.state, "ideal gas", id);
    assert.ok(Number.isFinite(f.Hf_ig_J_mol) && Number.isFinite(f.Gf_ig_J_mol), id);
  }
  // 124 components ChemSep has, less formic acid, whose record is the WebBook's measured gas values by the maintainer's
  // decision (2026-10-22: ChemSep's is 15 kJ/mol below them)
  assert.equal(n, 123, "the components ChemSep has, less formic acid");
  assert.match(comps["formic-acid"].formation.source.name, /Measured gas values: NIST Chemistry WebBook/);
  for (const id of ["hydrogen", "oxygen", "nitrogen", "argon", "helium"]) {
    assert.equal(pure(id).formation.Hf_J_mol, 0, id);
    assert.equal(pure(id).formation.Gf_J_mol, 0, id);
  }
});

test("the combustion cycle, recomputed: levulinic acid (crystal) from its ThermoML energy of combustion", () => {
  const f = formula(comps["levulinic-acid"].formula);
  const row = measured["levulinic-acid"].thermoml.find(r => r.kind === "combustion" && r.doi === "10.1016/j.jct.2011.07.014");
  assert.ok(row, "the ThermoML row");
  const Hf = fromCombustionU(row.value * comps["levulinic-acid"].MW, f);
  const rec = pure("levulinic-acid").formation;
  assert.equal(rec.state, "solid");
  assert.ok(Math.abs(rec.Hf_J_mol - Hf) < 0.1, `${rec.Hf_J_mol} vs ${Hf}`);
});

test("the cycle agrees with a measured enthalpy of formation: succinic acid, WebBook ΔfH° and ThermoML energies of combustion", () => {
  const f = formula(comps["succinic-acid"].formula), MW = comps["succinic-acid"].MW;
  const wb = measured["succinic-acid"].webbook.find(r => r.quantity === "ΔfH°" && r.state === "solid");
  const tml = measured["succinic-acid"].thermoml.filter(r => r.kind === "combustion" && r.T_K === 298.15 && /Specific/.test(r.property));
  assert.ok(wb && tml.length >= 2);
  for (const r of tml) {
    const Hf = fromCombustionU(r.value * MW, f);
    // within the WebBook value's own uncertainty (± 2 kJ/mol)
    assert.ok(Math.abs(Hf - wb.value * 1000) <= wb.uncertainty * 1000, `${r.doi}: ${Hf} vs ${wb.value * 1000}`);
  }
});

test("a crystal of another form is not used; a component held for the maintainer has no record and says why", () => {
  assert.equal(pure("malic-acid").formation.available, false);
  assert.match(comps["malic-acid"].formation.searched.at(-1), /L-malic acid\): the crystal of another form/);
  assert.equal(pure("xylitol").formation.available, false);
  assert.match(comps.xylitol.formation.held, /disagree by about 100 kJ\/mol/);
});

test("the state follows the melting temperature: xylitol-like 'liquid' labels of crystalline compounds are left out", () => {
  const e = comps.erythritol.formation;
  assert.equal(e.state, "solid");
  assert.match(e.source.selection, /left out: .*a crystal at 298\.15 K/);
  assert.equal(comps["fumaric-acid"].formation.state, "solid", "no melting data: the state with more articles");
});
