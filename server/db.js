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

  CREATE TABLE IF NOT EXISTS contour_members (
    contour_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    access TEXT NOT NULL,
    status TEXT NOT NULL,
    invited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (contour_id, user_id),
    FOREIGN KEY (contour_id) REFERENCES contours(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS contour_members_contour_id_index
    ON contour_members (contour_id);
`)

const toContour = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toContourMember = (row) => ({
  contourId: row.contour_id,
  userId: row.user_id,
  username: row.username,
  email: row.email,
  role: row.role,
  access: row.access,
  status: row.status,
  invitedAt: row.invited_at,
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
  upsertContourMember: db.prepare(`
    INSERT INTO contour_members (
      contour_id,
      user_id,
      username,
      email,
      role,
      access,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(contour_id, user_id) DO UPDATE SET
      username = excluded.username,
      email = excluded.email,
      role = excluded.role,
      access = excluded.access,
      status = excluded.status,
      updated_at = CURRENT_TIMESTAMP
  `),
  getContourMember: db.prepare(`
    SELECT
      contour_id,
      user_id,
      username,
      email,
      role,
      access,
      status,
      invited_at,
      created_at,
      updated_at
    FROM contour_members
    WHERE contour_id = ? AND user_id = ?
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

export function getContour(id) {
  const contour = statements.getContour.get(id)
  return contour ? toContour(contour) : null
}

export function listContourMembers(contourId, filters = {}) {
  const conditions = ['contour_id = ?']
  const params = [contourId]

  if (filters.role && filters.role !== 'all') {
    conditions.push('role = ?')
    params.push(filters.role)
  }

  if (filters.access && filters.access !== 'all') {
    conditions.push('access = ?')
    params.push(filters.access)
  }

  if (filters.query) {
    conditions.push('(username LIKE ? OR email LIKE ?)')
    params.push(`%${filters.query}%`, `%${filters.query}%`)
  }

  const rows = db
    .prepare(`
      SELECT
        contour_id,
        user_id,
        username,
        email,
        role,
        access,
        status,
        invited_at,
        created_at,
        updated_at
      FROM contour_members
      WHERE ${conditions.join(' AND ')}
      ORDER BY username ASC, email ASC
    `)
    .all(...params)

  return rows.map(toContourMember)
}

export function upsertContourMember({ contourId, user, role, access, status }) {
  statements.upsertContourMember.run(
    contourId,
    user.id,
    user.username || user.email,
    user.email,
    role,
    access,
    status,
  )

  return toContourMember(statements.getContourMember.get(contourId, user.id))
}

export function createContour({ name, description }) {
  const result = statements.createContour.run(name, description)
  return toContour(statements.getContour.get(result.lastInsertRowid))
}

export function deleteContour(id) {
  return statements.deleteContour.run(id).changes > 0
}
