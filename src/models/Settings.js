/**
 * Firestore helpers for the "settings" collection.
 * Each document has id == key, and a single "value" field.
 * Replaces the Mongoose Settings model.
 */
const { getDB } = require('../utils/firebase');

const COL = 'settings';

const Settings = {
  async get(key) {
    const db = getDB();
    const doc = await db.collection(COL).doc(key).get();
    return doc.exists ? doc.data().value : null;
  },

  async set(key, value) {
    const db = getDB();
    await db.collection(COL).doc(key).set({ value, updatedAt: new Date().toISOString() });
  },

  async getAll() {
    const db = getDB();
    const snap = await db.collection(COL).get();
    const result = {};
    snap.docs.forEach(d => { result[d.id] = d.data().value; });
    return result;
  }
};

module.exports = Settings;
