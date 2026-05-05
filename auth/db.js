import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.resolve(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })

const db = new Database(path.join(dataDir, 'auth.sqlite'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    available_contours TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`)

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()

  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
  }
}

ensureColumn('users', 'username', 'TEXT')
ensureColumn('users', 'role', "TEXT NOT NULL DEFAULT 'user'")
ensureColumn('users', 'status', "TEXT NOT NULL DEFAULT 'active'")
ensureColumn('users', 'available_contours', "TEXT NOT NULL DEFAULT '[]'")

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique
    ON users (username)
    WHERE username IS NOT NULL;

  CREATE INDEX IF NOT EXISTS sessions_user_id_index ON sessions (user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires_at_index ON sessions (expires_at);
`)

function parseAvailableContours(value) {
  try {
    const parsed = JSON.parse(value)

    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function serializeAvailableContours(value) {
  return JSON.stringify(Array.isArray(value) ? value : [])
}

const toUser = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  role: row.role,
  status: row.status,
  availableContours: parseAvailableContours(row.available_contours),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toAuthUser = (row) => ({
  ...toUser(row),
  passwordHash: row.password_hash,
  passwordSalt: row.password_salt,
})

const userFields = `
  users.id AS id,
  users.username AS username,
  users.email AS email,
  users.password_hash AS password_hash,
  users.password_salt AS password_salt,
  users.role AS role,
  users.status AS status,
  users.available_contours AS available_contours,
  users.created_at AS created_at,
  users.updated_at AS updated_at
`

const statements = {
  createUser: db.prepare(`
    INSERT INTO users (username, email, password_hash, password_salt, role, status, available_contours)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getUserById: db.prepare(`
    SELECT ${userFields}
    FROM users
    WHERE id = ?
  `),
  getUserByEmail: db.prepare(`
    SELECT ${userFields}
    FROM users
    WHERE email = ?
  `),
  getUserByUsername: db.prepare(`
    SELECT ${userFields}
    FROM users
    WHERE username = ?
  `),
  getUserByLogin: db.prepare(`
    SELECT ${userFields}
    FROM users
    WHERE email = ? OR username = ?
  `),
  updateSeedUser: db.prepare(`
    UPDATE users
    SET
      username = ?,
      email = ?,
      password_hash = ?,
      password_salt = ?,
      role = ?,
      status = ?,
      available_contours = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  updateUserAccess: db.prepare(`
    UPDATE users
    SET available_contours = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  createSession: db.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `),
  getSessionUser: db.prepare(`
    SELECT ${userFields}
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND datetime(sessions.expires_at) > datetime('now')
  `),
  touchSession: db.prepare(`
    UPDATE sessions
    SET last_seen_at = CURRENT_TIMESTAMP
    WHERE token_hash = ?
  `),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  deleteExpiredSessions: db.prepare(`
    DELETE FROM sessions
    WHERE datetime(expires_at) <= datetime('now')
  `),
}

export function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

export function normalizeUsername(username) {
  return username.trim().toLowerCase()
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    availableContours: user.availableContours,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export function createUser({
  username = null,
  email,
  passwordHash,
  passwordSalt,
  role = 'user',
  status = 'active',
  availableContours = [],
}) {
  const result = statements.createUser.run(
    username,
    email,
    passwordHash,
    passwordSalt,
    role,
    status,
    serializeAvailableContours(availableContours),
  )

  return toAuthUser(statements.getUserById.get(result.lastInsertRowid))
}

export function findUserByEmail(email) {
  const user = statements.getUserByEmail.get(email)
  return user ? toAuthUser(user) : null
}

export function findUserByUsername(username) {
  const user = statements.getUserByUsername.get(username)
  return user ? toAuthUser(user) : null
}

export function findUserByLogin(login) {
  const normalizedLogin = login.trim().toLowerCase()
  const user = statements.getUserByLogin.get(normalizedLogin, normalizedLogin)
  return user ? toAuthUser(user) : null
}

export function ensureSeedUser({
  username,
  email,
  passwordHash,
  passwordSalt,
  role,
  status = 'active',
  availableContours,
}) {
  const normalizedUsername = normalizeUsername(username)
  const normalizedEmail = normalizeEmail(email)
  const existingUser =
    findUserByUsername(normalizedUsername) ?? findUserByEmail(normalizedEmail)

  if (!existingUser) {
    return createUser({
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash,
      passwordSalt,
      role,
      status,
      availableContours,
    })
  }

  statements.updateSeedUser.run(
    normalizedUsername,
    normalizedEmail,
    passwordHash,
    passwordSalt,
    role,
    status,
    serializeAvailableContours(availableContours),
    existingUser.id,
  )

  return toAuthUser(statements.getUserById.get(existingUser.id))
}

function addContourAccess(user, contourId) {
  const contourAccess = String(contourId)

  if (user.availableContours.includes('all') || user.availableContours.includes(contourAccess)) {
    return user
  }

  const nextAvailableContours = [...user.availableContours, contourAccess]
  statements.updateUserAccess.run(serializeAvailableContours(nextAvailableContours), user.id)

  return toAuthUser(statements.getUserById.get(user.id))
}

export function createOrInviteUser({
  username,
  email,
  passwordHash,
  passwordSalt,
  contourId,
}) {
  const normalizedUsername = normalizeUsername(username)
  const normalizedEmail = normalizeEmail(email)
  const existingUser =
    findUserByUsername(normalizedUsername) ?? findUserByEmail(normalizedEmail)

  if (existingUser) {
    return {
      user: addContourAccess(existingUser, contourId),
      created: false,
    }
  }

  return {
    user: createUser({
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash,
      passwordSalt,
      role: 'user',
      status: 'invited',
      availableContours: [String(contourId)],
    }),
    created: true,
  }
}

export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('base64url')
}

export function createSession({ userId, token, expiresAt }) {
  statements.deleteExpiredSessions.run()
  statements.createSession.run(userId, hashSessionToken(token), expiresAt)
}

export function findUserBySessionToken(token) {
  if (!token) {
    return null
  }

  const tokenHash = hashSessionToken(token)
  const user = statements.getSessionUser.get(tokenHash)

  if (!user) {
    return null
  }

  statements.touchSession.run(tokenHash)
  return toAuthUser(user)
}

export function deleteSessionByToken(token) {
  if (!token) {
    return
  }

  statements.deleteSession.run(hashSessionToken(token))
}
