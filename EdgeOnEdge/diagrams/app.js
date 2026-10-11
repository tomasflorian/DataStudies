/* All state lives in this tab. Blocks reference shared label objects. */
const $ = id => document.getElementById(id);
const pitch = 124;
// One level of thickness, as the side faces draw it: right and down. A block raised by its
// level moves the opposite way, up and left, so it sits on top of what is under it.
const depth = { x: 16, y: 18 };
const lift = level => ({ x: -level * depth.x, y: -level * depth.y });
let blocks = [], nextId = 1, editing = null, limit = 10;
// How many blocks are drawn, in the order they were built; null shows them all.
let shown = null;
const visibleCount = () => Math.min(shown ?? blocks.length, blocks.length);
// 'stacks' lifts overlapping blocks onto floors; 'dominoes' lays them flat and stops at a clash.
let view = 'stacks';
// The grid cells a block covers, in slot order.
const cellsOf = (b, p) => [0, 1, 2].map(i => `${p.x + (b.direction === 'h' ? i : 0)},${p.y + (b.direction === 'v' ? i : 0)}`);
const label = value => ({ value });
const cut = value => Array.from(value.trim()).slice(0, limit).join('');
const splitLabels = text => text.trim().split(',').flatMap(part => part.trim() ? part.trim().split(/\s+/u) : ['']);
const values = text => splitLabels(text).slice(0, 3).map(cut).concat(['', '', '']).slice(0, 3);

function reset() {
  nextId = 1;
  blocks = [{ id: nextId++, direction: 'h', nodes: [label(''), label(''), label('')], parent: null }];
  shown = null; render();
}

function layout() {
  const points = new Map();
  const roots = new Map();
  for (const block of blocks) {
    let x = 0, y = 0;
    if (block.parent !== null) {
      const parent = blocks.find(b => b.id === block.parent);
      const origin = points.get(parent.id);
      x = origin.x + (parent.direction === 'h' ? block.parentSlot : 0) - (block.direction === 'h' ? block.ownSlot : 0);
      y = origin.y + (parent.direction === 'v' ? block.parentSlot : 0) - (block.direction === 'v' ? block.ownSlot : 0);
    }
    points.set(block.id, { x, y });
    roots.set(block.id, block.parent === null ? block.id : roots.get(block.parent));
  }
  // Pack independent stacks with a full slot of space between their bounds.
  let right = 0;
  for (const root of blocks.filter(b => b.parent === null)) {
    const group = blocks.filter(b => roots.get(b.id) === root.id);
    const left = Math.min(...group.map(b => points.get(b.id).x));
    const edge = Math.max(...group.map(b => points.get(b.id).x + (b.direction === 'h' ? 3 : 1)));
    const shift = right - left;
    group.forEach(b => { points.get(b.id).x += shift; });
    right += edge - left + 1;
  }
  return points;
}

// How high each block is stacked: one level above the highest block already covering any of
// its cells, in drawing order. A block over its parent's shared cell sits one level up; blocks
// that only happen to land on the same cells get floors of their own instead of overprinting.
function stackLevels(points) {
  const heights = new Map(), levels = new Map();
  for (const b of blocks) {
    const cells = cellsOf(b, points.get(b.id));
    const level = Math.max(-1, ...cells.map(cell => heights.get(cell) ?? -1)) + 1;
    cells.forEach(cell => heights.set(cell, level));
    levels.set(b.id, level);
  }
  return levels;
}

