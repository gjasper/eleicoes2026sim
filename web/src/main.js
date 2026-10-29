import './style.css';
import {
  DESTINATION_TOTALS,
  DISPLAY_DESTINATIONS,
  DISPLAY_SOURCES,
  GROUP_LABELS,
  SOURCE_TOTALS,
  pairKey,
  transitionKey,
} from './data.js';
import { solveBounds, solveExact } from './solver.js';

const app = document.querySelector('#app');
const SOLUTIONS_STORAGE_KEY = 'transition-studio.solutions.v1';
const numberFormat = new Intl.NumberFormat('pt-BR');
const DEFAULT_MINIMUM_FRACTIONS = {
  FB: [4, 5],
  L: [4, 5],
  A: [4, 5],
  BN: [1, 2],
};

function createDefaultLimits() {
  const limits = Object.fromEntries(DISPLAY_SOURCES.flatMap((source) =>
    DISPLAY_DESTINATIONS.map((destination) => [
      transitionKey(source, destination, 'min'),
      Math.ceil(Math.min(SOURCE_TOTALS[source], DESTINATION_TOTALS[destination]) / 100),
    ]),
  ));

  for (const [group, [numerator, denominator]] of Object.entries(DEFAULT_MINIMUM_FRACTIONS)) {
    limits[transitionKey(group, group, 'min')] = Math.floor(
      (numerator * DESTINATION_TOTALS[group]) / denominator,
    );
  }

  return limits;
}

const state = {
  baseBounds: null,
  bounds: null,
  manualLimits: createDefaultLimits(),
  activeDestination: DISPLAY_DESTINATIONS[0],
  solutions: loadSolutions(),
  activeSolutionId: null,
  defaultNoteDismissed: false,
  constraintNotice: '',
  busy: false,
  message: 'Preparando a simulação...',
  messageType: 'working',
  progress: 0,
  progressTotal: 1,
};

function formatAmount(value) {
  return numberFormat.format(value);
}

function loadSolutions() {
  try {
    const saved = JSON.parse(localStorage.getItem(SOLUTIONS_STORAGE_KEY) || '[]');
    return Array.isArray(saved)
      ? saved
        .filter((solution) => solution && Object.keys(solution.values || {}).length === 20)
        .map((solution, index) => ({
          ...solution,
          id: solution.id || `saved-${solution.createdAt || 'solution'}-${index}`,
        }))
      : [];
  } catch {
    return [];
  }
}

function saveSolutions() {
  try {
    localStorage.setItem(SOLUTIONS_STORAGE_KEY, JSON.stringify(state.solutions));
  } catch {
    state.message = 'Solução encontrada, mas o armazenamento do navegador está indisponível.';
    state.messageType = 'warning';
  }
}

function setProgress(done, total) {
  state.progress = done;
  state.progressTotal = total;
  const progress = document.querySelector('#solver-progress');
  if (progress) {
    progress.max = total;
    progress.value = done;
  }
  const detail = document.querySelector('#solver-detail');
  if (detail) detail.textContent = `${formatAmount(done)} de ${formatAmount(total)} cálculos`;
}

function setMessage(message, type = 'ready') {
  state.message = message;
  state.messageType = type;
  const status = document.querySelector('#solver-status');
  if (status) {
    status.dataset.state = type;
    status.querySelector('.status-copy').textContent = message;
  }
}

function renderStatus() {
  if (state.messageType === 'ready') return '';

  return `
    <div class="solver-status" id="solver-status" data-state="${state.messageType}" role="status">
      <span class="status-light" aria-hidden="true"></span>
      <span class="status-copy">${state.message}</span>
      <span id="solver-detail" class="status-detail"></span>
      <progress id="solver-progress" max="${state.progressTotal}" value="${state.progress}"></progress>
    </div>`;
}

