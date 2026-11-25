const OpenAI = require('openai');
const { detectCrisis, CRISIS_REPLY, helplineText } = require('./crisis');
require('dotenv').config();

// Groq exposes an OpenAI-compatible API, so the official `openai` SDK works
// with Groq's base URL. GROK_API_KEY is still accepted for older .env files.
const apiKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const client = apiKey
  ? new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' })
  : null;

if (!client) {
  console.warn('[robin] GROQ_API_KEY is not set - Robin will reply with a fallback message.');
}

/**
 * Robin's reply for a private room chat.
 * Returns { reply, isCrisis }.
 *
 * isCrisis is true if EITHER the local check OR the model flags it, and it
 * stays true even if the AI call fails (it never "fails open").
 */
async function getRobinResponse(message, roomTitle, chatHistory = []) {
  const localCrisis = detectCrisis(message);

  const systemPrompt = `You are Robin, a friendly, compassionate and supportive AI companion on a wellness app called Rkive.
You are chatting in a private room titled "${String(roomTitle).slice(0, 100)}".
Be a warm presence, like a thoughtful friend. For small talk be natural and brief.
If the user shares something heavy, listen actively and offer gentle, CBT-inspired support.
You are not a therapist; encourage professional help when it would genuinely help.
If the user may be at risk of harming themselves, respond with care, encourage them to contact
these helplines in India, and to reach out to someone they trust:
${helplineText()}
At the very end of every reply add exactly [CRISIS: true] if the user may be at risk of harming
themselves, otherwise [CRISIS: false].`;

  if (!client) {
    return {
      reply: localCrisis
        ? CRISIS_REPLY
        : "I'm having trouble connecting right now. Please try again in a moment.",
      isCrisis: localCrisis,
    };
  }

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.map((h) => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: String(h.content),
      })),
      { role: 'user', content: message },
    ];

    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    let reply = response.choices[0]?.message?.content || '';
    const modelCrisis = /\[CRISIS:\s*true\]/i.test(reply);
    reply = reply.replace(/\[CRISIS:\s*(true|false)\]/gi, '').trim();

    const isCrisis = localCrisis || modelCrisis;
    // Make sure helplines are always visible in a crisis, even if the model forgot them.
    if (isCrisis && !reply.includes('14416')) {
      reply = `${reply}\n\n${CRISIS_REPLY}`.trim();
    }
    return { reply: reply || CRISIS_REPLY, isCrisis };
  } catch (error) {
    console.error('[robin] AI request failed:', error.message);
    return {
      reply: localCrisis
        ? CRISIS_REPLY
        : "I'm sorry, I'm having a bit of trouble connecting right now. Please try again in a moment.",
      isCrisis: localCrisis,
    };
  }
}

// Words that are always flagged in Konekt, used when the AI moderator is unavailable.
const ABUSE_PATTERNS = [
  /\b(kill|hurt) (yo)?u\b/,
  /\bgo die\b/,
  /\bkys\b/,
  /\b(loser|idiot|stupid|worthless|pathetic|ugly)\b/,
];

function localModeration(content) {
  const t = String(content).toLowerCase();
  if (detectCrisis(t)) {
    return {
      isFlagged: true,
      warning: 'It sounds like someone may be struggling. Support is available:\n' + helplineText(),
    };
  }
  if (ABUSE_PATTERNS.some((p) => p.test(t))) {
    return { isFlagged: true, warning: 'Please keep Konekt a kind and safe space for everyone.' };
  }
  return { isFlagged: false, warning: '' };
}

/** Pull the first {...} JSON object out of a model reply (handles ```json fences). */
function extractJson(text) {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * Moderation for Konekt social chat. Returns { isFlagged, warning }.
 * If the AI is unavailable or returns something unreadable, the local
 * check is used instead of silently allowing everything.
 */
async function getKonektRobinResponse(content) {
  const local = localModeration(content);
  if (!client) return local;

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are Robin, a moderator for a mental wellness social platform.
Check the user's message for harassment, bullying, hate, threats, or content that is unsafe for a support space.
Reply ONLY with JSON: {"isFlagged": boolean, "warning": "short gentle warning, or empty string"}`,
        },
        { role: 'user', content: String(content) },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const result = extractJson(response.choices[0]?.message?.content);
    if (!result) return local;

    const isFlagged = Boolean(result.isFlagged) || local.isFlagged;
    return { isFlagged, warning: (isFlagged && (result.warning || local.warning)) || '' };
  } catch (error) {
    console.error('[robin] moderation request failed:', error.message);
    return local;
  }
}

module.exports = { getRobinResponse, getKonektRobinResponse, localModeration, extractJson };
