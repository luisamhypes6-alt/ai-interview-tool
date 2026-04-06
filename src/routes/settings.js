const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const axios    = require('axios');
const cheerio  = require('cheerio');
const { isConnected } = require('../utils/firebase');
const { requireAuth, requireAdmin } = require('../utils/auth');

const getSettings = () => require('../models/Settings');
const getKB       = () => require('../models/KnowledgeBase');

// Memory storage — no disk writes, works on Vercel
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const { extractTextFromBuffer } = require('../utils/fileParser');

// In-memory fallback for pre-DB config
const memStore = {};

const persistAllMemStore = async () => {
  if (!isConnected()) return;
  const S = getSettings();
  for (const [key, value] of Object.entries(memStore)) {
    if (value) await S.set(key, value).catch(() => {});
  }
};

// ── Settings key helpers: user-scoped vs global ───────────────────────────────
// Recruiters are per-user (unless admin reads all)
// Company scenario and knowledge base are global
const recruiterKey   = (userId) => `recruiters_${userId}`;
const companyScenKey = () => 'company_scenario';

// ── GET /api/settings ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  // This endpoint is public (used before auth for DB check) but also called after auth
  try {
    let hasOpenAI    = !!(process.env.OPENAI_API_KEY || memStore.openai_api_key);
    let hasFirebase  = !!(process.env.FIREBASE_SERVICE_ACCOUNT || memStore.firebase_service_account);
    let roles        = null;
    let recruiters   = [];
    let companyScenario = '';

    if (isConnected()) {
      const S   = getSettings();
      const all = await S.getAll().catch(() => ({}));
      if (all.openai_api_key)         hasOpenAI  = true;
      if (all.firebase_service_account) hasFirebase = true;
      if (all.custom_roles)           roles      = all.custom_roles;
      if (all[companyScenKey()])      companyScenario = all[companyScenKey()];

      // Get recruiters — scoped to user if auth header present
      const authHeader = req.headers.authorization || '';
      if (authHeader.startsWith('Bearer ')) {
        try {
          const { verifyToken } = require('../utils/auth');
          const payload = verifyToken(authHeader.slice(7));
          if (payload) {
            if (payload.isAdmin) {
              // Admin sees all recruiters merged
              const allKeys = Object.keys(all).filter(k => k.startsWith('recruiters_'));
              const merged = [];
              const seen = new Set();
              allKeys.forEach(k => {
                (all[k] || []).forEach(r => {
                  if (!seen.has(r.id)) { seen.add(r.id); merged.push({ ...r, _ownerKey: k }); }
                });
              });
              recruiters = merged;
            } else {
              recruiters = all[recruiterKey(payload.id)] || [];
            }
          }
        } catch (_) {}
      } else {
        // Not authed — return empty recruiters
        recruiters = [];
      }
    }

    res.json({ hasOpenAI, hasFirebase, dbConnected: isConnected(), roles, recruiters, companyScenario });
  } catch (err) {
    res.json({
      hasOpenAI:   !!(process.env.OPENAI_API_KEY || memStore.openai_api_key),
      hasFirebase: !!(process.env.FIREBASE_SERVICE_ACCOUNT || memStore.firebase_service_account),
      dbConnected: false, roles: null, recruiters: [], companyScenario: '',
    });
  }
});

// ── PUT /api/settings/company-scenario — save global company interview scenario ──
router.put('/company-scenario', requireAuth, async (req, res) => {
  try {
    const { scenario } = req.body;
    await getSettings().set(companyScenKey(), scenario || '');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/settings/recruiters — save user-scoped recruiters ────────────────
router.put('/recruiters', requireAuth, async (req, res) => {
  try {
    const { recruiters } = req.body;
    await getSettings().set(recruiterKey(req.user.id), recruiters || []);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/settings/knowledge/list ─────────────────────────────────────────
router.get('/knowledge/list', async (req, res) => {
  if (!isConnected()) return res.json([]);
  try {
    const items = await getKB().findAll();
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/settings/knowledge/file ────────────────────────────────────────
router.post('/knowledge/file', upload.single('file'), async (req, res) => {
  if (!isConnected()) return res.status(503).json({ error: 'Firebase not connected.' });
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { category = 'company_docs' } = req.body;
    const text = await extractTextFromBuffer(req.file.buffer, req.file.originalname);
    const item = await getKB().create({ name: req.file.originalname, type: 'file', content: text, fileName: req.file.originalname, category });
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/settings/knowledge/url ─────────────────────────────────────────
router.post('/knowledge/url', async (req, res) => {
  if (!isConnected()) return res.status(503).json({ error: 'Firebase not connected.' });
  try {
    const { url, category = 'company_docs' } = req.body;
    let text = '', siteName = '';
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InterviewAI/1.0)', 'Accept': 'text/html' },
      });
      const $ = cheerio.load(response.data);
      $('script,style,nav,footer,header,aside,iframe,noscript,[class*="cookie"],[id*="cookie"]').remove();
      siteName = $('title').text().trim() || $('h1').first().text().trim() || new URL(url).hostname;
      text = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 8000);
    } catch (fetchErr) {
      return res.status(400).json({ error: `Could not fetch URL: ${fetchErr.message}` });
    }
    const item = await getKB().create({ name: siteName || new URL(url).hostname, type: 'url', content: text, url, category });
    res.json({ ...item, charCount: text.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/settings/knowledge/instructions ─────────────────────────────────
router.post('/knowledge/instructions', async (req, res) => {
  if (!isConnected()) return res.status(503).json({ error: 'Firebase not connected.' });
  try {
    const { content, name = 'Custom Instructions' } = req.body;
    const item = await getKB().create({ name, type: 'custom_instructions', content, category: 'instructions' });
    await getSettings().set('custom_instructions', content);
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/settings/knowledge/test-instructions ───────────────────────────
router.post('/knowledge/test-instructions', async (req, res) => {
  try {
    const { instructions, prompt = 'Introduce yourself and explain how you will assist with recruiting.' } = req.body;
    const { getOpenAIClient } = require('../utils/openai');
    const openai = await getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: instructions }, { role: 'user', content: prompt }],
      max_tokens: 400, temperature: 0.7,
    });
    res.json({ reply: completion.choices[0].message.content });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/settings/knowledge/:id ───────────────────────────────────────
router.delete('/knowledge/:id', async (req, res) => {
  if (!isConnected()) return res.status(503).json({ error: 'Firebase not connected.' });
  try {
    await getKB().delete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/settings/:key — generic (Firebase / OpenAI keys, roles, etc.) ───
router.put('/:key', async (req, res) => {
  const { value } = req.body;
  const { key }   = req.params;
  memStore[key]   = value;

  if (key === 'firebase_service_account' && value) {
    try {
      const ok = req.app.locals.initFirebase(value);
      if (!ok) return res.status(400).json({ error: 'Could not initialize Firebase. Check service account JSON.' });
      await persistAllMemStore();
      return res.json({ success: true, key, dbConnected: true });
    } catch (e) {
      return res.status(400).json({ error: `Firebase initialization failed: ${e.message}` });
    }
  }

  if (isConnected()) {
    try { await getSettings().set(key, value); } catch (e) {
      console.error('[Settings] Firestore write error:', e.message);
    }
  }
  res.json({ success: true, key, dbConnected: isConnected() });
});

module.exports = router;
module.exports.memStore = memStore;
