export const SOURCE_COMPONENTS = {
  O: ['EAC', 'RS', 'RC', 'Z', 'S', 'HD', 'CB', 'EC', 'VWG', 'RCP'],
  BN: ['B', 'N'],
};

export const DESTINATION_COMPONENTS = {
  BN: ['B', 'N'],
};

export const DISPLAY_SOURCES = ['O', 'FB', 'L', 'BN', 'A'];
export const DISPLAY_DESTINATIONS = ['FB', 'L', 'BN', 'A'];
export const GROUP_LABELS = {
  O: 'Outros',
  FB: 'Flávio Bolsonaro',
  L: 'Lula',
  BN: 'Brancos/Nulos',
  A: 'Abstenções',
};

const sourceCounts = {
  FB: 56104503,
  L: 53879538,
  EAC: 3448569,
  RS: 2675887,
  RC: 2605148,
  Z: 326488,
  S: 122911,
  HD: 43103,
  CB: 40043,
  EC: 22693,
  VWG: 16881,
  RCP: 15024,
  B: 2300798,
  N: 3674249,
  A: 33469244,
};

const destinationCounts = {
  FB: 59826041,
  L: 64256232,
  B: 1430496,
  N: 2723305,
  A: 30509005,
};

function summarizeCounts(counts, summaries) {
  const totals = { ...counts };
  for (const [summary, components] of Object.entries(summaries)) {
    totals[summary] = components.reduce((total, component) => total + counts[component], 0);
  }
  return totals;
}

export const SOURCE_TOTALS = summarizeCounts(sourceCounts, SOURCE_COMPONENTS);
export const DESTINATION_TOTALS = summarizeCounts(destinationCounts, DESTINATION_COMPONENTS);

export function transitionKey(source, destination, endpoint) {
  return `${source}|${destination}|${endpoint}`;
}

export function pairKey(source, destination) {
  return `${source}|${destination}`;
}