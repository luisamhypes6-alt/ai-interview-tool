const express   = require('express');
const router    = express.Router();
const Candidate = require('../models/Candidate');
const { requireAuth } = require('../utils/auth');

router.use(requireAuth);

const getOwned = async (req, id) => {
  const c = await Candidate.findById(id);
  if (!c) return [null, 'Candidate not found', 404];
  if (!Candidate.canAccess(c, req.user)) return [null, 'Access denied', 403];
  return [c, null, 200];
};

router.get('/:candidateId', async (req, res) => {
  try {
    const [c, err, code] = await getOwned(req, req.params.candidateId);
    if (err) return res.status(code).json({ error: err });
    const { fullName, email, role, outreachMessages, interviewScenarios, conversationHistory } = c;
    res.json({ id: c.id, fullName, email, role, outreachMessages, interviewScenarios, conversationHistory });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:candidateId/conversation', async (req, res) => {
  try {
    const [, err, code] = await getOwned(req, req.params.candidateId);
    if (err) return res.status(code).json({ error: err });
    await Candidate.clearConversation(req.params.candidateId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:candidateId/conversation/:index', async (req, res) => {
  try {
    const [, err, code] = await getOwned(req, req.params.candidateId);
    if (err) return res.status(code).json({ error: err });
    await Candidate.deleteConversationMessage(req.params.candidateId, parseInt(req.params.index));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:candidateId/outreach/:index', async (req, res) => {
  try {
    const [, err, code] = await getOwned(req, req.params.candidateId);
    if (err) return res.status(code).json({ error: err });
    await Candidate.deleteOutreachMessage(req.params.candidateId, parseInt(req.params.index));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:candidateId/scenario/:index', async (req, res) => {
  try {
    const [, err, code] = await getOwned(req, req.params.candidateId);
    if (err) return res.status(code).json({ error: err });
    await Candidate.deleteScenario(req.params.candidateId, parseInt(req.params.index));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
