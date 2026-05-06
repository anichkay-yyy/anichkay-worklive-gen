import express from 'express'
import crypto from 'node:crypto'
import {
  clearSessionCookie,
  getSessionToken,
  sessionCookie,
} from './cookies.js'
import {
  activateInvitedUser,
  createSession,
  createUser,
  createOrInviteUser,
  deleteSessionByToken,
  ensureSeedUser,
  findUserByEmail,
  findUserById,
  findUserByInviteTokenHash,
  findUserByLogin,
  findUserBySessionToken,
  findUserByUsername,
  hashSessionToken,
  listUsers,
  normalizeEmail,
  normalizeUsername,
  publicUser,
  setUserInvite,
} from './db.js'
import { hashPassword, verifyPassword } from './passwords.js'

const app = express()
const port = Number(process.env.AUTH_PORT ?? 3002)
const sessionTtlMs = Number(process.env.SESSION_TTL_MS ?? 1000 * 60 * 60 * 24 * 7)
const sessionMaxAgeSeconds = Math.floor(sessionTtlMs / 1000)
const inviteTtlMs = Number(process.env.INVITE_TTL_MS ?? 1000 * 60 * 60 * 24 * 14)

app.use(express.json({ limit: '32kb' }))

function seedDefaultAdmin() {
  if (process.env.NODE_ENV === 'production' && !process.env.AUTH_SEED_ADMIN_PASSWORD) {
    return
  }

  const password = process.env.AUTH_SEED_ADMIN_PASSWORD ?? 'anichkay123'
  const { hash, salt } = hashPassword(password)

  ensureSeedUser({
    username: 'anichkay',
    email: 'anichkay@local.test',
    passwordHash: hash,
    passwordSalt: salt,
    role: 'admin',
    availableContours: ['all'],
  })
}

seedDefaultAdmin()

function sessionExpiresAt() {
  return new Date(Date.now() + sessionTtlMs).toISOString()
}

function inviteExpiresAt() {
  return new Date(Date.now() + inviteTtlMs).toISOString()
}

function issueSession(response, user) {
  const token = crypto.randomBytes(32).toString('base64url')

  createSession({
    userId: user.id,
    token,
    expiresAt: sessionExpiresAt(),
  })

  response.setHeader('Set-Cookie', sessionCookie(token, sessionMaxAgeSeconds))
}

function getCredentials(request) {
  const login = String(
    request.body?.login ?? request.body?.email ?? request.body?.username ?? '',
  ).trim()
  const username = normalizeUsername(String(request.body?.username ?? ''))
  const email = normalizeEmail(String(request.body?.email ?? ''))
  const password = String(request.body?.password ?? '')

  return { login, username, email, password }
}

function validateCredentials({ email, password }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Некорректный email.'
  }

  if (password.length < 8) {
    return 'Пароль должен быть не короче 8 символов.'
  }

  return ''
}

function validateUsername(username) {
  if (!username) {
    return ''
  }

  if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
    return 'Username должен содержать 3-32 символа: a-z, 0-9, _ или -.'
  }

  return ''
}

function currentUser(request) {
  return findUserBySessionToken(getSessionToken(request))
}

function requireAdmin(request, response) {
  const user = currentUser(request)

  if (!user) {
    response.status(401).json({ message: 'Требуется авторизация.' })
    return null
  }

  if (user.role !== 'admin') {
    response.status(403).json({ message: 'Недостаточно прав.' })
    return null
  }

  return user
}

function getInvitePayload(request) {
  const username = normalizeUsername(String(request.body?.username ?? ''))
  const email = normalizeEmail(String(request.body?.email ?? ''))
  const rawContourId = request.body?.contourId
  const contourId =
    rawContourId === undefined || rawContourId === null || rawContourId === ''
      ? null
      : Number(rawContourId)

  return { username, email, contourId }
}

function validateInvitePayload({ username, email, contourId }) {
  return (
    validateUsername(username) ||
    (!username ? 'Username обязателен.' : '') ||
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Некорректный email.' : '') ||
    (contourId !== null && (!Number.isInteger(contourId) || contourId <= 0)
      ? 'Некорректный id контура.'
      : '')
  )
}

function requestOrigin(request) {
  const configuredOrigin = String(process.env.PUBLIC_APP_URL ?? '').trim()
  const requestHeaderOrigin = String(request.headers.origin ?? '').trim()
  const requestHeaderReferer = String(request.headers.referer ?? '').trim()
  const forwardedProto = String(request.headers['x-forwarded-proto'] ?? '').split(',')[0].trim()
  const forwardedHost = String(request.headers['x-forwarded-host'] ?? '').split(',')[0].trim()

  for (const candidate of [configuredOrigin, requestHeaderOrigin, requestHeaderReferer]) {
    if (!candidate || candidate === 'null') {
      continue
    }

    try {
      return new URL(candidate).origin
    } catch {
      // Try the next source.
    }
  }

  const protocol = forwardedProto || request.protocol || 'http'
  const host = forwardedHost || request.headers.host || `127.0.0.1:${port}`
  return `${protocol}://${host}`
}

function inviteLink(request, token) {
  return new URL(`/invite/${encodeURIComponent(token)}`, requestOrigin(request)).toString()
}