// Dominoes touch, they never overlap. Every face covers a few squares (the Squares / face
// setting), so a face has that many squares other tiles can meet. A tile's matching face goes in a square
// next to a square of the face it matches, and the tile reaches away into free squares. It
// touches the table there and nowhere else — one square against one square, so two tiles never
// lie side by side. Tiles go down in build order; a new stack starts right of everything so
// far. The first tile with no such spot is where play stops.
const NEIGHBOURS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
let squares = 4;
const tileLength = () => 3 * squares;
// px per square: smaller squares when a face has more of them, so a tile stays about as long.
const dominoCell = () => Math.max(36, Math.min(80, Math.round(160 / squares)));
// A tile's squares, first face first. A turned-round tile (sign -1) reads right to left, or bottom to top.
const tileCells = (spot) => Array.from({ length: tileLength() }, (_, i) => [spot.x + (spot.direction === 'h' ? i * spot.sign : 0), spot.y + (spot.direction === 'v' ? i * spot.sign : 0)]);
const faceSquares = slot => Array.from({ length: squares }, (_, i) => slot * squares + i);

function dominoLayout() {
  const spots = new Map(), taken = new Set(), joints = [];
  const isTaken = (x, y) => taken.has(`${x},${y}`);
  // The squares of a tile that overlap the table, or touch it anywhere but at its joint.
  const offending = spot => tileCells(spot).flatMap(([x, y], square) =>
    isTaken(x, y) || NEIGHBOURS.some(([dx, dy]) => isTaken(x + dx, y + dy)
      && !(x === spot.face[0] && y === spot.face[1] && x + dx === spot.joint[0] && y + dy === spot.joint[1])) ? [square] : []);
  const put = (b, spot) => { spots.set(b.id, spot); tileCells(spot).forEach(([x, y]) => taken.add(`${x},${y}`)); };
  for (let order = 0; order < blocks.length; order++) {
    const b = blocks[order];
    if (b.parent === null) {
      const right = Math.max(-2, ...[...taken].map(cell => Number(cell.split(',')[0])));
      put(b, { x: right + 2, y: 0, direction: b.direction, sign: 1 });
      continue;
    }
    const parent = spots.get(b.parent), parentCells = tileCells(parent);
    const chain = (b.parentSlot === 2 && b.ownSlot === 0) || (b.parentSlot === 0 && b.ownSlot === 2);
    const preferred = chain ? parent.direction : parent.direction === 'h' ? 'v' : 'h';
    // Every way to put a square of this tile's face next to a square of the face it matches.
    const candidates = [];
    for (const parentSquare of faceSquares(b.parentSlot)) {
      const [px, py] = parentCells[parentSquare];
      for (const sign of [1, -1]) for (const direction of ['h', 'v']) for (const [dx, dy] of NEIGHBOURS) for (const ownSquare of faceSquares(b.ownSlot)) {
        const fx = px + dx, fy = py + dy;
        candidates.push({ x: fx - (direction === 'h' ? ownSquare * sign : 0), y: fy - (direction === 'v' ? ownSquare * sign : 0),
          direction, sign, face: [fx, fy], joint: [px, py], straight: (direction === 'h') === (dx !== 0) });
      }
    }
    // Preferred, in order: a tile that runs straight away from its joint, like a spoke, so it
    // leaves room around the face; one the right way round, since a turned-round tile reads
    // backwards; and the chain-or-turn direction.
    candidates.sort((one, other) => (other.straight - one.straight) || (other.sign - one.sign)
      || ((one.direction !== preferred) - (other.direction !== preferred)));
    const spot = candidates.find(c => offending(c).length === 0);
    if (!spot) {
      // The tile hovers where it wanted to go; the squares in the way get a cross.
      const wanted = candidates.find(c => !tileCells(c).some(([x, y]) => x === c.joint[0] && y === c.joint[1])) ?? candidates[0];
      return { spots, joints, stopAt: order, wanted, blocked: offending(wanted), face: b.nodes[b.ownSlot].value };
    }
    put(b, spot);
    joints.push({ order, from: spot.joint, to: spot.face });
  }
  return { spots, joints, stopAt: blocks.length };
}

