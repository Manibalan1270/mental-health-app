const test = require('node:test');
const assert = require('node:assert');
const { detectCrisis, CRISIS_REPLY } = require('../crisis');
const { localModeration, extractJson } = require('../robin-ai');

test('detects clear crisis messages', () => {
  for (const msg of [
    'I want to kill myself',
    'i am going to end it all tonight',
    'I wanna end it',
    'nobody would miss me if I was gone',
    'everyone would be better off without me',
    'I want to k1ll myself',
    "I don't want to live anymore",
    'thinking about suicide',
  ]) {
    assert.ok(detectCrisis(msg), `should detect: ${msg}`);
  }
});

test('does not flag everyday words that contain "die" or "kill"', () => {
  for (const msg of [
    'I studied for my diet exam',
    'learning a new skill today',
    'this game is killing it',
    'the battery died',
    'I jumped off the bus at my stop',
  ]) {
    assert.ok(!detectCrisis(msg), `should NOT detect: ${msg}`);
  }
});

test('crisis reply lists India helplines', () => {
  assert.match(CRISIS_REPLY, /14416/);
  assert.match(CRISIS_REPLY, /112/);
  assert.doesNotMatch(CRISIS_REPLY, /988/);
});

test('local moderation flags abuse and crisis, allows normal chat', () => {
  assert.ok(localModeration('you are such a loser').isFlagged);
  assert.ok(localModeration('i want to end my life').isFlagged);
  assert.ok(!localModeration('hey, how was your day?').isFlagged);
});

test('extractJson handles fenced JSON from the model', () => {
  assert.deepStrictEqual(extractJson('```json\n{"isFlagged": true, "warning": "x"}\n```'), {
    isFlagged: true,
    warning: 'x',
  });
  assert.strictEqual(extractJson('not json'), null);
});
