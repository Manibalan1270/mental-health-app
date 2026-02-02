const { Configuration, OpenAIApi } = require("openai");
require('dotenv').config();

// Initialize OpenAI client
// IMPORTANT: Your key starts with "gsk_", which is for GROQ (groq.com).
// I've switched the endpoint to Groq to ensure it works with your key.
const configuration = new Configuration({
    apiKey: process.env.GROK_API_KEY,
    basePath: "https://api.groq.com/openai/v1",
});
const openai = new OpenAIApi(configuration);

/**
 * Get a response from Robin AI for a specific room chat
 * @param {string} message - The user's message
 * @param {string} roomTitle - Title of the room (for context)
 * @param {Array} chatHistory - Previous chat messages
 * @returns {Promise<Object>} { reply: string, isCrisis: boolean }
 */
const SENSITIVE_KEYWORDS = [
    'suicide', 'kill myself', 'end my life', 'want to die', 'die', 'kill', 'self harm',
    'cutting myself', 'jump off', 'hang myself', 'overdose'
];

async function getRobinResponse(message, roomTitle, chatHistory = []) {
    try {
        const lowerMessage = message.toLowerCase();
        const hasSensitiveKeyword = SENSITIVE_KEYWORDS.some(keyword => lowerMessage.includes(keyword));

        const systemPrompt = `You are Robin, a friendly, compassionate, and supportive AI companion for a platform called Rkive.
You are currently chatting in a private room titled "${roomTitle}".
Your goal is to be a warm presence—like a thoughtful friend. 
For casual greetings or small talk, be natural, cheerful, and brief. Don't immediately jump into clinical support or ask about 'difficult emotions' unless the user shares something heavy first.
If the user does share deeper thoughts, then provide CBT-inspired support and listen actively.
Keep your responses concise and human-like.

SAFETY INSTRUCTION: You must detect if the user is in an IMMEDIATE life-threatening crisis.
At the end of your response, you MUST include: [CRISIS: true] if the user is in immediate danger, or [CRISIS: false] otherwise.`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...chatHistory.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
            { role: "user", content: message }
        ];

        const response = await openai.createChatCompletion({
            model: "llama-3.3-70b-versatile",
            messages: messages,
            temperature: 0.7,
            max_tokens: 500,
        });

        let reply = response.data.choices[0].message.content;

        // Extract crisis flag
        let isCrisis = reply.includes('[CRISIS: true]') || hasSensitiveKeyword;
        reply = reply.replace(/\[CRISIS: (true|false)\]/g, '').trim();

        return {
            reply,
            isCrisis
        };
    } catch (error) {
        console.error("Error getting Robin response:", error);
        return {
            reply: "I'm sorry, I'm having a bit of trouble connecting right now. Please try again in a moment.",
            isCrisis: false
        };
    }
}

/**
 * Moderation and guidance for Konekt social chat
 * @param {string} content - The message content
 * @param {Array} history - Previous messages
 * @returns {Promise<Object>} { isFlagged: boolean, warning: string }
 */
async function getKonektRobinResponse(content, history = []) {
    try {
        const systemPrompt = `You are Robin, a moderator for a mental wellness social platform.
Analyze the following message for harmful content, bullying, or extreme negativity that violates a safe space.
If the message is harmful, set isFlagged to true and provide a gentle warning.
Return your response as a JSON object: { "isFlagged": boolean, "warning": "string" }`;

        const response = await openai.createChatCompletion({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: content }
            ],
            temperature: 0,
        });

        try {
            const result = JSON.parse(response.data.choices[0].message.content);
            return {
                isFlagged: !!result.isFlagged,
                warning: result.warning || ""
            };
        } catch (e) {
            // Fallback if AI doesn't return clean JSON
            return { isFlagged: false, warning: "" };
        }
    } catch (error) {
        console.error("Error in Konekt moderation:", error);
        return { isFlagged: false, warning: "" };
    }
}

module.exports = {
    getRobinResponse,
    getKonektRobinResponse
};