function renderDominoes() {
  const { spots, joints, stopAt, wanted, blocked, face } = dominoLayout();
  const visible = visibleCount(), drawn = Math.min(visible, stopAt + 1);
  const shownSpots = blocks.slice(0, drawn).map((b, order) => order === stopAt ? wanted : spots.get(b.id));
  const xs = shownSpots.flatMap(s => tileCells(s).map(([x]) => x)), ys = shownSpots.flatMap(s => tileCells(s).map(([, y]) => y));
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const cell = dominoCell();
  const width = (Math.max(...xs) - minX + 1) * cell, height = (Math.max(...ys) - minY + 1) * cell;
  const board = $('board');
  board.replaceChildren();
  const padX = Math.max(65, ($('viewport').clientWidth - width) / 2), padY = Math.max(65, ($('viewport').clientHeight - height) / 2);
  board.style.width = `${width + padX * 2}px`; board.style.height = `${height + padY * 2}px`;
  const left = x => padX + (x - minX) * cell, top = y => padY + (y - minY) * cell;

  blocks.slice(0, drawn).forEach((b, order) => {
    const clashing = order === stopAt, spot = shownSpots[order];
    const cells = tileCells(spot), cornerX = Math.min(...cells.map(([x]) => x)), cornerY = Math.min(...cells.map(([, y]) => y));
    // The tile that cannot go down hovers one step up and left, over whatever is in its way.
    const hover = clashing ? lift(1) : { x: 0, y: 0 };
    const el = document.createElement('div');
    el.className = `domino${spot.direction === 'v' ? ' vertical' : ''}${clashing ? ' clash' : ''}${shown !== null && order === visible - 1 ? ' newest' : ''}`;
    el.style.left = `${left(cornerX) + hover.x}px`; el.style.top = `${top(cornerY) + hover.y}px`;
    el.style.width = `${spot.direction === 'h' ? cell * tileLength() : cell}px`;
    el.style.height = `${spot.direction === 'v' ? cell * tileLength() : cell}px`;
    el.style.setProperty?.('--square', `${cell}px`);
    el.style.zIndex = clashing ? blocks.length + 2 : 1;
    (spot.sign === 1 ? [0, 1, 2] : [2, 1, 0]).forEach(slot => {
      const face = document.createElement('div');
      face.className = `face${slot === 1 ? ' name' : ''}`;
      face.textContent = b.nodes[slot].value;
      face.style.fontSize = `${Math.min(14, cell * squares * .9 / (Math.max(limit, 1) * .62), cell * .45)}px`;
      if (clashing && faceSquares(slot).some(square => blocked.includes(square))) {
        const cross = document.createElement('span'); cross.className = 'cross'; cross.textContent = '✕'; face.append(cross);
      }
      // A turned-round tile says which way it reads: from its first face to its last.
      if (slot === 1 && spot.sign === -1) {
        const arrow = document.createElement('span'); arrow.className = 'flip'; arrow.textContent = spot.direction === 'h' ? '←' : '↑'; face.append(arrow);
      }
      el.append(face);
    });
    board.append(el);
  });
  // A dot on the edge where two matching faces touch, for every tile placed so far.
  joints.filter(joint => joint.order < Math.min(drawn, stopAt)).forEach(({ from, to }) => {
    const dot = document.createElement('div'); dot.className = 'joint';
    dot.style.left = `${left((from[0] + to[0]) / 2) + cell / 2}px`; dot.style.top = `${top((from[1] + to[1]) / 2) + cell / 2}px`;
    dot.style.zIndex = blocks.length + 1;
    board.append(dot);
  });
  const placed = Math.min(drawn, stopAt);
  footer(visible, stopAt < blocks.length && visible > stopAt
    ? `${placed} of ${blocks.length} tiles placed · block ${blocks[stopAt].id} stopped: no spot that touches only at “${face}”`
    : `${placed} of ${blocks.length} tiles placed`);
}

// The footer and the stepper, for either view.
function footer(visible, text) {
  $('count').textContent = text;
  $('step').textContent = `${visible} / ${blocks.length}`;
  $('back').disabled = visible <= 1;
  $('forward').disabled = visible >= blocks.length;
}

function matches(entries, block) {
  const found = [];
  entries.forEach((value, ownSlot) => {
    if (!value) return;
    block.nodes.forEach((node, parentSlot) => {
      if (node.value === value) found.push({ ownSlot, parentSlot });
    });
  });
  return found;
}

