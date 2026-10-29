/**
 * CHEPTA: chemical process simulation that runs in the browser.
 *
 * Units in the programming interface: temperature in K, pressure in kPa,
 * compositions as mole fractions. The interfaces (mount, mountProperties, app) convert
 * for display (°C, bar, wt %).
 */
import { createSystem, listComponents as listDatabank, findComponent as findIn, MODELS } from "./thermo/system.js";
import { checkUserData } from "./thermo/user-data.js";
import { bubbleT, bubbleP, pureBoilingPoints } from "./equilibrium/bubble.js";
import { dewT, dewP } from "./equilibrium/dew.js";
import { flash, rachfordRice } from "./equilibrium/flash.js";
import { CheptaError, ERROR_CODES, isCheptaError } from "./util/errors.js";
import { txy, pxy, ternaryGrid } from "./equilibrium/diagrams.js";
import { residueCurve } from "./equilibrium/residue.js";
import { binaryAzeotropes, findAzeotrope } from "./equilibrium/azeotrope.js";
import { isLiquidStable } from "./equilibrium/stability.js";
import { phaseEnvelope } from "./equilibrium/envelope.js";
import { propertyChart } from "./equilibrium/charts.js";
import { checkPackage, validCas } from "./contrib/package-check.js";
import { pure, PROPERTIES, PROPERTY_NAMES } from "./thermo/pure.js";
import { steam, steamSat } from "./thermo/iapws/steam.js";
import { mount } from "./ui/mount.js";
import { mountProperties } from "./ui/properties.js";
import { app } from "./ui/app.js";
import { brandLogo } from "./ui/brand.js";
import { system } from "./system.js";
import { EOS_MODELS } from "./thermo/system.js";
import { eosBubbleP, eosBubbleT, eosDewP, eosDewT } from "./equilibrium/phi-phi.js";
import { cubicEos } from "./thermo/eos/cubic.js";
import { henry, henryInfo, gasSolubility, HENRY_GASES } from "./thermo/henry.js";
import { library } from "./thermo/library.js";
import { stream, componentFlows, scaleStream, phaseStream } from "./stream/stream.js";
import { registerUnit, runUnit, unitTypes, unitType, specStatus } from "./units/units.js";
import "./units/reactors.js";   // registers the conversion and yield reactors (proposal 0010, step 3)
import "./units/kinetic-reactors.js";   // the CSTR and the plug-flow reactor (proposal 0010, step 5)
import { exchangerArea, exchangerApproach, exchangerRating, overallU, serviceU, foulingRf, filmH, metalConductivity, wallThickness, HEAT_TRANSFER } from "./units/heat-exchange.js";
import { solveFlowsheet, checkFlowsheet, inspectFlowsheet, flowsheetStatus } from "./flowsheet/flowsheet.js";
import { runFlowsheet, normalizeFlowsheet, flowsheetSystem, flowsheetDocStatus } from "./flowsheet/document.js";
import { checkProject, readProject, PROJECT_FORMAT } from "./ui/project.js";
import { run, capabilities, OUTCOMES, RESULT_FORMAT } from "./api/dispatcher.js";
import { sizeDrum, sizeDecanter, flashBlockResult } from "./sizing/sizing.js";   // the drum and decanter sizes (proposal 0015, M1)
import { startRun, runAsync, workerStatus } from "./runtime/browser-worker.js";   // the Web Worker (contract 7, M1)
import { userDataDoc, readUserDataFile, mergeUserData, userDataPackage, userDataKeys, USER_DATA_FORMAT } from "./ui/user-data-file.js";
import pkg from "../package.json" with { type: "json" };

export const version = pkg.version;

/** The databank's components, and with { userData } the user's own after them (proposal 0012). */
const listComponents = (opts = {}) => listDatabank({ userData: checkUserData(opts?.userData) });
/** A component's id from its name, alias, formula or CAS number; with userData the user's own components too. */
const findComponent = (key, userData = null) =>
  findIn(key, userData && typeof userData === "object" && !Array.isArray(userData) ? checkUserData(userData) : null);   // (map passes an index)

import { checkReaction, checkReactions, reactionBalance, reactionProperties, speciesProperties, formationReference, reactionHeat } from "./reactions/reaction.js";
import { reactionRate, rateSpecies, RATE_FORMS, RATE_BASES } from "./reactions/kinetics.js";

export {
  system, app, brandLogo,
  mount, createSystem, listComponents, findComponent, checkUserData, MODELS,
  bubbleT, bubbleP, dewT, dewP, flash, rachfordRice, pureBoilingPoints, txy, pxy, ternaryGrid, residueCurve,
  binaryAzeotropes, findAzeotrope, isLiquidStable, phaseEnvelope, propertyChart, checkPackage, validCas,
  pure, PROPERTIES, PROPERTY_NAMES,
  mountProperties,
  EOS_MODELS, cubicEos, eosBubbleP, eosBubbleT, eosDewP, eosDewT,
  henry, henryInfo, gasSolubility, HENRY_GASES,
  steam, steamSat,
  library,
  stream, componentFlows, scaleStream, phaseStream,
  registerUnit, runUnit, unitTypes, unitType, specStatus,
  exchangerArea, exchangerApproach, exchangerRating, overallU, serviceU, foulingRf, filmH, metalConductivity, wallThickness, HEAT_TRANSFER,
  solveFlowsheet, checkFlowsheet, inspectFlowsheet, flowsheetStatus,
  runFlowsheet, normalizeFlowsheet, flowsheetSystem, flowsheetDocStatus,
  checkProject, readProject, PROJECT_FORMAT,
  run, capabilities, OUTCOMES, RESULT_FORMAT, startRun, runAsync, workerStatus,
  sizeDrum, sizeDecanter, flashBlockResult,
  userDataDoc, readUserDataFile, mergeUserData, userDataPackage, userDataKeys, USER_DATA_FORMAT,
  checkReaction, checkReactions, reactionBalance, reactionProperties, speciesProperties, formationReference, reactionHeat, reactionRate, rateSpecies, RATE_FORMS, RATE_BASES,
  CheptaError, ERROR_CODES, isCheptaError,
  // the names before the rename to CHEPTA (version 0.3): the same class and function
  CheptaError as FugacityError, isCheptaError as isFugacityError,
};
