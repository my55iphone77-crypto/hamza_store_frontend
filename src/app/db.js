const Database = require('better-sqlite3');
const path = require('path');

// فتح قاعدة البيانات مع تفعيل وضع القراءة الآمن وتجنب التلاعب بالمسارات
const dbPath = path.resolve(__dirname, 'data.sqlite');
const db = new Database(dbPath);

// إعدادات الأمان والأداء الأساسية
db.pragma('journal_mode = WAL');
db.pragma('synchronous = FULL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON'); // تفعيل القيود المرجعية لضمان سلامة البيانات

// تنفيذ هيكل قاعدة البيانات مع الحفاظ على كافة الجداول والفهارس الأصلية
db.exec(`
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  author TEXT,
  file_name TEXT,
  file_path TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  description TEXT,
  changed_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_documents_deleted ON documents(deleted);
CREATE INDEX IF NOT EXISTS idx_history_document ON document_history(document_id);
`);

module.exports = db;