function render() {
  if (view === 'dominoes') return renderDominoes();
  const points = layout();
  const levels = stackLevels(points);
  const topLevel = Math.max(...levels.values()), maxLift = lift(topLevel);
  let minX = 0, minY = 0, maxX = 3, maxY = 1;
  for (const b of blocks) {
    const p = points.get(b.id);
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + (b.direction === 'h' ? 3 : 1));
    maxY = Math.max(maxY, p.y + (b.direction === 'v' ? 3 : 1));
  }
  const board = $('board');
  board.replaceChildren();
  const width = (maxX - minX) * pitch, height = (maxY - minY) * pitch;
  const padX = Math.max(65 - maxLift.x, ($('viewport').clientWidth - width) / 2);
  const padY = Math.max(65 - maxLift.y, ($('viewport').clientHeight - height) / 2);
  board.style.width = `${width + padX * 2}px`;
  board.style.height = `${height + padY * 2}px`;
  // Positions come from the whole diagram, so stepping never moves what is already drawn.
  const visible = visibleCount();
  blocks.forEach((b, order) => {
    if (order >= visible) return;
    const p = points.get(b.id), el = document.createElement('div');
    el.className = `block ${b.direction === 'v' ? 'vertical' : ''}${shown !== null && order === visible - 1 ? ' newest' : ''}`;
    const raised = lift(levels.get(b.id));
    el.style.left = `${padX + (p.x - minX) * pitch + raised.x}px`;
    el.style.top = `${padY + (p.y - minY) * pitch + raised.y}px`;
    // Higher blocks cover lower ones; within a level, later blocks are on top.
    el.style.zIndex = levels.get(b.id) * blocks.length + order + 1;
    const w = b.direction === 'h' ? pitch * 3 : pitch;
    const h = b.direction === 'v' ? pitch * 3 : pitch;
    const ns = 'http://www.w3.org/2000/svg';
    const faces = document.createElementNS(ns, 'svg');
    faces.classList.add('box-faces');
    faces.setAttribute('width', w + depth.x); faces.setAttribute('height', h + depth.y);
    faces.setAttribute('aria-hidden', 'true');
    [
      [`0,${h} ${w},${h} ${w + depth.x},${h + depth.y} ${depth.x},${h + depth.y}`, '#a7b89a'],
      [`${w},0 ${w + depth.x},${depth.y} ${w + depth.x},${h + depth.y} ${w},${h}`, '#829775'],
      [`0,0 ${w},0 ${w},${h} 0,${h}`, '#fcfdf9'],
    ].forEach(([points, fill]) => {
      const face = document.createElementNS(ns, 'polygon');
      face.setAttribute('points', points); face.setAttribute('fill', fill);
      face.setAttribute('stroke', '#677d5c'); face.setAttribute('stroke-width', '1');
      faces.append(face);
    });
    el.append(faces);
    b.nodes.forEach((node, i) => {
      const slot = document.createElement('div'); slot.className = 'slot';
      const edit = document.createElement('button'); edit.className = 'edit';
      edit.textContent = node.value || 'Click to edit';
      edit.style.fontSize = `${Math.min(18, 103 / (Math.max(limit, 1) * .62))}px`;
      if (!node.value) edit.classList.add('empty');
      edit.setAttribute('aria-label', `Edit block ${b.id}, position ${i + 1}${node.value ? ': ' + node.value : ''}`);
      edit.onclick = () => openEditor(b);
      const number = document.createElement('span'); number.className = 'slot-number'; number.textContent = i + 1;
      const add = document.createElement('button'); add.className = 'attach'; add.textContent = '+';
      add.setAttribute('aria-label', `Attach block at block ${b.id}, position ${i + 1}`);
      add.onclick = () => openEditor(b, i);
      slot.append(edit, number, add); el.append(slot);
    });
    board.append(el);
  });
  footer(visible, `${blocks.length} block${blocks.length === 1 ? '' : 's'}`);
}

