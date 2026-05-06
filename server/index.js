import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createCashFlow,
  createCashFlowNode,
  createContour,
  createHunterSource,
  deleteCashFlow,
  deleteCashFlowNode,
  deleteContour,
  deleteHunterSource,
  getBusinessFlowBoardContour,
  getCashFlow,
  getCashFlowNode,
  getCashFlowBoardContour,
  getContour,
  getHunterSourceForUser,
  listCashFlowNodes,
  listCashFlows,
  listContourMembers,
  listContours,
  listContoursByIds,
  listHunterSourcesForUser,
  listParticipantContoursForUser,
  updateCashFlow,
  updateCashFlowNode,
  updateCashFlowNodePosition,
  updateHunterSource,
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

function listMembersWithCurrentUser(user, contourId, filters = {}) {
  const normalizedFilters = {
    query: '',
    role: 'all',
    access: 'all',
    ...filters,
  }
  const members = listContourMembers(contourId, normalizedFilters)
  const hasCurrentUser = members.some((member) => member.userId === user.id)

  if (!hasCurrentUser && canAccessContour(user, contourId)) {
    const ownerMember = currentUserMember(user, contourId)

    if (memberMatchesFilters(ownerMember, normalizedFilters)) {
      members.unshift(ownerMember)
    }
  }

  return members
}

function validateMemberRole(role) {
  return ['admin', 'editor', 'viewer'].includes(role)
}

function validateMemberAccess(access) {
  return ['full', 'edit', 'view'].includes(access)
}

function parseContourId(rawId, response) {
  const id = Number(rawId)

  if (!Number.isInteger(id) || id <= 0) {
    response.status(400).json({ message: 'Некорректный id контура.' })
    return null
  }

  return id
}

function ensureContourAccess(request, response, id) {
  if (!canAccessContour(request.user, id)) {
    response.status(403).json({ message: 'Нет доступа к контуру.' })
    return null
  }

  const contour = getContour(id)

  if (!contour) {
    response.status(404).json({ message: 'Контур не найден.' })
    return null
  }

  return contour
}

function ensureCashFlowBoardAccess(request, response) {
  const contour = getCashFlowBoardContour()

  if (!canAccessContour(request.user, contour.id)) {
    response.status(403).json({ message: 'Нет доступа к cash-flows.' })
    return null
  }

  return contour
}

function withCashFlowBoard(handler) {
  return withAuth((request, response) => {
    const contour = ensureCashFlowBoardAccess(request, response)

    if (!contour) {
      return null
    }

    return handler(request, response, contour.id, contour)
  })
}

function withBusinessFlowBoard(handler) {
  return withAuth((request, response) => {
    const parentContour = ensureCashFlowBoardAccess(request, response)

    if (!parentContour) {
      return null
    }

    const parentFlow = getCashFlow(parentContour.id, request.params.flowId)

    if (!parentFlow) {
      response.status(404).json({ message: 'Связь не найдена.' })
      return null
    }

    const businessContour = getBusinessFlowBoardContour(parentFlow.id)
    return handler(request, response, businessContour.id, parentFlow, parentContour)
  })
}

function validateCashFlowNodeType(type) {
  return ['source', 'consumer', 'middleware'].includes(type)
}

function validateBusinessFlowNodeType(type) {
  return ['hunter', 'support', 'worker', 'ultima'].includes(type)
}

function normalizePercent(value) {
  const percent = Number(value)

  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return null
  }

  return Math.round(percent)
}

function normalizePosition(value) {
  const position = Number(value)

  if (!Number.isFinite(position)) {
    return null
  }

  return position
}