function renderTotals() {
  const firstTurnTotal = DISPLAY_SOURCES.reduce((total, source) => total + SOURCE_TOTALS[source], 0);
  const secondTurnTotal = DISPLAY_DESTINATIONS.reduce(
    (total, destination) => total + DESTINATION_TOTALS[destination],
    0,
  );

  return `
    <aside class="ledger" aria-label="Totais do modelo">
      <section class="ledger-group">
        <div class="section-label">1º turno</div>
        ${DISPLAY_SOURCES.map((source) => `
          <div class="ledger-line">
            <span class="ledger-name"><span class="ledger-mark source-mark"></span>${GROUP_LABELS[source]}</span>
            <strong>${formatAmount(SOURCE_TOTALS[source])}</strong>
          </div>`).join('')}
        <div class="ledger-total"><span>Total</span><strong>${formatAmount(firstTurnTotal)}</strong></div>
      </section>
      <section class="ledger-group destination-ledger">
        <div class="section-label">2º turno</div>
        ${DISPLAY_DESTINATIONS.map((destination) => `
          <div class="ledger-line">
            <span class="ledger-name"><span class="ledger-mark destination-mark"></span>${GROUP_LABELS[destination]}</span>
            <strong>${formatAmount(DESTINATION_TOTALS[destination])}</strong>
          </div>`).join('')}
        <div class="ledger-total"><span>Total</span><strong>${formatAmount(secondTurnTotal)}</strong></div>
      </section>
      <div class="ledger-note"><span aria-hidden="true">=</span> Cada voto é atribuído uma única vez.</div>
    </aside>`;
}

function getSelection(source, destination, endpoint) {
  const key = transitionKey(source, destination, endpoint);
  const bounds = state.bounds[pairKey(source, destination)];
  return state.manualLimits[key] ?? bounds[endpoint === 'min' ? 0 : 1];
}

function hasDefaultLimits() {
  const defaultLimits = createDefaultLimits();
  const keys = Object.keys(defaultLimits);
  return Object.keys(state.manualLimits).length === keys.length
    && keys.every((key) => state.manualLimits[key] === defaultLimits[key]);
}

function renderDefaultExplanation() {
  if (!hasDefaultLimits() || state.defaultNoteDismissed) return '';

  return `
    <aside class="default-explanation" aria-label="Valores iniciais da simulação">
      <p>A simulação começa com alguns valores previamente escolhidos.<br>Por exemplo: Flávio Bolsonaro recebe no segundo turno no mínimo 80% dos votos que recebeu no primeiro. Cada transferência também tem um mínimo de 1% do menor total entre origem e destino. Você pode mudar esses e quaisquer outros valores como desejar.</p>
      <button class="default-explanation-close" type="button" aria-label="Fechar informação">×</button>
    </aside>`;
}

function renderTransitionRow(source, destination) {
  const key = pairKey(source, destination);
  const [feasibleMin, feasibleMax] = state.bounds[key];
  const [domainMin, domainMax] = state.baseBounds[key];
  const selectedMin = getSelection(source, destination, 'min');
  const selectedMax = getSelection(source, destination, 'max');
  const minManual = Object.hasOwn(state.manualLimits, transitionKey(source, destination, 'min'));
  const maxManual = Object.hasOwn(state.manualLimits, transitionKey(source, destination, 'max'));
  const disabled = state.busy ? 'disabled' : '';
  const domainRange = domainMax - domainMin || 1;
  const rangeStart = ((selectedMin - domainMin) / domainRange) * 100;
  const rangeEnd = ((selectedMax - domainMin) / domainRange) * 100;

  return `
    <article class="transition-row">
      <div class="transition-heading">
        <div class="transition-label">
          <h3>de ${GROUP_LABELS[source]}</h3>
          <span class="feasible-label">Intervalo viável</span>
        </div>
        <div class="feasible-value">${formatAmount(feasibleMin)} <span>a</span> ${formatAmount(feasibleMax)}</div>
      </div>
      <div class="range-controls">
        <div class="range-control dual-control">
          <div class="range-label">
            <span class="range-endpoint"><span>Mínimo</span><strong id="value-${source}-${destination}-min">${formatAmount(selectedMin)}</strong><span class="constraint-state ${minManual ? 'is-manual' : ''}">${minManual ? 'Escolhido' : 'Auto'}</span></span>
            <span class="range-endpoint"><span>Máximo</span><strong id="value-${source}-${destination}-max">${formatAmount(selectedMax)}</strong><span class="constraint-state ${maxManual ? 'is-manual' : ''}">${maxManual ? 'Escolhido' : 'Auto'}</span></span>
          </div>
          <div class="dual-slider" style="--range-start: ${rangeStart}%; --range-end: ${rangeEnd}%">
            <span class="dual-track" aria-hidden="true"></span>
            <span class="dual-fill" aria-hidden="true"></span>
            <input class="minimum-thumb" type="range" min="${domainMin}" max="${domainMax}" step="1" value="${selectedMin}" aria-label="Mínimo de votos transferidos de ${GROUP_LABELS[source]} para ${GROUP_LABELS[destination]}" aria-valuetext="${formatAmount(selectedMin)} votos" data-domain-min="${domainMin}" data-domain-max="${domainMax}" data-source="${source}" data-destination="${destination}" data-endpoint="min" ${disabled} />
            <input class="maximum-thumb" type="range" min="${domainMin}" max="${domainMax}" step="1" value="${selectedMax}" aria-label="Máximo de votos transferidos de ${GROUP_LABELS[source]} para ${GROUP_LABELS[destination]}" aria-valuetext="${formatAmount(selectedMax)} votos" data-domain-min="${domainMin}" data-domain-max="${domainMax}" data-source="${source}" data-destination="${destination}" data-endpoint="max" ${disabled} />
          </div>
        </div>
      </div>
    </article>`;
}