function openEditor(block, slot = null) {
  editing = { block, slot };
  const attaching = slot !== null;
  $('title').textContent = attaching ? 'Attach block' : 'Edit block';
  $('save').textContent = attaching ? 'Attach' : 'Save';
  $('delete').hidden = attaching;
  $('direction').value = attaching ? (block.direction === 'h' ? 'v' : 'h') : block.direction;
  $('labels').value = attaching ? [block.nodes[slot].value, '', ''].join(',') : block.nodes.map(n => n.value).join(',');
  $('labels').setCustomValidity('');
  updateHelp();
  $('editor').showModal();
  $('labels').focus(); $('labels').select();
}

function updateHelp() {
  $('help').textContent = `Separate three labels with commas or spaces. Up to ${limit} characters each; extras are cut.`;
  const attaching = editing?.slot !== null;
  $('shared').hidden = !attaching;
  if (attaching) {
    const found = matches(values($('labels').value), editing.block);
    $('shared').textContent = found.length === 1
      ? `Position ${found[0].ownSlot + 1} matches position ${found[0].parentSlot + 1} of this block. They will share a label.`
      : found.length === 0 ? 'No matching label: this will start a new stack.'
      : 'More than one match. Use only one matching label to connect these blocks.';
  }
}

$('labels').oninput = () => { $('labels').setCustomValidity(''); updateHelp(); };
$('form').onsubmit = event => {
  event.preventDefault();
  if (splitLabels($('labels').value).length > 3) {
    $('labels').setCustomValidity('Use at most three slots, separated by commas or spaces.');
    $('labels').reportValidity(); return;
  }
  const entries = values($('labels').value), { block, slot } = editing;
  if (slot !== null) {
    const found = matches(entries, block);
    if (found.length > 1) {
      $('labels').setCustomValidity('More than one matching position. Keep only one match, or none to start a new stack.');
      $('labels').reportValidity(); return;
    }
    const nodes = entries.map(label), match = found[0];
    if (match) nodes[match.ownSlot] = block.nodes[match.parentSlot];
    blocks.push({ id: nextId++, direction: $('direction').value, nodes,
      parent: match ? block.id : null, parentSlot: match?.parentSlot, ownSlot: match?.ownSlot });
  } else {
    entries.forEach((v, i) => { block.nodes[i].value = v; });
    block.direction = $('direction').value;
  }
  shown = null; $('editor').close(); render();
};
$('delete').onclick = () => {
  // Descendants depend on this block's anchor and are removed together.
  const removed = new Set([editing.block.id]);
  for (const b of blocks) if (removed.has(b.parent)) removed.add(b.id);
  blocks = blocks.filter(b => !removed.has(b.id));
  $('editor').close();
  shown = null;
  if (!blocks.length) reset(); else render();
};
$('close').onclick = () => $('editor').close();
$('reset').onclick = reset;
$('squares').onchange = () => {
  squares = Math.max(1, Math.min(8, Math.round(Number($('squares').value) || 4)));
  $('squares').value = squares; render();
};
$('view').onclick = () => {
  view = view === 'stacks' ? 'dominoes' : 'stacks';
  $('view').textContent = `View: ${view === 'stacks' ? 'Stacks' : 'Dominoes'}`;
  render();
};
// Step through the build: each block appears in the order it was added.
$('back').onclick = () => { shown = Math.max(1, visibleCount() - 1); render(); };
$('forward').onclick = () => { shown = Math.min(blocks.length, visibleCount() + 1); render(); };
window.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]') || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
  if (event.key === 'ArrowLeft') $('back').onclick();
  if (event.key === 'ArrowRight') $('forward').onclick();
});
$('limit').onchange = () => {
  limit = Math.max(1, Math.min(100, Math.round(Number($('limit').value) || 10)));
  $('limit').value = limit;
  blocks.forEach(b => b.nodes.forEach(n => { n.value = cut(n.value); })); render();
};
window.addEventListener('resize', render);

