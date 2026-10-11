const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor() {
    this.style = {}; this.value = ''; this.clientWidth = 1000; this.clientHeight = 650;
    this.classList = { add() {} };
  }
  replaceChildren() {} append() {} setAttribute() {} reportValidity() {}
  showModal() {} close() {} focus() {} select() {}
  setCustomValidity(value) { this.error = value; }
}
const elements = new Map();
const context = vm.createContext({ assert, console,
  document: {
    getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
    createElement() { return new Element(); }, createElementNS() { return new Element(); },
  }, window: { addEventListener() {} },
});
vm.runInContext(fs.readFileSync(`${__dirname}/app.js`, 'utf8'), context);
vm.runInContext(`
function submit(text) { $('labels').value = text; $('form').onsubmit({ preventDefault() {} }); }
assert.equal(values('a b c').join(','), 'a,b,c');
assert.equal(values(' a, b c ').join(','), 'a,b,c');
assert.equal(values('a,,c').join(','), 'a,,c');
openEditor(blocks[0]); submit('a b c');
openEditor(blocks[0], 0); submit('x c y');
assert.equal(blocks[1].ownSlot, 1); assert.equal(blocks[1].parentSlot, 2);
let points = layout();
assert.equal(points.get(2).x, points.get(1).x + 2);
assert.equal(points.get(2).y, points.get(1).y - 1);
openEditor(blocks[0], 0); submit('x y b');
assert.equal(blocks[2].ownSlot, 2);
openEditor(blocks[0], 0); submit('u v w');
assert.equal(blocks[3].parent, null);
const beforeError = JSON.stringify(exportDiagram());
openEditor(blocks[0], 0); submit('a b z');
assert.equal(JSON.stringify(exportDiagram()), beforeError);
assert.ok($('labels').error);
openEditor(blocks[0]); submit('a b c extra');
assert.equal(JSON.stringify(exportDiagram()), beforeError);
$('limit').value = '7'; $('limit').onchange();
const saved = JSON.stringify(exportDiagram());
reset(); importDiagram(saved);
assert.equal(JSON.stringify(exportDiagram()), saved);
assert.equal(limit, 7);
assert.equal(blocks[1].nodes[1], blocks[0].nodes[2]);
openEditor(blocks[1]); submit('x updated y');
assert.equal(blocks[0].nodes[2].value, 'updated');
openEditor(blocks[3], 0); submit('u next end');
assert.equal(new Set(blocks.map(b => b.id)).size, blocks.length);
const stable = JSON.stringify(exportDiagram());
const bad = JSON.parse(stable); bad.blocks[1].parent = bad.blocks[1].id;
assert.throws(() => importDiagram(JSON.stringify(bad)), /Invalid intersection/);
assert.throws(() => importDiagram('{'), /Invalid JSON/);
assert.throws(() => importDiagram('null'), /Invalid diagram/);
const badLabel = JSON.parse(stable); badLabel.blocks[0].nodes[0] = 1000;
assert.throws(() => importDiagram(JSON.stringify(badLabel)), /Invalid block/);
const brokenShare = JSON.parse(stable); brokenShare.blocks[1].nodes[1] = brokenShare.blocks[1].nodes[0];
assert.throws(() => importDiagram(JSON.stringify(brokenShare)), /Invalid intersection/);
assert.equal(JSON.stringify(exportDiagram()), stable);
// A raised block moves by its thickness, up and left, the way its side faces are drawn.
assert.equal(lift(2).x, -2 * depth.x); assert.equal(lift(2).y, -2 * depth.y);
// Blocks covering the same cell never share a level, so the offset always separates them.
function cellsByLevel() {
  const points = layout(), levels = stackLevels(points), seen = new Map();
  for (const b of blocks) for (let i = 0; i < 3; i++) {
    const p = points.get(b.id), key = (p.x + (b.direction === 'h' ? i : 0)) + ',' + (p.y + (b.direction === 'v' ? i : 0)) + '@' + levels.get(b.id);
    assert.ok(!seen.has(key), 'two blocks on one cell at one level'); seen.set(key, b.id);
  }
}
cellsByLevel();
// Stepping shows the blocks in build order, and any change shows them all again.
const total = blocks.length;
$('back').onclick(); assert.equal(visibleCount(), total - 1); assert.equal($('step').textContent, (total - 1) + ' / ' + total);
$('back').onclick(); $('forward').onclick(); assert.equal(visibleCount(), total - 1);
for (let i = 0; i < total; i++) $('back').onclick();
assert.equal(visibleCount(), 1); assert.equal($('back').disabled, true);
openEditor(blocks[0], 0); submit('a q r');
assert.equal(visibleCount(), blocks.length);
openEditor(blocks[0], 0); submit('a s t');
// Dominoes stop at the first tile that would cover a different face, and say so.
// Tiles touch and never overlap; crowd one face until there is no free spot next to it.
for (let i = 0; i < 20 && dominoLayout().stopAt === blocks.length; i++) { openEditor(blocks[0], 1); submit('b k' + i + ' m' + i); }
const play = dominoLayout(), used = new Set();
for (const [id, spot] of play.spots) for (const [x, y] of tileCells(spot)) { assert.ok(!used.has(x + ',' + y), 'tiles overlap'); used.add(x + ',' + y); }
assert.ok(play.stopAt < blocks.length); assert.ok(play.blocked.length > 0);
// Tiles touch only at their joints: every edge between two different tiles is a joint.
const owner = new Map();
for (const [id, spot] of play.spots) for (const [x, y] of tileCells(spot)) owner.set(x + ',' + y, id);
let contacts = 0;
for (const [cell, id] of owner) { const [x, y] = cell.split(',').map(Number);
  for (const [dx, dy] of [[1, 0], [0, 1]]) { const other = owner.get((x + dx) + ',' + (y + dy)); if (other !== undefined && other !== id) contacts++; } }
assert.equal(contacts, play.joints.length);
$('view').onclick(); assert.equal(view, 'dominoes'); assert.ok($('count').textContent.includes('stopped'));
$('view').onclick(); assert.equal(view, 'stacks');
cellsByLevel();
// Three tiles sharing a first face all fit, and every tile is six squares.
reset(); openEditor(blocks[0]); submit('a b c');
for (const tail of ['d e', 'f g', 'h i']) { openEditor(blocks[0], 0); submit('a ' + tail); }
const turned = dominoLayout();
assert.equal(turned.stopAt, blocks.length);
assert.ok([...turned.spots.values()].every(spot => tileCells(spot).length === 3 * squares));
console.log('Passed: depth offset, separators, matching, alignment, errors, JSON round trip, shared edits, IDs, and invalid-import preservation.');
`, context);