function renderTabs() {
  return DISPLAY_DESTINATIONS.map((destination) => `
    <button class="destination-tab" role="tab" type="button" aria-label="Para ${GROUP_LABELS[destination]}" aria-selected="${destination === state.activeDestination}" data-destination="${destination}" ${state.busy ? 'disabled' : ''}>
      <span>para ${GROUP_LABELS[destination]}</span><small>${DISPLAY_SOURCES.length} fluxos</small>
    </button>`).join('');
}

function renderSolutions() {
  if (!state.solutions.length) {
    return '<div class="empty-solutions">As soluções encontradas ficam aqui, separadas dos intervalos ajustáveis.</div>';
  }

  const selectedSolutionId = state.activeSolutionId
    || state.solutions[state.solutions.length - 1].id;
  const selectedIndex = state.solutions.findIndex((solution) => solution.id === selectedSolutionId);
  const activeIndex = selectedIndex < 0 ? state.solutions.length - 1 : selectedIndex;
  const activeSolution = state.solutions[activeIndex];

  return `
    <div class="solution-tabs" role="tablist" aria-label="Soluções">
      ${state.solutions.map((solution, index) => `
        <div class="solution-tab-item ${index === activeIndex ? 'is-active' : ''}" role="presentation">
          <button class="solution-tab" id="solution-tab-${index}" type="button" role="tab" aria-selected="${index === activeIndex}" aria-controls="solution-panel-${index}" data-solution-id="${solution.id}">Solução ${index + 1}</button>
          <button class="solution-tab-close" type="button" aria-label="Fechar solução ${index + 1}" data-close-solution="${solution.id}">×</button>
        </div>`).join('')}
    </div>
    <section class="solution-panel" id="solution-panel-${activeIndex}" role="tabpanel" aria-labelledby="solution-tab-${activeIndex}">
      <div class="solution-heading">
        <span>Transferências da solução ${activeIndex + 1}</span>
        <time datetime="${activeSolution.createdAt}">${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(activeSolution.createdAt))}</time>
      </div>
      <div class="sankey-legend" aria-label="Como ler o diagrama">
        <span><i class="sankey-legend-bar" aria-hidden="true"></i> Altura da barra: total de votos do grupo</span>
        <span><i class="sankey-legend-flow" aria-hidden="true"></i> Espessura da faixa: votos transferidos</span>
      </div>
      <div class="sankey-scroll"><div class="solution-sankey" data-solution-id="${activeSolution.id}" role="img" aria-label="Diagrama Sankey de votos transferidos do primeiro para o segundo turno"></div></div>
    </section>`;
}

