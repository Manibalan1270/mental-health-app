/**
 * Crisis detection and India helpline resources.
 *
 * Two layers, and EITHER one is enough to treat a message as a crisis:
 *   1. This local check (works even when the AI provider is down).
 *   2. The AI model's own [CRISIS: true] flag (see robin-ai.js).
 *
 * Matching uses whole words / phrases, so "diet", "studied" or "skill"
 * no longer trigger it. Simple obfuscation ("k1ll", "su1c1de") is normalised.
 */

// Verified Nov 2026. Re-check these numbers before any public launch.
const INDIA_HELPLINES = [
  {
    name: 'Tele-MANAS (Govt. of India)',
    number: '14416 or 1-800-891-4416',
    hours: '24x7, free, many Indian languages',
  },
  {
    name: 'iCALL (TISS)',
    number: '9152987821',
    hours: 'Mon-Sat, 10 AM - 8 PM',
  },
  {
    name: 'Emergency services',
    number: '112',
    hours: '24x7 - if you are in immediate danger',
  },
];

// Phrases that indicate possible immediate risk. Matched on word boundaries.
const CRISIS_PATTERNS = [
  /\bsuicid(e|al)\b/,
  /\bkill(ing)? my ?self\b/,
  /\b(end|ending|take|taking) (my|my own) life\b/,
  /\b(want|wanna|going|gonna|ready|plan(ning)?) to (die|end it( all)?)\b/,
  /\bi (want|wanna) (to )?die\b/,
  /\bend it all\b/,
  /\bi('?m| am) (going|gonna) to end it\b/,
  /\bwanna end it\b/,
  /\bbetter off dead\b/,
  /\b(everyone|everybody|they|people)( would| will)? (be )?better off without me\b/,
  /\bno(body|one) would (even )?(miss|notice|care) (me|if i)\b/,
  /\bdon'?t want to (live|be alive|exist)( anymore)?\b/,
  /\b(hurt|hurting|harm|harming|cut|cutting) my ?self\b/,
  /\bself[- ]?harm\b/,
  /\boverdose\b/,
  /\bhang(ing)? my ?self\b/,
  /\bjump(ing)? off (a|the|this|my) (bridge|building|roof|terrace|cliff|balcony)\b/,
  /\bgoodbye forever\b/,
  /\bcan'?t go on\b/,
];

function normalise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/1/g, 'i')
    .replace(/0/g, 'o')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/\$/g, 's')
    .replace(/\s+/g, ' ');
}

/** Returns true if the message contains a crisis phrase. */
function detectCrisis(text) {
  const t = normalise(text);
  return CRISIS_PATTERNS.some((p) => p.test(t));
}

function helplineText() {
  return INDIA_HELPLINES.map((h) => `• ${h.name}: ${h.number} (${h.hours})`).join('\n');
}

const CRISIS_REPLY =
  "I'm really glad you told me. It sounds like you're going through something very painful, " +
  "and your safety matters most right now. You don't have to handle this alone - please reach out " +
  'to someone who can talk with you right now:\n\n' +
  helplineText() +
  "\n\nIf you can, also tell someone you trust nearby how you're feeling. I'm still here to talk.";

module.exports = { INDIA_HELPLINES, detectCrisis, helplineText, CRISIS_REPLY };
