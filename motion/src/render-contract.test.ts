import assert from 'node:assert/strict';
import test from 'node:test';
import { FORMATS } from './formats/index.ts';
import { SHOOTOUT_EXAMPLE, shootoutDurationSeconds, shootoutTimelineFor, shootoutTotals, validateShootout } from './formats/shootout.ts';
import { renderFormat } from './render.ts';

test('missing generation metrics keep every shot, omit the race and never fabricate totals', () => {
  const spec = structuredClone(SHOOTOUT_EXAMPLE);
  const full = shootoutDurationSeconds(spec);
  delete spec.shots[0]!.clips[0]!.genSeconds;
  delete spec.shots[0]!.clips[0]!.costUsd;
  assert.deepEqual(validateShootout(FORMATS.shootout.parse(spec)), []);
  assert.equal(spec.shots[0]!.clips.length, 4);
  assert.equal(shootoutTimelineFor(spec).race, shootoutTimelineFor(spec).vote);
  assert.ok(Math.abs(full - shootoutDurationSeconds(spec) - 16 * spec.music!.beatSeconds) < 1e-9);
  assert.throws(() => shootoutTotals(spec), /complete generation metrics/);
  assert.equal(shootoutTimelineFor({ ...SHOOTOUT_EXAMPLE, beats: { race: 0 } }).race, shootoutTimelineFor({ ...SHOOTOUT_EXAMPLE, beats: { race: 0 } }).vote);
});

test('invalid nested arguments fail before opening any (nonexistent) media', async () => {
  for (const [patch, error] of [
    [{ endcard: { tagline: 'one string' } }, /endcard.tagline: expected an array/],
    [{ vote: { shot: 4 } }, /vote.shot/],
    [{ beats: { solo: -1 } }, /beats.solo/],
    [{ models: [null] }, /models\[0\]/],
    [{ shots: [{ title: 'JUMP', clips: [{ video: '/missing.mp4', fromSeconds: NaN }] }] }, /fromSeconds/],
  ] as const) {
    await assert.rejects(renderFormat({ format: 'shootout', spec: { ...SHOOTOUT_EXAMPLE, ...patch }, output: '/unused.mp4' }), error);
  }
  await assert.rejects(renderFormat({ format: 'shootout', spec: '/spec.json', output: '/unused.mp4' }), /JSON object/);
});

test('vote duration is checked only against clips in the chosen round', () => {
  const spec = structuredClone(SHOOTOUT_EXAMPLE);
  spec.shots.push(structuredClone(spec.shots[0]!));
  spec.shots[0]!.clips.forEach((clip) => { clip.fromSeconds = 0; });
  // First-round clips need only the solo/grid, not the final vote replay.
  assert.deepEqual(validateShootout(spec, [2.3, 2.3, 2.3, 2.3, 8, 8, 8, 8], 120), []);
});
