import { CpModel, CpSat, sum } from 'cp-sat-wasm';
import {
  DESTINATION_TOTALS,
  DISPLAY_DESTINATIONS,
  DISPLAY_SOURCES,
  SOURCE_TOTALS,
  pairKey,
  transitionKey,
} from './data.js';

const solveOptions = {
  executor: 'worker',
  numWorkers: 1,
};

function buildModel(manualLimits = {}, excludedSolutions = []) {
  const model = new CpModel();
  const transitions = {};
  const orderedTransitions = [];
  const orderedKeys = [];

  for (const source of DISPLAY_SOURCES) {
    for (const destination of DISPLAY_DESTINATIONS) {
      const variable = model.newIntVar(
        0,
        Math.min(SOURCE_TOTALS[source], DESTINATION_TOTALS[destination]),
        `from_${source}_to_${destination}`,
      );
      const key = pairKey(source, destination);
      transitions[key] = variable;
      orderedTransitions.push(variable);
      orderedKeys.push(key);
    }
  }

  for (const source of DISPLAY_SOURCES) {
    model.addLinearConstraint(
      sum(DISPLAY_DESTINATIONS.map((destination) => transitions[pairKey(source, destination)])),
      SOURCE_TOTALS[source],
      SOURCE_TOTALS[source],
    );
  }

  for (const destination of DISPLAY_DESTINATIONS) {
    model.addLinearConstraint(
      sum(DISPLAY_SOURCES.map((source) => transitions[pairKey(source, destination)])),
      DESTINATION_TOTALS[destination],
      DESTINATION_TOTALS[destination],
    );
  }

  for (const [key, value] of Object.entries(manualLimits)) {
    const [source, destination, endpoint] = key.split('|');
    const variable = transitions[pairKey(source, destination)];
    model.add(endpoint === 'min' ? variable.ge(value) : variable.le(value));
  }

  for (const solution of excludedSolutions) {
    model.addForbiddenAssignments(
      orderedTransitions,
      [orderedKeys.map((key) => solution.values[key])],
    );
  }

  return { model, transitions, orderedTransitions };
}

async function solveCurrentModel(model) {
  const result = await CpSat.solve(model, solveOptions);
  return result.hasSolution ? result : null;
}

export async function solveBounds(manualLimits = {}, onProgress = () => {}) {
  const { model, transitions } = buildModel(manualLimits);
  const bounds = {};
  const totalSolves = DISPLAY_SOURCES.length * DISPLAY_DESTINATIONS.length * 2;
  let completedSolves = 0;

  for (const source of DISPLAY_SOURCES) {
    for (const destination of DISPLAY_DESTINATIONS) {
      const key = pairKey(source, destination);
      const variable = transitions[key];

      model.minimize(variable);
      const lowerResult = await solveCurrentModel(model);
      completedSolves += 1;
      onProgress(completedSolves, totalSolves);
      if (!lowerResult) return null;
      const lower = Number(lowerResult.value(variable));

      model.maximize(variable);
      const upperResult = await solveCurrentModel(model);
      completedSolves += 1;
      onProgress(completedSolves, totalSolves);
      if (!upperResult) return null;
      bounds[key] = [lower, Number(upperResult.value(variable))];
    }
  }

  return bounds;
}

export async function solveExact(manualLimits = {}, excludedSolutions = []) {
  const { model, transitions } = buildModel(manualLimits, excludedSolutions);
  const result = await solveCurrentModel(model);
  if (!result) return null;

  const values = {};
  for (const [key, variable] of Object.entries(transitions)) {
    values[key] = Number(result.value(variable));
  }
  return values;
}