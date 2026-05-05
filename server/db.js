import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
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

  CREATE TABLE IF NOT EXISTS cash_flow_nodes (
    id TEXT PRIMARY KEY,
    contour_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    position_x REAL NOT NULL DEFAULT 0,
    position_y REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contour_id) REFERENCES contours(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS cash_flow_nodes_contour_id_index
    ON cash_flow_nodes (contour_id);

  CREATE TABLE IF NOT EXISTS cash_flow_edges (
    id TEXT PRIMARY KEY,
    contour_id INTEGER NOT NULL,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    constancy INTEGER NOT NULL DEFAULT 50,
    share INTEGER NOT NULL DEFAULT 100,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contour_id) REFERENCES contours(id) ON DELETE CASCADE,
    FOREIGN KEY (source_node_id) REFERENCES cash_flow_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES cash_flow_nodes(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS cash_flow_edges_contour_id_index
    ON cash_flow_edges (contour_id);
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

const toCashFlowNode = (row) => ({
  id: row.id,
  contourId: row.contour_id,
  name: row.name,
  type: row.type,
  positionX: row.position_x,
  positionY: row.position_y,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toCashFlowEdge = (row) => ({
  id: row.id,
  contourId: row.contour_id,
  sourceNodeId: row.source_node_id,
  targetNodeId: row.target_node_id,
  label: row.label,
  constancy: row.constancy,
  share: row.share,
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
  listCashFlowNodes: db.prepare(`
    SELECT
      id,
      contour_id,
      name,
      type,
      position_x,
      position_y,
      created_at,
      updated_at
    FROM cash_flow_nodes
    WHERE contour_id = ?
    ORDER BY created_at ASC, id ASC
  `),
  getCashFlowNode: db.prepare(`
    SELECT
      id,
      contour_id,
      name,
      type,
      position_x,
      position_y,
      created_at,
      updated_at
    FROM cash_flow_nodes
    WHERE contour_id = ? AND id = ?
  `),
  createCashFlowNode: db.prepare(`
    INSERT INTO cash_flow_nodes (
      id,
      contour_id,
      name,
      type,
      position_x,
      position_y
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  updateCashFlowNode: db.prepare(`
    UPDATE cash_flow_nodes
    SET
      name = ?,
      type = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE contour_id = ? AND id = ?
  `),
  updateCashFlowNodePosition: db.prepare(`
    UPDATE cash_flow_nodes
    SET
      position_x = ?,
      position_y = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE contour_id = ? AND id = ?
  `),
  deleteCashFlowNode: db.prepare(`
    DELETE FROM cash_flow_nodes
    WHERE contour_id = ? AND id = ?
  `),
  listCashFlows: db.prepare(`
    SELECT
      id,
      contour_id,
      source_node_id,
      target_node_id,
      label,
      constancy,
      share,
      created_at,
      updated_at
    FROM cash_flow_edges
    WHERE contour_id = ?
    ORDER BY created_at ASC, id ASC
  `),
  getCashFlow: db.prepare(`
    SELECT
      id,
      contour_id,
      source_node_id,
      target_node_id,
      label,
      constancy,
      share,
      created_at,
      updated_at
    FROM cash_flow_edges
    WHERE contour_id = ? AND id = ?
  `),
  createCashFlow: db.prepare(`
    INSERT INTO cash_flow_edges (
      id,
      contour_id,
      source_node_id,
      target_node_id,
      label,
      constancy,
      share
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  updateCashFlow: db.prepare(`
    UPDATE cash_flow_edges
    SET
      label = ?,
      constancy = ?,
      share = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE contour_id = ? AND id = ?
  `),
  deleteCashFlow: db.prepare(`
    DELETE FROM cash_flow_edges
    WHERE contour_id = ? AND id = ?
  `),
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

export function listCashFlowNodes(contourId) {
  return statements.listCashFlowNodes.all(contourId).map(toCashFlowNode)
}

export function getCashFlowNode(contourId, nodeId) {
  const node = statements.getCashFlowNode.get(contourId, nodeId)
  return node ? toCashFlowNode(node) : null
}

export function createCashFlowNode({ contourId, name, type, positionX, positionY }) {
  const id = randomUUID()
  statements.createCashFlowNode.run(id, contourId, name, type, positionX, positionY)
  return getCashFlowNode(contourId, id)
}

export function updateCashFlowNode({ contourId, nodeId, name, type }) {
  const result = statements.updateCashFlowNode.run(name, type, contourId, nodeId)

  if (result.changes === 0) {
    return null
  }

  return getCashFlowNode(contourId, nodeId)
}

export function updateCashFlowNodePosition({ contourId, nodeId, positionX, positionY }) {
  const result = statements.updateCashFlowNodePosition.run(positionX, positionY, contourId, nodeId)

  if (result.changes === 0) {
    return null
  }

  return getCashFlowNode(contourId, nodeId)
}

export function deleteCashFlowNode(contourId, nodeId) {
  return statements.deleteCashFlowNode.run(contourId, nodeId).changes > 0
}

export function listCashFlows(contourId) {
  return statements.listCashFlows.all(contourId).map(toCashFlowEdge)
}

export function getCashFlow(contourId, flowId) {
  const flow = statements.getCashFlow.get(contourId, flowId)
  return flow ? toCashFlowEdge(flow) : null
}

export function createCashFlow({
  contourId,
  sourceNodeId,
  targetNodeId,
  label,
  constancy,
  share,
}) {
  const id = randomUUID()
  statements.createCashFlow.run(
    id,
    contourId,
    sourceNodeId,
    targetNodeId,
    label,
    constancy,
    share,
  )
  return getCashFlow(contourId, id)
}

export function updateCashFlow({ contourId, flowId, label, constancy, share }) {
  const result = statements.updateCashFlow.run(label, constancy, share, contourId, flowId)

  if (result.changes === 0) {
    return null
  }

  return getCashFlow(contourId, flowId)
}

export function deleteCashFlow(contourId, flowId) {
  return statements.deleteCashFlow.run(contourId, flowId).changes > 0
}
