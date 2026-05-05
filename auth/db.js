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
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
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

  CREATE INDEX IF NOT EXISTS sessions_user_id_index ON sessions (user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires_at_index ON sessions (expires_at);
`)

const toUser = (row) => ({
  id: row.id,
  email: row.email,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toAuthUser = (row) => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  passwordSalt: row.password_salt,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const statements = {
  createUser: db.prepare(`
    INSERT INTO users (email, password_hash, password_salt)
    VALUES (?, ?, ?)
  `),
  getUserById: db.prepare(`
    SELECT id, email, password_hash, password_salt, created_at, updated_at
    FROM users
    WHERE id = ?
  `),
  getUserByEmail: db.prepare(`
    SELECT id, email, password_hash, password_salt, created_at, updated_at
    FROM users
    WHERE email = ?
  `),
  createSession: db.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `),
  getSessionUser: db.prepare(`
    SELECT
      users.id,
      users.email,
      users.password_hash,
      users.password_salt,
      users.created_at,
      users.updated_at
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

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export function createUser({ email, passwordHash, passwordSalt }) {
  const result = statements.createUser.run(email, passwordHash, passwordSalt)
  return toAuthUser(statements.getUserById.get(result.lastInsertRowid))
}

export function findUserByEmail(email) {
  const user = statements.getUserByEmail.get(email)
  return user ? toAuthUser(user) : null
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
