const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8');
const render = source.slice(source.indexOf('function render()'), source.indexOf('async function load('));

test('failed draft is visible and actionable without displaying a successful audit', () => {
  const nodes = {};
  const context = {
    $: key => nodes[key] ||= {}, esc: s => String(s ?? ''), day: s => s,
    busy: false, tab: 'brief', selected: new Set(), icons() {}, renderHistory() {},
    state: {today:'2026-09-18',editions:[]},
    edition: {id:'test',day:'2026-09-18',state:'failed',stage:'A verifier',error:'Source inaccessible',
      draft:{intro:'Brouillon reel'},brief_text:'Brouillon reel',polarities:'',research:null,
      audit:{passed:true,issues:[],source_checks:[]}},
    document: {querySelectorAll:() => []},
  };
  vm.runInNewContext(render + '\nrender()', context);
  assert.match(nodes['#document'].innerHTML, /Brouillon reel/);
  assert.match(nodes['#word-count'].textContent, /Brouillon/);
  assert.equal(nodes['#copy'].disabled, false);
  assert.equal(nodes['#download'].disabled, false);
  assert.equal(nodes['#approve'].disabled, false);
  assert.match(nodes['#checks'].innerHTML, /non valid/);
  assert.doesNotMatch(nodes['#checks'].innerHTML, /contre-vérifié/);
});
