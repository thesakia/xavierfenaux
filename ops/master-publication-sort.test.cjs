const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../www/master/cockpit.js'), 'utf8');
const start = source.indexOf('function comparePublications(');
const end = source.indexOf('function publicationSortHeader(', start);
const compare = vm.runInNewContext(source.slice(start, end) + '\ncomparePublications');
const rows = [
  {id:'a',publishedAt:'2026-09-17T09:00:00Z',views:10,reactions:1,comments:2,shares:3},
  {id:'b',publishedAt:'2026-09-16T09:00:00Z',views:100,reactions:9,comments:8,shares:7},
  {id:'c',publishedAt:'2026-09-15T09:00:00Z',views:0,reactions:0,comments:0,shares:0},
  {id:'d',publishedAt:'2026-09-18T09:00:00Z',views:null},
];
test('all numeric sorts use numbers and keep missing metrics last in both directions', () => {
  for (const key of ['views','reactions','comments','shares']) {
    assert.deepEqual([...rows].sort((a,b)=>compare(a,b,key,'desc')).map(r=>r.id), ['b','a','c','d']);
    assert.deepEqual([...rows].sort((a,b)=>compare(a,b,key,'asc')).map(r=>r.id), ['c','a','b','d']);
  }
});
test('date sort supports oldest and newest first', () => {
  assert.deepEqual([...rows].sort((a,b)=>compare(a,b,'publishedAt','desc')).map(r=>r.id), ['d','a','b','c']);
  assert.deepEqual([...rows].sort((a,b)=>compare(a,b,'publishedAt','asc')).map(r=>r.id), ['c','b','a','d']);
});
test('metric ties use date then id for a stable order', () => {
  assert.ok(compare(rows[0], {...rows[1],views:10}, 'views', 'desc') < 0);
  assert.ok(compare(rows[0], {...rows[0],id:'z'}, 'views', 'desc') < 0);
});
