import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.resolve(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })

const db = new Database(path.join(dataDir, 'app.sqlite'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS contours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

const toContour = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const statements = {
  allContours: db.prepare(`
    SELECT id, name, description, created_at, updated_at
    FROM contours
    ORDER BY created_at DESC, id DESC
  `),
  getContour: db.prepare(`
    SELECT id, name, description, created_at, updated_at
    FROM contours
    WHERE id = ?
  `),
  createContour: db.prepare(`
    INSERT INTO contours (name, description)
    VALUES (?, ?)
  `),
  deleteContour: db.prepare('DELETE FROM contours WHERE id = ?'),
}

export function listContours() {
  return statements.allContours.all().map(toContour)
}

export function listContoursByIds(ids) {
  const contourIds = [...new Set(ids)]
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)

  if (contourIds.length === 0) {
    return []
  }

  const placeholders = contourIds.map(() => '?').join(', ')
  const rows = db
    .prepare(`
      SELECT id, name, description, created_at, updated_at
      FROM contours
      WHERE id IN (${placeholders})
      ORDER BY created_at DESC, id DESC
    `)
    .all(...contourIds)

  return rows.map(toContour)
}

export function createContour({ name, description }) {
  const result = statements.createContour.run(name, description)
  return toContour(statements.getContour.get(result.lastInsertRowid))
}

export function deleteContour(id) {
  return statements.deleteContour.run(id).changes > 0
}