function render(preserveView = {}) {
  const scrollY = preserveView.scrollY ?? window.scrollY;
  const activeDestination = state.activeDestination;
  const activeBounds = state.bounds
    ? DISPLAY_SOURCES.map((source) => renderTransitionRow(source, activeDestination)).join('')
    : '';

  app.innerHTML = `
    <div class="page-shell">
      <main id="top">
        <section class="intro">
          <div class="intro-copy">
            <div class="eyebrow"><span>01</span> Simulador de transferência de votos</div>
            <h1>Brasil - Eleição presidencial 2026</h1>
            <p>Explore as possibilidades de transferência entre 1º turno e 2º turno. Limites possíveis são computados automaticamente. Soluções exatas podem ser geradas respeitando os intervalos.</p>
          </div>
          ${renderStatus()}
        </section>

        ${state.bounds ? `
          <div class="workspace-grid">
            ${renderTotals()}
            <section class="workbench" aria-labelledby="workbench-title">
              <div class="workbench-head">
                <div class="workbench-title"><h2 id="workbench-title">Votos transferidos</h2><p>Arraste os controles para ajustar os valores de transferência.</p></div>
                ${renderDefaultExplanation()}
                <div class="restart-actions">
                  <button class="button-secondary" id="reset-limits" type="button" ${state.busy || !Object.keys(state.manualLimits).length ? 'disabled' : ''}>Recomeçar</button>
                  <button class="button-secondary" id="restart-defaults" type="button" ${state.busy ? 'disabled' : ''}><span aria-hidden="true">↺</span> Recomeçar com valores</button>
                </div>
              </div>
              <div class="destination-tabs" role="tablist" aria-label="Grupos de destino">${renderTabs()}</div>
              <div class="transition-list">${activeBounds}</div>
              ${state.constraintNotice ? `
                <div class="constraint-notice" role="alert">
                  <span class="constraint-notice-icon" aria-hidden="true">i</span>
                  <p>${state.constraintNotice}</p>
                </div>` : ''}
              <div class="range-footnote"><span class="footnote-mark">i</span> Use os marcadores para editar os valores mínimo e máximo.</div>
            </section>
          </div>

          <section class="solutions-section" aria-labelledby="solutions-title">
            <div class="solutions-head">
              <div><div class="section-label">Atribuições exatas</div><h2 id="solutions-title">Soluções <span>${state.solutions.length}</span></h2><p>Cada execução usa os valores selecionados e adiciona uma atribuição distinta com 20 transferências.</p></div>
              <button class="button-primary" id="find-solution" type="button" ${state.busy ? 'disabled' : ''}><span aria-hidden="true">＋</span> Encontrar solução</button>
            </div>
            <div class="solution-list">${renderSolutions()}</div>
          </section>` : `
          <section class="loading-panel">
            <div class="loading-mark"><span></span><span></span><span></span></div>
            <div><h2>Calculando os votos transferidos</h2><p>Verificando os valores possíveis para as 20 transferências.</p></div>
          </section>`}
      </main>
      <footer><span>Os cálculos são feitos localmente em WebAssembly.</span><a href="mailto:interactiveviz@proton.me">interactiveviz@proton.me</a></footer>
    </div>`;

  attachHandlers();
  renderActiveSankey();
  requestAnimationFrame(() => {
    positionDefaultExplanation();
    if (preserveView.slider) {
      const { source, destination, endpoint } = preserveView.slider;
      document.querySelector(
        `.dual-slider input[data-source="${source}"][data-destination="${destination}"][data-endpoint="${endpoint}"]`,
      )?.focus({ preventScroll: true });
    }
    window.scrollTo(0, scrollY);
  });
}

async function renderActiveSankey() {
  const element = document.querySelector('.solution-sankey');
  if (!element) return;
  const solution = state.solutions.find((item) => item.id === element.dataset.solutionId);
  if (!solution) return;
  const { drawSankey } = await import('./sankey.js');
  if (element.isConnected) drawSankey(element, solution.values);
}

function positionDefaultExplanation() {
  const note = document.querySelector('.default-explanation');
  const title = document.querySelector('.workbench-title');
  const actions = document.querySelector('.restart-actions');
  if (!note || !title || !actions) return;

  const titleBounds = title.getBoundingClientRect();
  const actionsBounds = actions.getBoundingClientRect();
  const preferredWidth = window.innerWidth <= 640 ? 280 : 340;
  const noteWidth = Math.min(preferredWidth, window.innerWidth - 32);
  note.style.width = `${noteWidth}px`;

  const noteHeight = note.getBoundingClientRect().height;
  const availableGap = actionsBounds.left - titleBounds.right;
  const fitsBetween = availableGap >= noteWidth + 24;
  const left = fitsBetween
    ? titleBounds.right + (availableGap - noteWidth) / 2
    : 16;
  const top = fitsBetween
    ? titleBounds.top + (titleBounds.height - noteHeight) / 2
    : titleBounds.bottom + 8;

  note.style.left = `${Math.max(16, left)}px`;
  note.style.top = `${Math.max(16, top)}px`;
}

