import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContour, deleteContour, listContours } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT ?? 3001)

app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

app.get('/api/contours', (_request, response) => {
  response.json({ contours: listContours() })
})

app.post('/api/contours', (request, response) => {
  const name = String(request.body?.name ?? '').trim()
  const description = String(request.body?.description ?? '').trim()

  if (!name) {
    response.status(400).json({ message: 'Название обязательно.' })
    return
  }

  const contour = createContour({ name, description })
  response.status(201).json({ contour })
})

app.delete('/api/contours/:id', (request, response) => {
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
