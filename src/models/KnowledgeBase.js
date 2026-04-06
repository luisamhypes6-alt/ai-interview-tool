/**
 * Firestore helpers for the "knowledge_base" collection.
 * Replaces the Mongoose KnowledgeBase model.
 */
const { getDB } = require('../utils/firebase');

const COL = 'knowledge_base';
const now = () => new Date().toISOString();
const docToObj = (doc) => ({ id: doc.id, ...doc.data() });

const KnowledgeBase = {
  async findAll() {
    const db = getDB();
    const snap = await db.collection(COL).orderBy('createdAt', 'desc').get();
    return snap.docs.map(docToObj);
  },

  async create(data) {
    const db = getDB();
    const ts = now();
    const payload = {
      name: data.name || '',
      type: data.type || 'custom_instructions',
      content: data.content || '',
      url: data.url || '',
      fileName: data.fileName || '',
      category: data.category || 'company_docs',
      createdAt: ts,
      updatedAt: ts
    };
    const ref = await db.collection(COL).add(payload);
    return { id: ref.id, ...payload };
  },

  async delete(id) {
    const db = getDB();
    await db.collection(COL).doc(id).delete();
  }
};

module.exports = KnowledgeBase;
