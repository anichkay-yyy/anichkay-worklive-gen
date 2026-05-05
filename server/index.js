import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createContour,
  deleteContour,
  getContour,
  listContourMembers,
  listContours,
  listContoursByIds,
  upsertContourMember,
} from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT ?? 3001)
const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:3002'

app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

async function currentUser(request) {
  const authResponse = await fetch(`${authServiceUrl}/auth/me`, {
    headers: {
      cookie: request.headers.cookie ?? '',
    },
  })

  if (!authResponse.ok) {
    return null
  }

  const payload = await authResponse.json()
  return payload.user ?? null
}

function route(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next)
  }
}

function withAuth(handler) {
  return route(async (request, response) => {
    const user = await currentUser(request)

    if (!user) {
      response.status(401).json({ message: 'Требуется авторизация.' })
      return
    }

    request.user = user
    await handler(request, response)
  })
}

function canAccessAllContours(user) {
  return user.availableContours?.includes('all')
}

function canAccessContour(user, contourId) {
  return (
    canAccessAllContours(user) ||
    (user.availableContours ?? []).some((id) => Number(id) === contourId)
  )
}

function requireAdmin(request, response) {
  if (request.user.role === 'admin') {
    return true
  }

  response.status(403).json({ message: 'Недостаточно прав.' })
  return false
}

function normalizeMemberFilters(query) {
  return {
    query: String(query.query ?? '').trim(),
    role: String(query.role ?? 'all'),
    access: String(query.access ?? 'all'),
  }
}

function currentUserMember(user, contourId) {
  const role = user.role === 'admin' ? 'admin' : 'viewer'

  return {
    contourId,
    userId: user.id,
    username: user.username || user.email,
    email: user.email,
    role,
    access: role === 'admin' ? 'full' : 'view',
    status: 'active',
    invitedAt: null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

function memberMatchesFilters(member, filters) {
  const query = filters.query.toLowerCase()
  const matchesQuery =
    !query ||
    member.username.toLowerCase().includes(query) ||
    member.email.toLowerCase().includes(query)
  const matchesRole = filters.role === 'all' || member.role === filters.role
  const matchesAccess = filters.access === 'all' || member.access === filters.access

  return matchesQuery && matchesRole && matchesAccess
}

function validateMemberRole(role) {
  return ['admin', 'editor', 'viewer'].includes(role)
}

function validateMemberAccess(access) {
  return ['full', 'edit', 'view'].includes(access)
}

app.get('/api/contours', withAuth((request, response) => {
  const contours = canAccessAllContours(request.user)
    ? listContours()
    : listContoursByIds(request.user.availableContours ?? [])

  response.json({ contours })
}))

app.get('/api/contours/:id', withAuth((request, response) => {
  const id = Number(request.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    response.status(400).json({ message: 'Некорректный id контура.' })
    return
  }

  if (!canAccessContour(request.user, id)) {
    response.status(403).json({ message: 'Нет доступа к контуру.' })
    return
  }

  const contour = getContour(id)

  if (!contour) {
    response.status(404).json({ message: 'Контур не найден.' })
    return
  }

  response.json({ contour })
}))

app.get('/api/contours/:id/members', withAuth((request, response) => {
  const id = Number(request.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    response.status(400).json({ message: 'Некорректный id контура.' })
    return
  }

  if (!canAccessContour(request.user, id)) {
    response.status(403).json({ message: 'Нет доступа к контуру.' })
    return
  }

  const filters = normalizeMemberFilters(request.query)
  const members = listContourMembers(id, filters)
  const hasCurrentUser = members.some((member) => member.userId === request.user.id)

  if (!hasCurrentUser && canAccessContour(request.user, id)) {
    const ownerMember = currentUserMember(request.user, id)

    if (memberMatchesFilters(ownerMember, filters)) {
      members.unshift(ownerMember)
    }
  }

  response.json({ members })
}))

app.post('/api/contours/:id/invites', withAuth(async (request, response) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const id = Number(request.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    response.status(400).json({ message: 'Некорректный id контура.' })
    return
  }

  if (!canAccessContour(request.user, id)) {
    response.status(403).json({ message: 'Нет доступа к контуру.' })
    return
  }

  const username = String(request.body?.username ?? '').trim()
  const email = String(request.body?.email ?? '').trim()
  const role = String(request.body?.role ?? 'viewer')
  const access = String(request.body?.access ?? 'view')

  if (!validateMemberRole(role)) {
    response.status(400).json({ message: 'Некорректная роль участника.' })
    return
  }

  if (!validateMemberAccess(access)) {
    response.status(400).json({ message: 'Некорректный доступ участника.' })
    return
  }

  const authResponse = await fetch(`${authServiceUrl}/auth/admin/users/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: request.headers.cookie ?? '',
    },
    body: JSON.stringify({
      username,
      email,
      contourId: id,
    }),
  })
  const authPayload = await authResponse.json().catch(() => ({}))

  if (!authResponse.ok) {
    response.status(authResponse.status).json({
      message: authPayload.message || 'Не удалось создать приглашение.',
    })
    return
  }

  const member = upsertContourMember({
    contourId: id,
    user: authPayload.user,
    role,
    access,
    status: 'invited',
  })

  response.status(authResponse.status === 201 ? 201 : 200).json({
    member,
    user: authPayload.user,
    created: authPayload.created,
  })
}))

app.post('/api/contours', withAuth((request, response) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const name = String(request.body?.name ?? '').trim()
  const description = String(request.body?.description ?? '').trim()

  if (!name) {
    response.status(400).json({ message: 'Название обязательно.' })
    return
  }

  const contour = createContour({ name, description })
  response.status(201).json({ contour })
}))

app.delete('/api/contours/:id', withAuth((request, response) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const id = Number(request.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    response.status(400).json({ message: 'Некорректный id контура.' })
    return
  }

  if (!deleteContour(id)) {
    response.status(404).json({ message: 'Контур не найден.' })
    return
  }

  response.status(204).end()
}))

app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({ message: 'Внутренняя ошибка сервера.' })
})

const distDir = path.resolve(__dirname, '../dist')

if (process.env.NODE_ENV === 'production' && fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(port, '127.0.0.1', () => {
  console.log(`API listening on http://127.0.0.1:${port}`)
})
