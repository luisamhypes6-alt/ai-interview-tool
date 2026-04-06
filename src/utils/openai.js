const OpenAI = require('openai');
const { isConnected } = require('./firebase');

// Cache clients per API key
const clientCache = new Map();

// Get OpenAI client for a specific user
// Priority: user's own key → global env key → global DB key
const getOpenAIClient = async (userId) => {
  let apiKey = null;

  // 1. User's own key from Firestore
  if (userId && isConnected()) {
    try {
      const Settings = require('../models/Settings');
      apiKey = await Settings.getForUser(userId, 'openai_key');
    } catch (_) {}
  }

  // 2. Global env var fallback
  if (!apiKey) apiKey = process.env.OPENAI_API_KEY;

  // 3. Global DB key fallback
  if (!apiKey && isConnected()) {
    try {
      const Settings = require('../models/Settings');
      apiKey = await Settings.get('openai_api_key');
    } catch (_) {}
  }

  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Please add your API key in Settings → Account.');
  }

  // Cache by key to avoid re-creating clients unnecessarily
  if (!clientCache.has(apiKey)) {
    clientCache.set(apiKey, new OpenAI({ apiKey }));
  }
  return clientCache.get(apiKey);
};

// Get knowledge base context for a specific user (their own KB only)
const getKnowledgeContext = async (userId) => {
  if (!isConnected() || !userId) return '';
  try {
    const KnowledgeBase = require('../models/KnowledgeBase');
    const docs = await KnowledgeBase.findByUser(userId);
    const limited = docs.slice(0, 10);
    if (!limited.length) return '';
    return '\n\n--- KNOWLEDGE BASE & CONTEXT ---\n' +
      limited.map(d => `[${d.name}]: ${d.content?.substring(0, 1000) || ''}`).join('\n\n');
  } catch (e) {
    console.error('[OpenAI] Knowledge context error:', e.message);
    return '';
  }
};

// Get custom instructions for a specific user
const getCustomInstructions = async (userId) => {
  if (!isConnected() || !userId) return '';
  try {
    const Settings = require('../models/Settings');
    const value = await Settings.getForUser(userId, 'custom_instructions');
    return value ? `\n\n--- CUSTOM INSTRUCTIONS ---\n${value}` : '';
  } catch (_) { return ''; }
};

// Get company scenario for a specific user
const getCompanyScenario = async (userId) => {
  if (!isConnected() || !userId) return '';
  try {
    const Settings = require('../models/Settings');
    const value = await Settings.getForUser(userId, 'company_scenario');
    return value ? `\n\n--- COMPANY INTERVIEW SCENARIO (follow this structure) ---\n${value}` : '';
  } catch (_) { return ''; }
};

module.exports = { getOpenAIClient, getKnowledgeContext, getCustomInstructions, getCompanyScenario };
