import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContour, deleteContour, listContours, listContoursByIds } from './db.js'

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

function requireAdmin(request, response) {
  if (request.user.role === 'admin') {
    return true
  }

  response.status(403).json({ message: 'Недостаточно прав.' })
  return false
}

app.get('/api/contours', withAuth((request, response) => {
  const contours = canAccessAllContours(request.user)
    ? listContours()
    : listContoursByIds(request.user.availableContours ?? [])

  response.json({ contours })
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
