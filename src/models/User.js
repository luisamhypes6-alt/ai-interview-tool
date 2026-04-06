const bcrypt = require('bcryptjs');
const { getDB } = require('../utils/firebase');

const COL = 'users';
const now = () => new Date().toISOString();
const docToObj = (doc) => ({ id: doc.id, ...doc.data() });
const DEFAULT_PASSWORD = '12345678';

const User = {
  async findAll() {
    const db = getDB();
    const snap = await db.collection(COL).get();
    return snap.docs.map(d => {
      const { passwordHash, ...rest } = d.data();
      return { id: d.id, ...rest };
    });
  },

  async findById(id) {
    const db = getDB();
    const doc = await db.collection(COL).doc(id).get();
    if (!doc.exists) return null;
    return docToObj(doc);
  },

  async findByUsername(username) {
    const db = getDB();
    const snap = await db.collection(COL)
      .where('username', '==', username.toLowerCase().trim())
      .get();
    if (snap.empty) return null;
    return docToObj(snap.docs[0]);
  },

  async create({ username, displayName, isAdmin = false, password }) {
    const db = getDB();
    const existing = await User.findByUsername(username);
    if (existing) throw new Error('Username already exists');
    const passwordHash = await bcrypt.hash(password || DEFAULT_PASSWORD, 10);
    const ts = now();
    const payload = {
      username:     username.toLowerCase().trim(),
      displayName:  displayName || username,
      isAdmin:      !!isAdmin,
      passwordHash,
      createdAt:    ts,
      updatedAt:    ts,
    };
    const ref = await db.collection(COL).add(payload);
    const { passwordHash: _, ...safe } = payload;
    return { id: ref.id, ...safe };
  },

  async updatePassword(id, newPassword) {
    const db = getDB();
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.collection(COL).doc(id).update({ passwordHash, updatedAt: now() });
  },

  async update(id, data) {
    const db = getDB();
    const updates = { ...data, updatedAt: now() };
    delete updates.passwordHash;
    await db.collection(COL).doc(id).update(updates);
    const doc = await db.collection(COL).doc(id).get();
    const { passwordHash, ...rest } = doc.data();
    return { id: doc.id, ...rest };
  },

  async delete(id) {
    const db = getDB();
    await db.collection(COL).doc(id).delete();
  },

  async verifyPassword(user, password) {
    return bcrypt.compare(password, user.passwordHash);
  },

  async ensureAdminExists() {
    const { isConnected } = require('../utils/firebase');
    if (!isConnected()) return; // skip if DB not ready
    const db = getDB();
    const snap = await db.collection(COL).where('isAdmin', '==', true).get();
    if (!snap.empty) return;
    await User.create({
      username:    'admin',
      displayName: 'Admin',
      isAdmin:     true,
      password:    DEFAULT_PASSWORD,
    });
    console.log('[Auth] Default admin created — username: admin, password: 12345678');
  },
};

module.exports = User;
