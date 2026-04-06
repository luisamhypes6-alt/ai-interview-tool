const { getDB } = require('../utils/firebase');

const COL = 'knowledge_base';
const now = () => new Date().toISOString();
const docToObj = (doc) => ({ id: doc.id, ...doc.data() });

const KnowledgeBase = {
  // Find all items belonging to a specific user
  async findByUser(ownerId) {
    const db = getDB();
    const snap = await db.collection(COL)
      .where('ownerId', '==', ownerId)
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map(docToObj);
  },

  async create(data) {
    const db = getDB();
    const ts = now();
    const payload = {
      name:      data.name      || '',
      type:      data.type      || 'custom_instructions',
      content:   data.content   || '',
      url:       data.url       || '',
      fileName:  data.fileName  || '',
      category:  data.category  || 'company_docs',
      ownerId:   data.ownerId   || '',   // user who created this
      createdAt: ts,
      updatedAt: ts,
    };
    const ref = await db.collection(COL).add(payload);
    return { id: ref.id, ...payload };
  },

  async delete(id, ownerId) {
    const db = getDB();
    const doc = await db.collection(COL).doc(id).get();
    if (!doc.exists) throw new Error('Not found');
    // Only owner or admin can delete
    if (ownerId && doc.data().ownerId !== ownerId) throw new Error('Access denied');
    await db.collection(COL).doc(id).delete();
  },
};

module.exports = KnowledgeBase;