function normalizeTextField(value, maxLength) {
  const text = String(value ?? '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function ensureParticipantRole(request, response, flowId, role) {
  const participantContour = listParticipantContoursForUser(request.user).find((contour) => {
    return contour.flowId === flowId && contour.role === role
  })

  if (!participantContour) {
    response.status(403).json({ message: 'Нет доступа к этой борде.' })
    return null
  }

  return participantContour
}

app.get('/api/contours', withAuth((request, response) => {
  const contours = canAccessAllContours(request.user)
    ? listContours()
    : listContoursByIds(request.user.availableContours ?? [])

  response.json({ contours })
}))

app.get('/api/my-contours', withAuth((request, response) => {
  response.json({
    contours: listParticipantContoursForUser(request.user),
  })
}))

app.get('/api/hunter/sources', withAuth((request, response) => {
  const flowId = String(request.query.flowId ?? '').trim()

  if (flowId && !ensureParticipantRole(request, response, flowId, 'hunter')) {
    return
  }

  response.json({
    sources: listHunterSourcesForUser({
      userId: request.user.id,
      flowId: flowId || null,
    }),
  })
}))

app.post('/api/hunter/sources', withAuth((request, response) => {
  const flowId = String(request.body?.flowId ?? '').trim()
  const companyInfo = normalizeTextField(request.body?.companyInfo, 2000)
  const contactInfo = normalizeTextField(request.body?.contactInfo, 2000)
  const description = normalizeTextField(request.body?.description, 4000)

  if (!flowId) {
    response.status(400).json({ message: 'Контур обязателен.' })
    return
  }

  if (!ensureParticipantRole(request, response, flowId, 'hunter')) {
    return
  }

  if (!companyInfo && !contactInfo && !description) {
    response.status(400).json({ message: 'Заполните хотя бы одно поле.' })
    return
  }

  const source = createHunterSource({
    flowId,
    userId: request.user.id,
    companyInfo,
    contactInfo,
    description,
  })

  response.status(201).json({ source })
}))

app.patch('/api/hunter/sources/:sourceId', withAuth((request, response) => {
  const existingSource = getHunterSourceForUser(request.user.id, request.params.sourceId)

  if (!existingSource) {
    response.status(404).json({ message: 'Сорс не найден.' })
    return
  }

  if (!ensureParticipantRole(request, response, existingSource.flowId, 'hunter')) {
    return
  }

  const companyInfo = normalizeTextField(request.body?.companyInfo, 2000)
  const contactInfo = normalizeTextField(request.body?.contactInfo, 2000)
  const description = normalizeTextField(request.body?.description, 4000)

  if (!companyInfo && !contactInfo && !description) {
    response.status(400).json({ message: 'Заполните хотя бы одно поле.' })
    return
  }

  const source = updateHunterSource({
    userId: request.user.id,
    sourceId: request.params.sourceId,
    companyInfo,
    contactInfo,
    description,
  })

  response.json({ source })
}))

app.delete('/api/hunter/sources/:sourceId', withAuth((request, response) => {
  const existingSource = getHunterSourceForUser(request.user.id, request.params.sourceId)

  if (!existingSource) {
    response.status(404).json({ message: 'Сорс не найден.' })
    return
  }

  if (!ensureParticipantRole(request, response, existingSource.flowId, 'hunter')) {
    return
  }

  deleteHunterSource(request.user.id, request.params.sourceId)
  response.status(204).end()
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
  const members = listMembersWithCurrentUser(request.user, id, filters)

  response.json({ members })
}))

app.get('/api/contours/:id/cash-flows', withAuth((request, response) => {
  const id = parseContourId(request.params.id, response)

  if (id === null || !ensureContourAccess(request, response, id)) {
    return
  }

  response.json({
    nodes: listCashFlowNodes(id),
    flows: listCashFlows(id),
  })
}))

app.get('/api/cash-flows', withCashFlowBoard((_request, response, contourId, contour) => {
  response.json({
    board: {
      id: contour.id,
      name: contour.name,
    },
    nodes: listCashFlowNodes(contourId),
    flows: listCashFlows(contourId),
  })
}))

app.post('/api/cash-flows/nodes', withCashFlowBoard((request, response, contourId) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const name = String(request.body?.name ?? '').trim()
  const type = String(request.body?.type ?? 'source')
  const positionX = normalizePosition(request.body?.positionX ?? 0)
  const positionY = normalizePosition(request.body?.positionY ?? 0)

  if (!name) {
    response.status(400).json({ message: 'Название узла обязательно.' })
    return
  }

  if (!validateCashFlowNodeType(type)) {
    response.status(400).json({ message: 'Некорректный тип узла.' })
    return
  }

  if (positionX === null || positionY === null) {
    response.status(400).json({ message: 'Некорректная позиция узла.' })
    return
  }

  const node = createCashFlowNode({
    contourId,
    name,
    type,
    positionX,
    positionY,
  })

  response.status(201).json({ node })
}))

app.patch('/api/cash-flows/nodes/:nodeId', withCashFlowBoard((request, response, contourId) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const name = String(request.body?.name ?? '').trim()
  const type = String(request.body?.type ?? 'source')

  if (!name) {
    response.status(400).json({ message: 'Название узла обязательно.' })
    return
  }

  if (!validateCashFlowNodeType(type)) {
    response.status(400).json({ message: 'Некорректный тип узла.' })
    return
  }

  const node = updateCashFlowNode({
    contourId,
    nodeId: request.params.nodeId,
    name,
    type,
  })

  if (!node) {
    response.status(404).json({ message: 'Узел не найден.' })
    return
  }

  response.json({ node })
}))