function attachHandlers() {
  document.querySelectorAll('.destination-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.activeDestination = tab.dataset.destination;
      render();
    });
  });

  document.querySelector('.default-explanation-close')?.addEventListener('click', () => {
    state.defaultNoteDismissed = true;
    render();
  });

  document.querySelectorAll('.solution-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.activeSolutionId = tab.dataset.solutionId;
      render();
    });
  });

  document.querySelectorAll('.solution-tab-close').forEach((button) => {
    button.addEventListener('click', () => closeSolution(button.dataset.closeSolution));
  });

  document.querySelectorAll('.dual-slider input').forEach((input) => {
    input.addEventListener('input', () => {
      const { source, destination, endpoint } = input.dataset;
      const slider = input.closest('.dual-slider');
      const minimumInput = slider.querySelector('[data-endpoint="min"]');
      const maximumInput = slider.querySelector('[data-endpoint="max"]');
      let currentValue = Number(input.value);

      if (endpoint === 'min' && currentValue > Number(maximumInput.value)) {
        currentValue = Number(maximumInput.value);
      } else if (endpoint === 'max' && currentValue < Number(minimumInput.value)) {
        currentValue = Number(minimumInput.value);
      }
      input.value = String(currentValue);

      const minimum = Number(minimumInput.value);
      const maximum = Number(maximumInput.value);
      for (const [currentEndpoint, currentInput] of [['min', minimumInput], ['max', maximumInput]]) {
        const currentLabel = document.querySelector(
          `#value-${source}-${destination}-${currentEndpoint}`,
        );
        const formattedValue = formatAmount(Number(currentInput.value));
        if (currentLabel) currentLabel.textContent = formattedValue;
        currentInput.setAttribute('aria-valuetext', `${formattedValue} votos`);
      }

      const domainMin = Number(input.dataset.domainMin);
      const domainMax = Number(input.dataset.domainMax);
      const domainRange = domainMax - domainMin || 1;
      slider.style.setProperty('--range-start', `${((minimum - domainMin) / domainRange) * 100}%`);
      slider.style.setProperty('--range-end', `${((maximum - domainMin) / domainRange) * 100}%`);
    });
    input.addEventListener('change', commitLimit);
  });

  document.querySelector('#reset-limits')?.addEventListener('click', () => {
    state.manualLimits = {};
    state.defaultNoteDismissed = false;
    state.constraintNotice = '';
    state.bounds = state.baseBounds;
    state.message = 'Valores iniciais restaurados.';
    state.messageType = 'ready';
    state.progress = 0;
    render();
  });

  document.querySelector('#restart-defaults')?.addEventListener('click', restartWithDefaults);
  document.querySelector('#find-solution')?.addEventListener('click', findSolution);
}

function closeSolution(solutionId) {
  const closingIndex = state.solutions.findIndex((solution) => solution.id === solutionId);
  if (closingIndex < 0) return;

  const wasActive = state.activeSolutionId === solutionId
    || (!state.activeSolutionId && closingIndex === state.solutions.length - 1);
  state.solutions.splice(closingIndex, 1);
  if (wasActive) {
    state.activeSolutionId = state.solutions[Math.min(closingIndex, state.solutions.length - 1)]?.id ?? null;
  }
  saveSolutions();
  render();
}

window.addEventListener('resize', positionDefaultExplanation);
window.addEventListener('resize', renderActiveSankey);
window.addEventListener('scroll', positionDefaultExplanation, { passive: true });

async function restartWithDefaults() {
  const defaultLimits = createDefaultLimits();

  state.constraintNotice = '';
  state.busy = true;
  state.message = 'Aplicando valores iniciais...';
  state.messageType = 'working';
  state.progress = 0;
  state.progressTotal = 40;
  render();

  try {
    const bounds = await solveBounds(defaultLimits, setProgress);
    if (!bounds) {
      state.constraintNotice = 'Os valores iniciais não permitem uma solução. Os valores anteriores foram mantidos.';
      state.messageType = 'ready';
    } else {
      state.bounds = bounds;
      state.manualLimits = defaultLimits;
      state.defaultNoteDismissed = false;
      state.message = 'Valores iniciais aplicados.';
      state.messageType = 'ready';
    }
  } catch (error) {
    state.message = `Erro no solucionador: ${error.message}`;
    state.messageType = 'error';
  } finally {
    state.busy = false;
    render();
  }
}

