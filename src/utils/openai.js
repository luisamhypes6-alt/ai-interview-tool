const OpenAI = require('openai');
const { isConnected } = require('./firebase');

let openaiClient = null;
let currentApiKey = null;

const getOpenAIClient = async () => {
  let apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    try {
      const settingsRoute = require('../routes/settings');
      apiKey = settingsRoute.memStore?.openai_api_key;
    } catch (_) {}
  }

  if (!apiKey && isConnected()) {
    try {
      const Settings = require('../models/Settings');
      apiKey = await Settings.get('openai_api_key');
    } catch (e) {
      console.error('[OpenAI] Failed to read key from Firestore:', e.message);
    }
  }

  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Please add it in Settings.');
  }

  if (!openaiClient || currentApiKey !== apiKey) {
    openaiClient = new OpenAI({ apiKey });
    currentApiKey = apiKey;
  }

  return openaiClient;
};

const getKnowledgeContext = async () => {
  if (!isConnected()) return '';
  try {
    const KnowledgeBase = require('../models/KnowledgeBase');
    const docs = await KnowledgeBase.findAll();
    const limited = docs.slice(0, 10);
    if (!limited.length) return '';
    return '\n\n--- COMPANY & RECRUITER CONTEXT ---\n' +
      limited.map(d => `[${d.name}]: ${d.content?.substring(0, 1000) || ''}`).join('\n\n');
  } catch (e) {
    console.error('[OpenAI] Failed to load knowledge context:', e.message);
    return '';
  }
};

const getCustomInstructions = async () => {
  try {
    const settingsRoute = require('../routes/settings');
    const mem = settingsRoute.memStore?.custom_instructions;
    if (mem) return `\n\n--- CUSTOM INSTRUCTIONS ---\n${mem}`;
  } catch (_) {}

  if (!isConnected()) return '';
  try {
    const Settings = require('../models/Settings');
    const value = await Settings.get('custom_instructions');
    return value ? `\n\n--- CUSTOM INSTRUCTIONS ---\n${value}` : '';
  } catch (e) {
    console.error('[OpenAI] Failed to load custom instructions:', e.message);
    return '';
  }
};

const getCompanyScenario = async () => {
  if (!isConnected()) return '';
  try {
    const Settings = require('../models/Settings');
    const value = await Settings.get('company_scenario');
    return value ? `\n\n--- COMPANY INTERVIEW SCENARIO (follow this structure) ---\n${value}` : '';
  } catch (e) { return ''; }
};

module.exports = { getOpenAIClient, getKnowledgeContext, getCustomInstructions, getCompanyScenario };