app.patch('/api/cash-flows/nodes/:nodeId/position', withCashFlowBoard((request, response, contourId) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const positionX = normalizePosition(request.body?.positionX)
  const positionY = normalizePosition(request.body?.positionY)

  if (positionX === null || positionY === null) {
    response.status(400).json({ message: 'Некорректная позиция узла.' })
    return
  }

  const node = updateCashFlowNodePosition({
    contourId,
    nodeId: request.params.nodeId,
    positionX,
    positionY,
  })

  if (!node) {
    response.status(404).json({ message: 'Узел не найден.' })
    return
  }

  response.json({ node })
}))

app.delete('/api/cash-flows/nodes/:nodeId', withCashFlowBoard((request, response, contourId) => {
  if (!requireAdmin(request, response)) {
    return
  }

  if (!deleteCashFlowNode(contourId, request.params.nodeId)) {
    response.status(404).json({ message: 'Узел не найден.' })
    return
  }

  response.status(204).end()
}))

app.post('/api/cash-flows/flows', withCashFlowBoard((request, response, contourId) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const sourceNodeId = String(request.body?.sourceNodeId ?? '').trim()
  const targetNodeId = String(request.body?.targetNodeId ?? '').trim()
  const label = String(request.body?.label ?? '').trim()
  const constancy = normalizePercent(request.body?.constancy ?? 50)
  const share = normalizePercent(request.body?.share ?? 100)

  if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) {
    response.status(400).json({ message: 'Некорректная связь.' })
    return
  }

  if (constancy === null || share === null) {
    response.status(400).json({ message: 'Параметры связи должны быть от 0 до 100.' })
    return
  }

  if (!getCashFlowNode(contourId, sourceNodeId) || !getCashFlowNode(contourId, targetNodeId)) {
    response.status(400).json({ message: 'Узлы связи не найдены в этой борде.' })
    return
  }

  const flow = createCashFlow({
    contourId,
    sourceNodeId,
    targetNodeId,
    label,
    constancy,
    share,
  })

  response.status(201).json({ flow })
}))

app.patch('/api/cash-flows/flows/:flowId', withCashFlowBoard((request, response, contourId) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const label = String(request.body?.label ?? '').trim()
  const constancy = normalizePercent(request.body?.constancy ?? 50)
  const share = normalizePercent(request.body?.share ?? 100)

  if (constancy === null || share === null) {
    response.status(400).json({ message: 'Параметры связи должны быть от 0 до 100.' })
    return
  }

  const flow = updateCashFlow({
    contourId,
    flowId: request.params.flowId,
    label,
    constancy,
    share,
  })

  if (!flow) {
    response.status(404).json({ message: 'Связь не найдена.' })
    return
  }

  response.json({ flow })
}))

app.delete('/api/cash-flows/flows/:flowId', withCashFlowBoard((request, response, contourId) => {
  if (!requireAdmin(request, response)) {
    return
  }

  if (!deleteCashFlow(contourId, request.params.flowId)) {
    response.status(404).json({ message: 'Связь не найдена.' })
    return
  }

  response.status(204).end()
}))

app.get('/api/cash-flows/flows/:flowId/business-flow', withBusinessFlowBoard((request, response, contourId, parentFlow, parentContour) => {
  response.json({
    parentFlow: {
      id: parentFlow.id,
      label: parentFlow.label,
    },
    nodes: listCashFlowNodes(contourId),
    flows: listCashFlows(contourId),
    members: listMembersWithCurrentUser(request.user, parentContour.id),
  })
}))