async function commitLimit(event) {
  const input = event.currentTarget;
  const { source, destination, endpoint } = input.dataset;
  const preserveView = {
    scrollY: window.scrollY,
    slider: { source, destination, endpoint },
  };
  const value = Number(input.value);
  const key = transitionKey(source, destination, endpoint);
  const otherEndpoint = endpoint === 'min' ? 'max' : 'min';
  const otherKey = transitionKey(source, destination, otherEndpoint);
  const index = endpoint === 'min' ? 0 : 1;
  const otherIndex = endpoint === 'min' ? 1 : 0;
  const baseEdge = state.baseBounds[pairKey(source, destination)][index];
  const oldLimits = state.manualLimits;
  const nextLimits = { ...oldLimits };

  if (value === baseEdge) delete nextLimits[key];
  else nextLimits[key] = value;

  const otherValue = nextLimits[otherKey] ?? state.bounds[pairKey(source, destination)][otherIndex];
  if ((endpoint === 'min' && value > otherValue) || (endpoint === 'max' && value < otherValue)) {
    state.constraintNotice = 'O mínimo não pode superar o máximo. A alteração foi desfeita.';
    state.messageType = 'ready';
    render(preserveView);
    return;
  }

  state.constraintNotice = '';
  state.busy = true;
  state.message = 'Recalculando os votos transferidos...';
  state.messageType = 'working';
  state.progress = 0;
  state.progressTotal = 40;
  render(preserveView);

  try {
    const nextBounds = Object.keys(nextLimits).length
      ? await solveBounds(nextLimits, setProgress)
      : state.baseBounds;
    if (!nextBounds) {
      state.constraintNotice = 'Essa alteração não permite uma solução. O último valor foi desfeito e os valores anteriores foram mantidos.';
      state.messageType = 'ready';
    } else {
      state.bounds = nextBounds;
      state.manualLimits = nextLimits;
      if (!hasDefaultLimits()) state.defaultNoteDismissed = false;
      state.message = 'Votos transferidos atualizados.';
      state.messageType = 'ready';
    }
  } catch (error) {
    state.message = `Erro no solucionador: ${error.message}`;
    state.messageType = 'error';
  } finally {
    state.busy = false;
    render(preserveView);
  }
}

async function findSolution() {
  state.busy = true;
  state.message = 'Procurando uma nova atribuição exata...';
  state.messageType = 'working';
  state.progress = 0;
  state.progressTotal = 1;
  render();

  try {
    const values = await solveExact(state.manualLimits, state.solutions);
    if (!values) {
      state.message = 'Não há outra solução com os valores atuais.';
      state.messageType = 'warning';
    } else {
      const solution = {
        id: globalThis.crypto?.randomUUID?.() ?? `solution-${Date.now()}`,
        values,
        createdAt: new Date().toISOString(),
      };
      state.solutions.push(solution);
      state.activeSolutionId = solution.id;
      saveSolutions();
      state.message = `Solução ${state.solutions.length} adicionada.`;
      if (state.messageType !== 'warning') state.messageType = 'ready';
    }
  } catch (error) {
    state.message = `Erro no solucionador: ${error.message}`;
    state.messageType = 'error';
  } finally {
    state.busy = false;
    render();
  }
}

async function start() {
  render();
  if (!globalThis.crossOriginIsolated) {
    state.message = 'Esta página precisa dos cabeçalhos COOP/COEP para iniciar o WebAssembly com threads.';
    state.messageType = 'error';
    render();
    return;
  }

  try {
    state.progressTotal = 80;
    state.message = 'Calculando transferências iniciais...';
    const baseBounds = await solveBounds({}, (done, total) => {
      state.message = 'Calculando os intervalos gerais...';
      state.messageType = 'working';
      setProgress(done, total * 2);
    });
    if (!baseBounds) throw new Error('O modelo inicial de transferências é inviável.');
    state.baseBounds = baseBounds;

    const bounds = await solveBounds(state.manualLimits, (done, total) => {
      state.message = 'Aplicando valores iniciais...';
      state.messageType = 'working';
      setProgress(total + done, total * 2);
    });
    if (!bounds) throw new Error('Os valores padrão são inviáveis.');
    state.bounds = bounds;
    state.message = 'A simulação está pronta com os valores iniciais.';
    state.messageType = 'ready';
  } catch (error) {
    state.message = `Não foi possível iniciar o solucionador: ${error.message}`;
    state.messageType = 'error';
  }
  render();
}

start();