const CELL = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cell"));
const state = { trace: null, index: 0, mode: "current", timer: null, tokenElements: new Map() };
const $ = selector => document.querySelector(selector);

async function loadExample() {
  const response = await fetch("sample-trace.json");
  if (!response.ok) throw new Error("Could not load the example trace.");
  loadTrace(await response.json());
}

function validateTrace(trace) {
  if (!trace || trace.schemaVersion !== 1 || typeof trace.input !== "string" || !Array.isArray(trace.cycles)) {
    throw new Error("This is not a MonoFlow trace (schema version 1).");
  }
  if (trace.cycles.length === 0) throw new Error("The trace contains no cycles.");
  for (const cycle of trace.cycles) {
    if (!Array.isArray(cycle.stream) || !Array.isArray(cycle.currentEdges)) {
      throw new Error("A cycle is missing its stream or edges.");
    }
  }
}

function loadTrace(trace) {
  validateTrace(trace);
  stop();
  state.trace = trace;
  state.index = 0;
  state.tokenElements.clear();
  $("#token-layer").replaceChildren();
  buildLetters();
  buildLedger();
  $("#cycle-slider").max = String(trace.cycles.length - 1);
  $("#schema-version").textContent = String(trace.schemaVersion);
  $("#run-summary").textContent =
    `${trace.input.length} characters · ${trace.cycles.length} snapshots · ${trace.stopReason}`;
  render();
}

function buildLetters() {
  const input = state.trace.input;
  const letters = $("#letters");
  const indices = $("#indices");
  letters.replaceChildren(...[...input].map(char => {
    const element = document.createElement("span");
    element.className = "letter";
    element.textContent = char === " " ? "·" : char;
    return element;
  }));
  indices.replaceChildren(...[...input].map((_, index) => {
    const element = document.createElement("span");
    element.className = "index";
    element.textContent = index;
    return element;
  }));
  const width = Math.max(input.length * CELL() + 60, $("#letter-stage").parentElement.clientWidth - 6);
  $("#letter-stage").style.width = `${width}px`;
}

function edgeParts(edge) {
  const split = edge.indexOf("->");
  return [edge.slice(0, split), edge.slice(split + 2)];
}

function allEdges() {
  return new Set(state.trace.cycles.flatMap(cycle => cycle.accumulatedEdges));
}

function nodeSort(a, b) {
  return a.length - b.length || a.localeCompare(b);
}

function buildLedger() {
  const bySource = new Map();
  for (const edge of allEdges()) {
    const [from, to] = edgeParts(edge);
    if (!bySource.has(from)) bySource.set(from, new Set());
    bySource.get(from).add(to);
  }
  const ledger = $("#edge-ledger");
  ledger.replaceChildren();
  for (const [from, targets] of [...bySource].sort(([a], [b]) => nodeSort(a, b))) {
    const row = document.createElement("div");
    row.className = "edge-row";
    row.dataset.source = from;
    const source = document.createElement("span");
    source.className = "edge-source";
    source.textContent = from;
    const arrow = document.createElement("span");
    arrow.className = "edge-arrow";
    arrow.textContent = "→";
    const targetWrap = document.createElement("span");
    targetWrap.className = "edge-targets";
    for (const target of [...targets].sort(nodeSort)) {
      const item = document.createElement("span");
      item.className = "edge-target";
      item.dataset.edge = `${from}->${target}`;
      item.textContent = target;
      targetWrap.append(item);
    }
    row.append(source, arrow, targetWrap);
    ledger.append(row);
  }
}

function render() {
  const snapshot = state.trace.cycles[state.index];
  $("#cycle-number").textContent = snapshot.cycle;
  $("#cycle-slider").value = String(state.index);
  $("#previous").disabled = state.index === 0;
  $("#next").disabled = state.index === state.trace.cycles.length - 1;
  $("#cycle-caption").textContent =
    state.index === state.trace.cycles.length - 1
      ? `final traversal · ${state.trace.stopReason}`
      : `snapshot ${state.index + 1} of ${state.trace.cycles.length}`;
  reconcileTokens(snapshot);
  renderDecision(snapshot);
  renderLedger(snapshot);
}

function reconcileTokens(snapshot) {
  const layer = $("#token-layer");
  const active = new Set();
  const previous = state.index > 0 ? state.trace.cycles[state.index - 1] : null;
  const createdRanges = new Set(
    (previous?.created ?? []).map(item => `${item.left.start}:${item.right.end}`),
  );
  const selected = new Set(snapshot.selected);
  const visibleTokens = snapshot.stream.filter(token => token.text !== "^");

  for (const token of visibleTokens) {
    const key = String(token.start);
    active.add(key);
    let element = state.tokenElements.get(key);
    if (!element) {
      element = document.createElement("span");
      element.className = "token";
      element.style.opacity = "0";
      layer.append(element);
      state.tokenElements.set(key, element);
      requestAnimationFrame(() => { element.style.opacity = "1"; });
    }
    element.className = "token";
    if (selected.has(token.id)) element.classList.add("selected");
    if (createdRanges.has(`${token.start}:${token.end}`)) element.classList.add("created");
    element.dataset.name = token.text;
    element.style.left = `${token.start * CELL() + 2}px`;
    element.style.width = `${Math.max((token.end - token.start) * CELL() - 4, 10)}px`;
    element.style.opacity = "1";
  }

  for (const [key, element] of state.tokenElements) {
    if (active.has(key)) continue;
    element.classList.add("leaving");
    element.style.opacity = "0";
  }
}

