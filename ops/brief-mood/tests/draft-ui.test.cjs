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

test('warning edition stays available without claiming verified sources', () => {
  const nodes = {};
  const context = {
    $: key => nodes[key] ||= {}, esc: s => String(s ?? ''), day: s => s,
    busy: false, tab: 'brief', selected: new Set(), icons() {}, renderHistory() {},
    state: {today:'2026-09-21',editions:[]},
    edition: {id:'test',day:'2026-09-21',state:'ready_with_warnings',stage:'Disponible avec avertissements',error:null,
      draft:{intro:'Contenu disponible'},brief_text:'Contenu disponible',polarities:'',research:null,
      warnings:['Horaire de publication à vérifier.'],
      audit:{passed:false,issues:['Horaire de publication à vérifier.'],source_checks:[]}},
    document: {querySelectorAll:() => []},
  };
  vm.runInNewContext(render + '\nrender()', context);
  assert.equal(nodes['#alert'].hidden, false);
  assert.match(nodes['#alert'].textContent, /1 point à vérifier/);
  assert.match(nodes['#checks'].innerHTML, /Horaire de publication/);
  assert.doesNotMatch(nodes['#checks'].innerHTML, /contre-vérifié/);
  assert.doesNotMatch(nodes['#document'].innerHTML, /Non envoyé/);
  assert.doesNotMatch(nodes['#word-count'].textContent, /Brouillon/);
  assert.equal(nodes['#copy'].disabled, false);
});