function exportDiagram() {
  const nodes = [], ids = new Map();
  return { version: 1, limit, blocks: blocks.map(b => ({
    id: b.id, direction: b.direction, parent: b.parent,
    ...(b.parent !== null ? { parentSlot: b.parentSlot, ownSlot: b.ownSlot } : {}),
    nodes: b.nodes.map(n => {
      if (!ids.has(n)) { ids.set(n, nodes.length); nodes.push(n.value); }
      return ids.get(n);
    }),
  })), nodes };
}

function importDiagram(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw Error('Invalid JSON. Paste the complete exported diagram.'); }
  const validSlot = n => Number.isInteger(n) && n >= 0 && n < 3;
  if (!data || data.version !== 1 || !Number.isInteger(data.limit) || data.limit < 1 || data.limit > 100
    || !Array.isArray(data.nodes) || !Array.isArray(data.blocks) || !data.blocks.length
    || !data.nodes.every(n => typeof n === 'string' && Array.from(n).length <= data.limit)) {
    throw Error('Invalid diagram format or character limit.');
  }
  const nodes = data.nodes.map(label), seen = new Map(), imported = [];
  for (const b of data.blocks) {
    if (!b || !Number.isSafeInteger(b.id) || b.id < 1 || b.id >= Number.MAX_SAFE_INTEGER || seen.has(b.id)
      || !['h', 'v'].includes(b.direction) || !Array.isArray(b.nodes) || b.nodes.length !== 3
      || !b.nodes.every(n => Number.isInteger(n) && n >= 0 && n < nodes.length)) {
      throw Error('Invalid block or label reference.');
    }
    if (b.parent !== null) {
      const parent = seen.get(b.parent);
      if (!parent || !validSlot(b.parentSlot) || !validSlot(b.ownSlot)
        || parent.nodes[b.parentSlot] !== nodes[b.nodes[b.ownSlot]]) {
        throw Error('Invalid intersection. Parents must precede children and share the intersecting label.');
      }
    }
    const block = { id: b.id, direction: b.direction, parent: b.parent,
      parentSlot: b.parentSlot, ownSlot: b.ownSlot, nodes: b.nodes.map(n => nodes[n]) };
    imported.push(block); seen.set(b.id, block);
  }
  // Replace state only after the entire document passes validation.
  blocks = imported; limit = data.limit; nextId = Math.max(...blocks.map(b => b.id)) + 1;
  $('limit').value = limit; shown = null; render();
}

function openJson(importing) {
  $('json-title').textContent = importing ? 'Import JSON' : 'Export JSON';
  $('json-text').readOnly = !importing;
  $('json-text').value = importing ? '' : JSON.stringify(exportDiagram(), null, 2);
  $('import-json').hidden = !importing; $('copy-json').hidden = importing;
  $('copy-json').textContent = 'Copy JSON'; $('json-error').textContent = '';
  $('json-help').textContent = importing ? 'Paste a saved diagram. Import replaces the current canvas.' : 'Copy this JSON and save it to restore your diagram later.';
  $('json-dialog').showModal(); $('json-text').focus();
  if (!importing) $('json-text').select();
}
$('export').onclick = () => openJson(false);
$('import').onclick = () => openJson(true);
$('json-close').onclick = () => $('json-dialog').close();
$('json-text').oninput = () => { $('json-error').textContent = ''; };
$('json-form').onsubmit = event => {
  event.preventDefault();
  if ($('import-json').hidden) return;
  try { importDiagram($('json-text').value); $('json-dialog').close(); }
  catch (error) { $('json-error').textContent = error.message; }
};
$('copy-json').onclick = async () => {
  $('json-text').focus(); $('json-text').select();
  try { await navigator.clipboard.writeText($('json-text').value); $('copy-json').textContent = 'Copied'; }
  catch { $('json-help').textContent = 'JSON selected. Press Ctrl+C (or ⌘C) to copy.'; }
};
reset();
