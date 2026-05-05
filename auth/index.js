import express from 'express'
import crypto from 'node:crypto'
import {
  clearSessionCookie,
  getSessionToken,
  sessionCookie,
} from './cookies.js'
import {
  createSession,
  createUser,
  deleteSessionByToken,
  findUserByEmail,
  findUserBySessionToken,
  normalizeEmail,
  publicUser,
} from './db.js'
import { hashPassword, verifyPassword } from './passwords.js'

const app = express()
const port = Number(process.env.AUTH_PORT ?? 3002)
const sessionTtlMs = Number(process.env.SESSION_TTL_MS ?? 1000 * 60 * 60 * 24 * 7)
const sessionMaxAgeSeconds = Math.floor(sessionTtlMs / 1000)

app.use(express.json({ limit: '32kb' }))

function sessionExpiresAt() {
  return new Date(Date.now() + sessionTtlMs).toISOString()
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
  const email = normalizeEmail(String(request.body?.email ?? ''))
  const password = String(request.body?.password ?? '')

  return { email, password }
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

app.get('/auth/health', (_request, response) => {
  response.json({ ok: true })
})

app.post('/auth/register', (request, response) => {
  const credentials = getCredentials(request)
  const validationError = validateCredentials(credentials)

  if (validationError) {
    response.status(400).json({ message: validationError })
    return
  }

  const existingUser = findUserByEmail(credentials.email)

  if (existingUser) {
    response.status(409).json({ message: 'Пользователь уже существует.' })
    return
  }

  const { hash, salt } = hashPassword(credentials.password)
  const user = createUser({
    email: credentials.email,
    passwordHash: hash,
    passwordSalt: salt,
  })

  issueSession(response, user)
  response.status(201).json({ user: publicUser(user) })
})

app.post('/auth/login', (request, response) => {
  const credentials = getCredentials(request)
  const user = findUserByEmail(credentials.email)

  if (!user || !verifyPassword(credentials.password, user.passwordSalt, user.passwordHash)) {
    response.status(401).json({ message: 'Неверный email или пароль.' })
    return
  }

  issueSession(response, user)
  response.json({ user: publicUser(user) })
})

app.get('/auth/me', (request, response) => {
  const user = findUserBySessionToken(getSessionToken(request))

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
