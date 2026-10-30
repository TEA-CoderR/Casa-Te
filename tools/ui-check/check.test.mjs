import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSource, isStateTint } from './check.mjs';

test('pale green and pale red tints are state tints; warm neutrals and strong colours are not', () => {
  for (const c of ['#F1F6EE', '#E8EFE6', '#EBF1E5', '#E3EEDD', '#F8E9E7', '#FCEDEA']) assert.equal(isStateTint(c), true, c);
  for (const c of ['#FFFFFF', '#F5F3EC', '#EAE6DB', '#F4EFE6', '#F5E6C8', '#1F4127', '#F3E33A', '#C8231F']) assert.equal(isStateTint(c), false, c);
});

test('flags the September demo patterns', () => {
  const bad = [
    "  optionOn: { borderColor: colors.green, borderWidth: 2, backgroundColor: '#F1F6EE' },",
    "  status: { paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#EBF1E5' },",
    "  pCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.mint },",
    "  mint: '#E3EEDD',",
    "    <View style={[styles.option, selected && { backgroundColor: '#F3F8EF' }]} />",
    "  title: { fontSize: 26, fontWeight: '600', color: colors.text },",
  ];
  for (const line of bad) assert.ok(checkSource(line).length > 0, line);
});

test('accepts the design F patterns and marked exceptions', () => {
  const good = [
    "  optionOn: { borderColor: colors.green, borderWidth: 2, paddingVertical: 13 },",
    "  notice: { borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1 },",
    "  statusReady: { height: 28, borderRadius: 14, backgroundColor: colors.yellow },",
    "  title: { fontSize: 28, fontFamily: fonts.display, color: colors.text },",
    "  closer: { backgroundColor: '#FBEDEB' }, // ui-check: allow (desktop offers tile)",
    "  onBrand: '#CFDDC6',",
  ];
  for (const line of good) assert.deepEqual(checkSource(line), [], line);
});