function issueInviteLink(request, user) {
  if (user.status !== 'invited') {
    return {
      user: publicUser(user),
      inviteLink: null,
    }
  }

  const token = crypto.randomBytes(32).toString('base64url')
  const invitedUser = setUserInvite({
    userId: user.id,
    tokenHash: hashSessionToken(token),
    expiresAt: inviteExpiresAt(),
  })

  return {
    user: publicUser(invitedUser),
    inviteLink: inviteLink(request, token),
  }
}

app.get('/auth/health', (_request, response) => {
  response.json({ ok: true })
})

app.post('/auth/register', (request, response) => {
  const credentials = getCredentials(request)
  const validationError =
    validateCredentials(credentials) || validateUsername(credentials.username)

  if (validationError) {
    response.status(400).json({ message: validationError })
    return
  }

  const existingUser =
    findUserByEmail(credentials.email) ||
    (credentials.username ? findUserByUsername(credentials.username) : null)

  if (existingUser) {
    response.status(409).json({ message: 'Пользователь уже существует.' })
    return
  }

  const { hash, salt } = hashPassword(credentials.password)
  const user = createUser({
    username: credentials.username || null,
    email: credentials.email,
    passwordHash: hash,
    passwordSalt: salt,
  })

  issueSession(response, user)
  response.status(201).json({ user: publicUser(user) })
})

app.post('/auth/login', (request, response) => {
  const credentials = getCredentials(request)
  const user = findUserByLogin(credentials.login)

  if (!user || !verifyPassword(credentials.password, user.passwordSalt, user.passwordHash)) {
    response.status(401).json({ message: 'Неверный логин или пароль.' })
    return
  }

  if (user.status !== 'active') {
    response.status(403).json({ message: 'Пользователь ожидает приглашение.' })
    return
  }

  issueSession(response, user)
  response.json({ user: publicUser(user) })
})

app.post('/auth/admin/users/invite', (request, response) => {
  const admin = requireAdmin(request, response)

  if (!admin) {
    return
  }

  const invite = getInvitePayload(request)
  const validationError = validateInvitePayload(invite)

  if (validationError) {
    response.status(400).json({ message: validationError })
    return
  }

  const temporaryPassword = crypto.randomBytes(24).toString('base64url')
  const { hash, salt } = hashPassword(temporaryPassword)
  const result = createOrInviteUser({
    username: invite.username,
    email: invite.email,
    passwordHash: hash,
    passwordSalt: salt,
    contourId: invite.contourId,
  })
  const issuedInvite = issueInviteLink(request, result.user)

  response.status(result.created ? 201 : 200).json({
    user: issuedInvite.user,
    created: result.created,
    inviteLink: issuedInvite.inviteLink,
  })
})

app.get('/auth/admin/users', (request, response) => {
  const admin = requireAdmin(request, response)

  if (!admin) {
    return
  }

  response.json({
    users: listUsers().map(publicUser),
  })
})

app.post('/auth/admin/users/:id/invite-link', (request, response) => {
  const admin = requireAdmin(request, response)

  if (!admin) {
    return
  }

  const userId = Number(request.params.id)

  if (!Number.isInteger(userId) || userId <= 0) {
    response.status(400).json({ message: 'Некорректный id пользователя.' })
    return
  }

  const user = findUserById(userId)

  if (!user) {
    response.status(404).json({ message: 'Пользователь не найден.' })
    return
  }

  if (user.status !== 'invited') {
    response.status(400).json({ message: 'Пользователь уже активен.' })
    return
  }

  const issuedInvite = issueInviteLink(request, user)

  response.json({
    user: issuedInvite.user,
    inviteLink: issuedInvite.inviteLink,
  })
})

app.get('/auth/invites/:token', (request, response) => {
  const token = String(request.params.token ?? '').trim()
  const user = token ? findUserByInviteTokenHash(hashSessionToken(token)) : null

  if (!user) {
    response.status(404).json({ message: 'Инвайт не найден или истек.' })
    return
  }

  response.json({ user: publicUser(user) })
})

app.post('/auth/invites/:token/accept', (request, response) => {
  const token = String(request.params.token ?? '').trim()
  const user = token ? findUserByInviteTokenHash(hashSessionToken(token)) : null

  if (!user) {
    response.status(404).json({ message: 'Инвайт не найден или истек.' })
    return
  }

  const password = String(request.body?.password ?? '')

  if (password.length < 8) {
    response.status(400).json({ message: 'Пароль должен быть не короче 8 символов.' })
    return
  }

  const { hash, salt } = hashPassword(password)
  const activatedUser = activateInvitedUser({
    userId: user.id,
    passwordHash: hash,
    passwordSalt: salt,
  })

  if (!activatedUser) {
    response.status(409).json({ message: 'Инвайт уже был принят.' })
    return
  }

  issueSession(response, activatedUser)
  response.json({ user: publicUser(activatedUser) })
})

app.get('/auth/me', (request, response) => {
  const user = currentUser(request)

  if (!user) {
    response.status(401).json({ user: null })
    return
  }

  response.json({ user: publicUser(user) })
})

app.post('/auth/logout', (request, response) => {
  deleteSessionByToken(getSessionToken(request))
  response.setHeader('Set-Cookie', clearSessionCookie())
  response.status(204).end()
})

app.listen(port, '127.0.0.1', () => {
  console.log(`Auth listening on http://127.0.0.1:${port}`)
})
