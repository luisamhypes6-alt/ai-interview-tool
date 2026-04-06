const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const { signToken, requireAuth, requireAdmin } = require('../utils/auth');
const { isConnected } = require('../utils/firebase');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    if (!isConnected()) {
      return res.status(503).json({ error: 'Database not connected. Check your Firebase environment variable.' });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Lazy admin creation — ensures admin exists even on first cold start
    await User.ensureAdminExists().catch(() => {});

    const user = await User.findByUsername(username);
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const valid = await User.verifyPassword(user, password);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

    const { passwordHash, ...safe } = user;
    const token = signToken({
      id:          user.id,
      username:    user.username,
      displayName: user.displayName,
      isAdmin:     user.isAdmin,
    });
    res.json({ token, user: safe });
  } catch (err) {
    console.error('[Auth/login]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    if (!isConnected()) return res.status(503).json({ error: 'Database not connected' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { passwordHash, ...safe } = user;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    if (!isConnected()) return res.status(503).json({ error: 'Database not connected' });
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const valid = await User.verifyPassword(user, currentPassword);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    await User.updatePassword(req.user.id, newPassword);
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/users (admin only)
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!isConnected()) return res.status(503).json({ error: 'Database not connected' });
    res.json(await User.findAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/users (admin only)
router.post('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!isConnected()) return res.status(503).json({ error: 'Database not connected' });
    const { username, displayName, isAdmin } = req.body;
    res.status(201).json(await User.create({ username, displayName, isAdmin }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/auth/users/:id (admin only)
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!isConnected()) return res.status(503).json({ error: 'Database not connected' });
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await User.delete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/users/:id/reset-password (admin only)
router.post('/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!isConnected()) return res.status(503).json({ error: 'Database not connected' });
    await User.updatePassword(req.params.id, req.body.newPassword || '12345678');
    res.json({ message: 'Password reset' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