app.post('/api/cash-flows/flows/:flowId/business-flow/invites', withBusinessFlowBoard(async (request, response, _contourId, _parentFlow, parentContour) => {
  if (!requireAdmin(request, response)) {
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
      contourId: parentContour.id,
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
    contourId: parentContour.id,
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

app.post('/api/cash-flows/flows/:flowId/business-flow/nodes', withBusinessFlowBoard((request, response, contourId) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const name = String(request.body?.name ?? '').trim()
  const type = String(request.body?.type ?? 'hunter')
  const positionX = normalizePosition(request.body?.positionX ?? 0)
  const positionY = normalizePosition(request.body?.positionY ?? 0)

  if (!name) {
    response.status(400).json({ message: 'Название узла обязательно.' })
    return
  }

  if (!validateBusinessFlowNodeType(type)) {
    response.status(400).json({ message: 'Некорректный тип узла.' })
    return
  }

  if (positionX === null || positionY === null) {
    response.status(400).json({ message: 'Некорректная позиция узла.' })
    return
  }

  const node = createCashFlowNode({
    contourId,
    name,
    type,
    positionX,
    positionY,
  })

  response.status(201).json({ node })
}))

app.patch('/api/cash-flows/flows/:flowId/business-flow/nodes/:nodeId', withBusinessFlowBoard((request, response, contourId) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const name = String(request.body?.name ?? '').trim()
  const type = String(request.body?.type ?? 'hunter')

  if (!name) {
    response.status(400).json({ message: 'Название узла обязательно.' })
    return
  }

  if (!validateBusinessFlowNodeType(type)) {
    response.status(400).json({ message: 'Некорректный тип узла.' })
    return
  }

  const node = updateCashFlowNode({
    contourId,
    nodeId: request.params.nodeId,
    name,
    type,
  })

  if (!node) {
    response.status(404).json({ message: 'Узел не найден.' })
    return
  }

  response.json({ node })
}))

app.patch('/api/cash-flows/flows/:flowId/business-flow/nodes/:nodeId/position', withBusinessFlowBoard((request, response, contourId) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const positionX = normalizePosition(request.body?.positionX)
  const positionY = normalizePosition(request.body?.positionY)

  if (positionX === null || positionY === null) {
    response.status(400).json({ message: 'Некорректная позиция узла.' })
    return
  }

  const node = updateCashFlowNodePosition({
    contourId,
    nodeId: request.params.nodeId,
    positionX,
    positionY,
  })

  if (!node) {
    response.status(404).json({ message: 'Узел не найден.' })
    return
  }

  response.json({ node })
}))

app.delete('/api/cash-flows/flows/:flowId/business-flow/nodes/:nodeId', withBusinessFlowBoard((request, response, contourId) => {
  if (!requireAdmin(request, response)) {
    return
  }

  if (!deleteCashFlowNode(contourId, request.params.nodeId)) {
    response.status(404).json({ message: 'Узел не найден.' })
    return
  }

  response.status(204).end()
}))

app.post('/api/cash-flows/flows/:flowId/business-flow/flows', withBusinessFlowBoard((request, response, contourId) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const sourceNodeId = String(request.body?.sourceNodeId ?? '').trim()
  const targetNodeId = String(request.body?.targetNodeId ?? '').trim()

  if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) {
    response.status(400).json({ message: 'Некорректная связь.' })
    return
  }

  if (!getCashFlowNode(contourId, sourceNodeId) || !getCashFlowNode(contourId, targetNodeId)) {
    response.status(400).json({ message: 'Узлы связи не найдены в этой борде.' })
    return
  }

  const existingFlow = listCashFlows(contourId).find((flow) => {
    return flow.sourceNodeId === sourceNodeId && flow.targetNodeId === targetNodeId
  })

  if (existingFlow) {
    response.json({ flow: existingFlow })
    return
  }

  const flow = createCashFlow({
    contourId,
    sourceNodeId,
    targetNodeId,
    label: '',
    constancy: 100,
    share: 100,
  })

  response.status(201).json({ flow })
}))

app.delete('/api/cash-flows/flows/:flowId/business-flow/flows/:businessFlowId', withBusinessFlowBoard((request, response, contourId) => {
  if (!requireAdmin(request, response)) {
    return
  }

  if (!deleteCashFlow(contourId, request.params.businessFlowId)) {
    response.status(404).json({ message: 'Связь не найдена.' })
    return
  }

  response.status(204).end()
}))

app.post('/api/contours/:id/cash-flows/nodes', withAuth((request, response) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const id = parseContourId(request.params.id, response)

  if (id === null || !ensureContourAccess(request, response, id)) {
    return
  }

  const name = String(request.body?.name ?? '').trim()
  const type = String(request.body?.type ?? 'source')
  const positionX = normalizePosition(request.body?.positionX ?? 0)
  const positionY = normalizePosition(request.body?.positionY ?? 0)

  if (!name) {
    response.status(400).json({ message: 'Название узла обязательно.' })
    return
  }

  if (!validateCashFlowNodeType(type)) {
    response.status(400).json({ message: 'Некорректный тип узла.' })
    return
  }

  if (positionX === null || positionY === null) {
    response.status(400).json({ message: 'Некорректная позиция узла.' })
    return
  }

  const node = createCashFlowNode({
    contourId: id,
    name,
    type,
    positionX,
    positionY,
  })

  response.status(201).json({ node })
}))