function renderDecision(snapshot) {
  const decision = $("#decision");
  const maxDegree = Math.max(0, ...Object.values(snapshot.outgoingDegrees));
  $("#degree-badge").textContent = snapshot.selected.length ? `top degree ${maxDegree}` : "no selection";

  if (!snapshot.selected.length) {
    decision.innerHTML = `
      <p class="decision-lead">This is a resting snapshot. No node is selected for another compound.</p>
      <p class="muted">${state.index === state.trace.cycles.length - 1
        ? "The boxes above are the final longest-token traversal."
        : "The outgoing degree fell below the learning threshold."}</p>`;
    return;
  }

  const pills = snapshot.selected.map(node => `<span class="node-pill">${escapeHtml(node)}</span>`).join("");
  const compounds = snapshot.created.length
    ? snapshot.created.map(item => `
      <div class="compound">
        <span>${escapeHtml(item.left.text)}</span><span>+</span>
        <span>${escapeHtml(item.right.text)}</span><span class="equals">→</span>
        <strong>${escapeHtml(item.text)}</strong>
      </div>`).join("")
    : `<p class="muted">Every possible compound was already known.</p>`;
  decision.innerHTML = `
    <p class="decision-lead">Highest remembered outgoing degree: <strong>${maxDegree}</strong>.
      MonoFlow selects every unprocessed node tied at that degree.</p>
    <div class="selected-list">${pills}</div>
    <p class="eyebrow">New compounds</p>
    <div class="compound-list">${compounds}</div>`;
}

function renderLedger(snapshot) {
  const current = new Set(snapshot.currentEdges);
  const memory = new Set(snapshot.accumulatedEdges);
  const shown = state.mode === "current" ? current : memory;
  $("#graph-help").textContent = state.mode === "current"
    ? "Only edges in this traversal. Rows stay put between cycles."
    : "Everything learned so far. Grey edges are remembered but not present now.";

  for (const row of document.querySelectorAll(".edge-row")) {
    let rowActive = false;
    for (const target of row.querySelectorAll(".edge-target")) {
      const edge = target.dataset.edge;
      const isShown = shown.has(edge);
      const isCurrent = current.has(edge);
      target.hidden = !isShown;
      target.classList.toggle("historical", isShown && !isCurrent);
      rowActive ||= isShown;
    }
    row.classList.toggle("inactive", !rowActive);
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function setIndex(index) {
  state.index = Math.max(0, Math.min(index, state.trace.cycles.length - 1));
  render();
}

function stop() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  $("#play").innerHTML = "▶ <span>play</span>";
}

function togglePlay() {
  if (state.timer) return stop();
  if (state.index === state.trace.cycles.length - 1) setIndex(0);
  $("#play").innerHTML = "Ⅱ <span>pause</span>";
  state.timer = setInterval(() => {
    if (state.index === state.trace.cycles.length - 1) return stop();
    setIndex(state.index + 1);
  }, 1650);
}

function showError(error) {
  const box = $("#error");
  box.textContent = error instanceof Error ? error.message : String(error);
  box.hidden = false;
  setTimeout(() => { box.hidden = true; }, 5000);
}

$("#previous").addEventListener("click", () => { stop(); setIndex(state.index - 1); });
$("#next").addEventListener("click", () => { stop(); setIndex(state.index + 1); });
$("#play").addEventListener("click", togglePlay);
$("#cycle-slider").addEventListener("input", event => { stop(); setIndex(Number(event.target.value)); });
$("#reset-example").addEventListener("click", () => loadExample().catch(showError));
$("#trace-file").addEventListener("change", async event => {
  try {
    const file = event.target.files[0];
    if (file) loadTrace(JSON.parse(await file.text()));
  } catch (error) {
    showError(error);
  } finally {
    event.target.value = "";
  }
});
document.querySelectorAll("[data-mode]").forEach(button => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach(item => item.classList.toggle("active", item === button));
    renderLedger(state.trace.cycles[state.index]);
  });
});
window.addEventListener("resize", () => { if (state.trace) { buildLetters(); render(); } });
document.addEventListener("keydown", event => {
  if (event.key === "ArrowLeft") { stop(); setIndex(state.index - 1); }
  if (event.key === "ArrowRight") { stop(); setIndex(state.index + 1); }
  if (event.key === " ") { event.preventDefault(); togglePlay(); }
});

loadExample().catch(showError);
