const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../www/master/cockpit.js'), 'utf8');
const start = source.indexOf('function publicationTitle(');
const end = source.indexOf('function socialPosts()', start);
assert.ok(start >= 0 && end > start);
const title = vm.runInNewContext(source.slice(start, end) + '\npublicationTitle');

test('caption keeps only opening sentence, no description or hashtags', () => {
  assert.equal(title({title:'Le carry trade change-t-il ? Voici toute la description. #Japon #Marches'}, 'TikTok'), 'Le carry trade change-t-il ?');
  assert.equal(title({title:'Un titre\n\nLongue description #Bourse'}, 'Instagram'), 'Un titre');
});
test('native video titles stay intact', () => {
  const value = 'La Fed bouge. Et maintenant ?';
  assert.equal(title({title:value}, 'YouTube'), value);
});
test('hashtags and URLs alone do not become titles', () => {
  assert.equal(title({title:'#Bourse #Marches https://example.com'}, 'TikTok'), 'Publication sans titre');
  assert.equal(title({title:''}, 'Instagram'), 'Publication sans titre');
});
test('long openings are bounded and original data stays unchanged', () => {
  const post = {title:'Une analyse ' + 'des marches '.repeat(30)};
  const before = post.title;
  assert.ok(Array.from(title(post, 'TikTok')).length <= 120);
  assert.ok(title(post, 'TikTok').endsWith('\u2026'));
  assert.equal(post.title, before);
});
test('decimal numbers and apostrophes are preserved', () => {
  assert.equal(title({title:"L'IA progresse de 3.5 % aujourd'hui. Voici pourquoi."}, 'TikTok'), "L'IA progresse de 3.5 % aujourd'hui.");
});