app.patch('/api/contours/:id/cash-flows/nodes/:nodeId', withAuth((request, response) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const id = parseContourId(request.params.id, response)

  if (id === null || !ensureContourAccess(request, response, id)) {
    return
  }

  const name = String(request.body?.name ?? '').trim()
  const type = String(request.body?.type ?? 'source')

  if (!name) {
    response.status(400).json({ message: 'Название узла обязательно.' })
    return
  }

  if (!validateCashFlowNodeType(type)) {
    response.status(400).json({ message: 'Некорректный тип узла.' })
    return
  }

  const node = updateCashFlowNode({
    contourId: id,
    nodeId: request.params.nodeId,
    name,
    type,
  })

  if (!node) {
    response.status(404).json({ message: 'Узел не найден.' })
    return
  }

  response.json({ node })
}))

app.patch('/api/contours/:id/cash-flows/nodes/:nodeId/position', withAuth((request, response) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const id = parseContourId(request.params.id, response)

  if (id === null || !ensureContourAccess(request, response, id)) {
    return
  }

  const positionX = normalizePosition(request.body?.positionX)
  const positionY = normalizePosition(request.body?.positionY)

  if (positionX === null || positionY === null) {
    response.status(400).json({ message: 'Некорректная позиция узла.' })
    return
  }

  const node = updateCashFlowNodePosition({
    contourId: id,
    nodeId: request.params.nodeId,
    positionX,
    positionY,
  })

  if (!node) {
    response.status(404).json({ message: 'Узел не найден.' })
    return
  }

  response.json({ node })
}))

app.delete('/api/contours/:id/cash-flows/nodes/:nodeId', withAuth((request, response) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const id = parseContourId(request.params.id, response)

  if (id === null || !ensureContourAccess(request, response, id)) {
    return
  }

  if (!deleteCashFlowNode(id, request.params.nodeId)) {
    response.status(404).json({ message: 'Узел не найден.' })
    return
  }

  response.status(204).end()
}))

app.post('/api/contours/:id/cash-flows/flows', withAuth((request, response) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const id = parseContourId(request.params.id, response)

  if (id === null || !ensureContourAccess(request, response, id)) {
    return
  }

  const sourceNodeId = String(request.body?.sourceNodeId ?? '').trim()
  const targetNodeId = String(request.body?.targetNodeId ?? '').trim()
  const label = String(request.body?.label ?? '').trim()
  const constancy = normalizePercent(request.body?.constancy ?? 50)
  const share = normalizePercent(request.body?.share ?? 100)

  if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) {
    response.status(400).json({ message: 'Некорректная связь.' })
    return
  }

  if (constancy === null || share === null) {
    response.status(400).json({ message: 'Параметры связи должны быть от 0 до 100.' })
    return
  }

  if (!getCashFlowNode(id, sourceNodeId) || !getCashFlowNode(id, targetNodeId)) {
    response.status(400).json({ message: 'Узлы связи не найдены в этом контуре.' })
    return
  }

  const flow = createCashFlow({
    contourId: id,
    sourceNodeId,
    targetNodeId,
    label,
    constancy,
    share,
  })

  response.status(201).json({ flow })
}))

app.patch('/api/contours/:id/cash-flows/flows/:flowId', withAuth((request, response) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const id = parseContourId(request.params.id, response)

  if (id === null || !ensureContourAccess(request, response, id)) {
    return
  }

  const label = String(request.body?.label ?? '').trim()
  const constancy = normalizePercent(request.body?.constancy ?? 50)
  const share = normalizePercent(request.body?.share ?? 100)

  if (constancy === null || share === null) {
    response.status(400).json({ message: 'Параметры связи должны быть от 0 до 100.' })
    return
  }

  const flow = updateCashFlow({
    contourId: id,
    flowId: request.params.flowId,
    label,
    constancy,
    share,
  })

  if (!flow) {
    response.status(404).json({ message: 'Связь не найдена.' })
    return
  }

  response.json({ flow })
}))

app.delete('/api/contours/:id/cash-flows/flows/:flowId', withAuth((request, response) => {
  if (!requireAdmin(request, response)) {
    return
  }

  const id = parseContourId(request.params.id, response)

  if (id === null || !ensureContourAccess(request, response, id)) {
    return
  }

  if (!deleteCashFlow(id, request.params.flowId)) {
    response.status(404).json({ message: 'Связь не найдена.' })
    return
  }

  response.status(204).end()
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
