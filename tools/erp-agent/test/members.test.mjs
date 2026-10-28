import { test } from 'node:test';
import assert from 'node:assert/strict';
import { birthKey, checkMembersSql, cleanCard, memberHashes, phoneLast4, syncMembers } from '../members.mjs';

test('normalisation', () => {
  assert.equal(cleanCard(' 0012 3456 '), '00123456');
  assert.equal(cleanCard('12'), null);
  assert.equal(phoneLast4('+39 333 123 4567'), '4567');
  assert.equal(phoneLast4('12345'), null);
  assert.equal(birthKey('1980-05-31'), '19800531');
  assert.equal(birthKey('0000-00-00'), null);
});

test('hashes: leading zeros ignored, checks only with data, no plain data', () => {
  const a = memberHashes('s', { card: '000123456', phone: '3331234567', birth: '1980-05-31' });
  const b = memberHashes('s', { card: '123456', phone: '0039 333 1234567', birth: null });
  assert.equal(a.card_hash, b.card_hash);
  assert.equal(a.phone_hash, b.phone_hash);
  assert.equal(b.birth_hash, null);
  assert.ok(!JSON.stringify(a).includes('4567') && !JSON.stringify(a).includes('123456'));
  assert.equal(memberHashes('s', { card: '123456', active: 0 }).active, false);
  assert.equal(memberHashes('s', { card: '??' }), null);
});

test('members.sql must be a single SELECT', () => {
  assert.equal(checkMembersSql('-- c\nselect 1 as card;'), 'select 1 as card');
  assert.throws(() => checkMembersSql('delete from x'));
  assert.throws(() => checkMembersSql('select 1; drop table x'));
});

test('syncMembers: batches with one sync id, final on the last, duplicates merged', async () => {
  const bodies = [];
  const fetchImpl = async (_url, init) => { const b = JSON.parse(init.body); bodies.push(b); return new Response(JSON.stringify({ member_cards: b.member_cards.length, deactivated: b.final ? 2 : 0 }), { status: 200 }); };
  const rows = Array.from({ length: 6001 }, (_, i) => ({ card: String(100000 + i), phone: '3331234567' }));
  rows.push({ card: '100000', phone: null }, { card: 'x' });
  const s = await syncMembers({ rows, secret: 's', endpoint: 'https://x/erp-sync', fetchImpl });
  assert.equal(s.cards, 6001);
  assert.equal(s.skipped, 1);
  assert.equal(s.deactivated, 2);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].sync_id, bodies[1].sync_id);
  assert.deepEqual(bodies.map((b) => b.final), [false, true]);
  assert.ok(bodies[0].member_cards[0].phone_hash, 'row with phone kept over the duplicate without');
});
