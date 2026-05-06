import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.resolve(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })

const db = new Database(path.join(dataDir, 'app.sqlite'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const BUSINESS_FLOW_CONTOUR_PREFIX = '__business_flow__:'

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

  CREATE TABLE IF NOT EXISTS hunter_sources (
    id TEXT PRIMARY KEY,
    flow_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    company_info TEXT NOT NULL DEFAULT '',
    contact_info TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    company_name TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    industry TEXT NOT NULL DEFAULT '',
    company_size TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    contact_name TEXT NOT NULL DEFAULT '',
    contact_role TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    contact_phone TEXT NOT NULL DEFAULT '',
    contact_messenger TEXT NOT NULL DEFAULT '',
    source_channel TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    next_step TEXT NOT NULL DEFAULT '',
    next_contact_at TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (flow_id) REFERENCES cash_flow_edges(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS hunter_sources_user_id_index
    ON hunter_sources (user_id);

  CREATE INDEX IF NOT EXISTS hunter_sources_flow_id_index
    ON hunter_sources (flow_id);

  CREATE TABLE IF NOT EXISTS runtime_flow_nodes (
    id TEXT PRIMARY KEY,
    flow_id TEXT NOT NULL,
    hunter_source_id TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'source',
    position_x REAL NOT NULL DEFAULT 0,
    position_y REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (flow_id) REFERENCES cash_flow_edges(id) ON DELETE CASCADE,
    FOREIGN KEY (hunter_source_id) REFERENCES hunter_sources(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS runtime_flow_nodes_flow_id_index
    ON runtime_flow_nodes (flow_id);

  CREATE UNIQUE INDEX IF NOT EXISTS runtime_flow_nodes_hunter_source_id_unique
    ON runtime_flow_nodes (hunter_source_id)
    WHERE hunter_source_id IS NOT NULL;
`)

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()

  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
  }
}

ensureColumn('hunter_sources', 'company_name', "TEXT NOT NULL DEFAULT ''")
ensureColumn('hunter_sources', 'website', "TEXT NOT NULL DEFAULT ''")
ensureColumn('hunter_sources', 'industry', "TEXT NOT NULL DEFAULT ''")
ensureColumn('hunter_sources', 'company_size', "TEXT NOT NULL DEFAULT ''")
ensureColumn('hunter_sources', 'location', "TEXT NOT NULL DEFAULT ''")
ensureColumn('hunter_sources', 'contact_name', "TEXT NOT NULL DEFAULT ''")
ensureColumn('hunter_sources', 'contact_role', "TEXT NOT NULL DEFAULT ''")
ensureColumn('hunter_sources', 'contact_email', "TEXT NOT NULL DEFAULT ''")
ensureColumn('hunter_sources', 'contact_phone', "TEXT NOT NULL DEFAULT ''")
ensureColumn('hunter_sources', 'contact_messenger', "TEXT NOT NULL DEFAULT ''")
ensureColumn('hunter_sources', 'source_channel', "TEXT NOT NULL DEFAULT ''")
ensureColumn('hunter_sources', 'status', "TEXT NOT NULL DEFAULT 'new'")
ensureColumn('hunter_sources', 'next_step', "TEXT NOT NULL DEFAULT ''")
ensureColumn('hunter_sources', 'next_contact_at', "TEXT NOT NULL DEFAULT ''")
ensureColumn('hunter_sources', 'summary', "TEXT NOT NULL DEFAULT ''")

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

const toParticipantContour = (row) => ({
  id: `${row.flow_id}:${row.role}`,
  contourId: row.contour_id,
  contourName: row.contour_name,
  contourDescription: row.contour_description,
  contourCreatedAt: row.contour_created_at,
  contourUpdatedAt: row.contour_updated_at,
  flowId: row.flow_id,
  flowLabel: row.flow_label,
  sourceName: row.source_name,
  targetName: row.target_name,
  constancy: row.constancy,
  share: row.share,
  role: row.role,
  participantNodeId: row.participant_node_id,
  participantNames: row.participant_names ? row.participant_names.split(',') : [],
  participantCount: row.participant_count,
  createdAt: row.flow_created_at,
  updatedAt: row.flow_updated_at,
})

const toHunterSource = (row) => ({
  id: row.id,
  flowId: row.flow_id,
  userId: row.user_id,
  companyInfo: row.company_info,
  contactInfo: row.contact_info,
  description: row.description,
  companyName: row.company_name || row.company_info,
  website: row.website,
  industry: row.industry,
  companySize: row.company_size,
  location: row.location,
  contactName: row.contact_name || row.contact_info,
  contactRole: row.contact_role,
  contactEmail: row.contact_email,
  contactPhone: row.contact_phone,
  contactMessenger: row.contact_messenger,
  sourceChannel: row.source_channel,
  status: row.status,
  nextStep: row.next_step,
  nextContactAt: row.next_contact_at,
  summary: row.summary || row.description,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  contourId: row.contour_id ?? null,
  contourName: row.contour_name ?? null,
  flowLabel: row.flow_label ?? null,
  sourceName: row.source_name ?? null,
  targetName: row.target_name ?? null,
})

const toRuntimeFlowNode = (row) => ({
  id: row.id,
  flowId: row.flow_id,
  hunterSourceId: row.hunter_source_id,
  name: row.name,
  type: row.type,
  positionX: row.position_x,
  positionY: row.position_y,
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
  getCashFlowBoardContour: db.prepare(`
    SELECT
      c.id,
      c.name,
      c.description,
      c.created_at,
      c.updated_at,
      COUNT(DISTINCT n.id) + COUNT(DISTINCT e.id) AS cash_flow_records
    FROM contours c
    LEFT JOIN cash_flow_nodes n ON n.contour_id = c.id
    LEFT JOIN cash_flow_edges e ON e.contour_id = c.id
    WHERE c.name NOT LIKE '__business_flow__:%'
    GROUP BY c.id
    ORDER BY cash_flow_records DESC, c.id ASC
    LIMIT 1
  `),
  getContourByName: db.prepare(`
    SELECT id, name, description, created_at, updated_at
    FROM contours
    WHERE name = ?
    ORDER BY id ASC
    LIMIT 1
  `),
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
  listParticipantContoursForUser: db.prepare(`
    WITH assigned_business_nodes AS (
      SELECT
        n.id AS participant_node_id,
        n.name AS participant_name,
        n.type AS role,
        n.contour_id AS business_contour_id,
        substr(c.name, length(?) + 1) AS parent_flow_id
      FROM cash_flow_nodes n
      JOIN contours c ON c.id = n.contour_id
      WHERE substr(c.name, 1, length(?)) = ?
        AND lower(trim(n.name)) IN (?, ?, ?)
    )
    SELECT
      assigned.parent_flow_id,
      assigned.role,
      MIN(assigned.participant_node_id) AS participant_node_id,
      GROUP_CONCAT(DISTINCT assigned.participant_name) AS participant_names,
      COUNT(*) AS participant_count,
      parent_flow.id AS flow_id,
      parent_flow.contour_id AS contour_id,
      parent_flow.label AS flow_label,
      parent_flow.constancy AS constancy,
      parent_flow.share AS share,
      parent_flow.created_at AS flow_created_at,
      parent_flow.updated_at AS flow_updated_at,
      parent_contour.name AS contour_name,
      parent_contour.description AS contour_description,
      parent_contour.created_at AS contour_created_at,
      parent_contour.updated_at AS contour_updated_at,
      source_node.name AS source_name,
      target_node.name AS target_name
    FROM assigned_business_nodes assigned
    JOIN cash_flow_edges parent_flow ON parent_flow.id = assigned.parent_flow_id
    JOIN contours parent_contour ON parent_contour.id = parent_flow.contour_id
    LEFT JOIN cash_flow_nodes source_node
      ON source_node.contour_id = parent_flow.contour_id
      AND source_node.id = parent_flow.source_node_id
    LEFT JOIN cash_flow_nodes target_node
      ON target_node.contour_id = parent_flow.contour_id
      AND target_node.id = parent_flow.target_node_id
    GROUP BY
      assigned.parent_flow_id,
      assigned.role,
      parent_flow.id,
      parent_flow.contour_id,
      parent_flow.label,
      parent_flow.constancy,
      parent_flow.share,
      parent_flow.created_at,
      parent_flow.updated_at,
      parent_contour.name,
      parent_contour.description,
      parent_contour.created_at,
      parent_contour.updated_at,
      source_node.name,
      target_node.name
    ORDER BY parent_contour.name ASC, parent_flow.created_at ASC, assigned.role ASC
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
  listHunterSourcesForUser: db.prepare(`
    SELECT
      hunter_sources.id,
      hunter_sources.flow_id,
      hunter_sources.user_id,
      hunter_sources.company_info,
      hunter_sources.contact_info,
      hunter_sources.description,
      hunter_sources.company_name,
      hunter_sources.website,
      hunter_sources.industry,
      hunter_sources.company_size,
      hunter_sources.location,
      hunter_sources.contact_name,
      hunter_sources.contact_role,
      hunter_sources.contact_email,
      hunter_sources.contact_phone,
      hunter_sources.contact_messenger,
      hunter_sources.source_channel,
      hunter_sources.status,
      hunter_sources.next_step,
      hunter_sources.next_contact_at,
      hunter_sources.summary,
      hunter_sources.created_at,
      hunter_sources.updated_at,
      parent_flow.contour_id,
      parent_flow.label AS flow_label,
      parent_contour.name AS contour_name,
      source_node.name AS source_name,
      target_node.name AS target_name
    FROM hunter_sources
    JOIN cash_flow_edges parent_flow ON parent_flow.id = hunter_sources.flow_id
    JOIN contours parent_contour ON parent_contour.id = parent_flow.contour_id
    LEFT JOIN cash_flow_nodes source_node
      ON source_node.contour_id = parent_flow.contour_id
      AND source_node.id = parent_flow.source_node_id
    LEFT JOIN cash_flow_nodes target_node
      ON target_node.contour_id = parent_flow.contour_id
      AND target_node.id = parent_flow.target_node_id
    WHERE hunter_sources.user_id = ?
    ORDER BY hunter_sources.created_at DESC, hunter_sources.id DESC
  `),
  listHunterSourcesForUserByFlow: db.prepare(`
    SELECT
      hunter_sources.id,
      hunter_sources.flow_id,
      hunter_sources.user_id,
      hunter_sources.company_info,
      hunter_sources.contact_info,
      hunter_sources.description,
      hunter_sources.company_name,
      hunter_sources.website,
      hunter_sources.industry,
      hunter_sources.company_size,
      hunter_sources.location,
      hunter_sources.contact_name,
      hunter_sources.contact_role,
      hunter_sources.contact_email,
      hunter_sources.contact_phone,
      hunter_sources.contact_messenger,
      hunter_sources.source_channel,
      hunter_sources.status,
      hunter_sources.next_step,
      hunter_sources.next_contact_at,
      hunter_sources.summary,
      hunter_sources.created_at,
      hunter_sources.updated_at,
      parent_flow.contour_id,
      parent_flow.label AS flow_label,
      parent_contour.name AS contour_name,
      source_node.name AS source_name,
      target_node.name AS target_name
    FROM hunter_sources
    JOIN cash_flow_edges parent_flow ON parent_flow.id = hunter_sources.flow_id
    JOIN contours parent_contour ON parent_contour.id = parent_flow.contour_id
    LEFT JOIN cash_flow_nodes source_node
      ON source_node.contour_id = parent_flow.contour_id
      AND source_node.id = parent_flow.source_node_id
    LEFT JOIN cash_flow_nodes target_node
      ON target_node.contour_id = parent_flow.contour_id
      AND target_node.id = parent_flow.target_node_id
    WHERE hunter_sources.user_id = ? AND hunter_sources.flow_id = ?
    ORDER BY hunter_sources.created_at DESC, hunter_sources.id DESC
  `),
  getHunterSourceForUser: db.prepare(`
    SELECT
      hunter_sources.id,
      hunter_sources.flow_id,
      hunter_sources.user_id,
      hunter_sources.company_info,
      hunter_sources.contact_info,
      hunter_sources.description,
      hunter_sources.company_name,
      hunter_sources.website,
      hunter_sources.industry,
      hunter_sources.company_size,
      hunter_sources.location,
      hunter_sources.contact_name,
      hunter_sources.contact_role,
      hunter_sources.contact_email,
      hunter_sources.contact_phone,
      hunter_sources.contact_messenger,
      hunter_sources.source_channel,
      hunter_sources.status,
      hunter_sources.next_step,
      hunter_sources.next_contact_at,
      hunter_sources.summary,
      hunter_sources.created_at,
      hunter_sources.updated_at,
      parent_flow.contour_id,
      parent_flow.label AS flow_label,
      parent_contour.name AS contour_name,
      source_node.name AS source_name,
      target_node.name AS target_name
    FROM hunter_sources
    JOIN cash_flow_edges parent_flow ON parent_flow.id = hunter_sources.flow_id
    JOIN contours parent_contour ON parent_contour.id = parent_flow.contour_id
    LEFT JOIN cash_flow_nodes source_node
      ON source_node.contour_id = parent_flow.contour_id
      AND source_node.id = parent_flow.source_node_id
    LEFT JOIN cash_flow_nodes target_node
      ON target_node.contour_id = parent_flow.contour_id
      AND target_node.id = parent_flow.target_node_id
    WHERE hunter_sources.user_id = ? AND hunter_sources.id = ?
  `),
  createHunterSource: db.prepare(`
    INSERT INTO hunter_sources (
      id,
      flow_id,
      user_id,
      company_info,
      contact_info,
      description,
      company_name,
      website,
      industry,
      company_size,
      location,
      contact_name,
      contact_role,
      contact_email,
      contact_phone,
      contact_messenger,
      source_channel,
      status,
      next_step,
      next_contact_at,
      summary
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateHunterSource: db.prepare(`
    UPDATE hunter_sources
    SET
      company_info = ?,
      contact_info = ?,
      description = ?,
      company_name = ?,
      website = ?,
      industry = ?,
      company_size = ?,
      location = ?,
      contact_name = ?,
      contact_role = ?,
      contact_email = ?,
      contact_phone = ?,
      contact_messenger = ?,
      source_channel = ?,
      status = ?,
      next_step = ?,
      next_contact_at = ?,
      summary = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND id = ?
  `),
  deleteHunterSource: db.prepare(`
    DELETE FROM hunter_sources
    WHERE user_id = ? AND id = ?
  `),
  listRuntimeFlowNodes: db.prepare(`
    SELECT
      id,
      flow_id,
      hunter_source_id,
      name,
      type,
      position_x,
      position_y,
      created_at,
      updated_at
    FROM runtime_flow_nodes
    WHERE flow_id = ?
    ORDER BY created_at ASC, id ASC
  `),
  getRuntimeFlowNodeByHunterSource: db.prepare(`
    SELECT
      id,
      flow_id,
      hunter_source_id,
      name,
      type,
      position_x,
      position_y,
      created_at,
      updated_at
    FROM runtime_flow_nodes
    WHERE hunter_source_id = ?
  `),
  createRuntimeFlowNode: db.prepare(`
    INSERT INTO runtime_flow_nodes (
      id,
      flow_id,
      hunter_source_id,
      name,
      type,
      position_x,
      position_y
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  updateRuntimeFlowNodeByHunterSource: db.prepare(`
    UPDATE runtime_flow_nodes
    SET
      name = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE hunter_source_id = ?
  `),
  deleteRuntimeFlowNodeByHunterSource: db.prepare(`
    DELETE FROM runtime_flow_nodes
    WHERE hunter_source_id = ?
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

function userParticipantIdentityValues(user) {
  const displayName = user?.username || user?.email || ''
  const values = [
    user?.username,
    user?.email,
    displayName && user?.email ? `${displayName} · ${user.email}` : '',
  ]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)

  const uniqueValues = [...new Set(values)]

  while (uniqueValues.length < 3) {
    uniqueValues.push(`__no_participant_match_${uniqueValues.length}__`)
  }

  return uniqueValues.slice(0, 3)
}

export function listParticipantContoursForUser(user) {
  const identityValues = userParticipantIdentityValues(user)

  return statements.listParticipantContoursForUser
    .all(
      BUSINESS_FLOW_CONTOUR_PREFIX,
      BUSINESS_FLOW_CONTOUR_PREFIX,
      BUSINESS_FLOW_CONTOUR_PREFIX,
      ...identityValues,
    )
    .map(toParticipantContour)
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

export function getCashFlowBoardContour() {
  const contour = statements.getCashFlowBoardContour.get()

  if (contour) {
    return toContour(contour)
  }

  const result = statements.createContour.run('Cash-flows', '')
  return toContour(statements.getContour.get(result.lastInsertRowid))
}

export function getBusinessFlowBoardContour(flowId) {
  const name = `__business_flow__:${flowId}`
  const contour = statements.getContourByName.get(name)

  if (contour) {
    return toContour(contour)
  }

  const result = statements.createContour.run(name, '')
  return toContour(statements.getContour.get(result.lastInsertRowid))
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

export function listHunterSourcesForUser({ userId, flowId = null }) {
  const statement = flowId
    ? statements.listHunterSourcesForUserByFlow
    : statements.listHunterSourcesForUser
  const params = flowId ? [userId, flowId] : [userId]

  return statement.all(...params).map(toHunterSource)
}

export function getHunterSourceForUser(userId, sourceId) {
  const source = statements.getHunterSourceForUser.get(userId, sourceId)
  return source ? toHunterSource(source) : null
}

export function createHunterSource({
  flowId,
  userId,
  companyInfo,
  contactInfo,
  description,
  companyName,
  website,
  industry,
  companySize,
  location,
  contactName,
  contactRole,
  contactEmail,
  contactPhone,
  contactMessenger,
  sourceChannel,
  status,
  nextStep,
  nextContactAt,
  summary,
}) {
  const id = randomUUID()
  statements.createHunterSource.run(
    id,
    flowId,
    userId,
    companyInfo,
    contactInfo,
    description,
    companyName,
    website,
    industry,
    companySize,
    location,
    contactName,
    contactRole,
    contactEmail,
    contactPhone,
    contactMessenger,
    sourceChannel,
    status,
    nextStep,
    nextContactAt,
    summary,
  )

  return getHunterSourceForUser(userId, id)
}

export function updateHunterSource({
  userId,
  sourceId,
  companyInfo,
  contactInfo,
  description,
  companyName,
  website,
  industry,
  companySize,
  location,
  contactName,
  contactRole,
  contactEmail,
  contactPhone,
  contactMessenger,
  sourceChannel,
  status,
  nextStep,
  nextContactAt,
  summary,
}) {
  const result = statements.updateHunterSource.run(
    companyInfo,
    contactInfo,
    description,
    companyName,
    website,
    industry,
    companySize,
    location,
    contactName,
    contactRole,
    contactEmail,
    contactPhone,
    contactMessenger,
    sourceChannel,
    status,
    nextStep,
    nextContactAt,
    summary,
    userId,
    sourceId,
  )

  if (result.changes === 0) {
    return null
  }

  return getHunterSourceForUser(userId, sourceId)
}

export function deleteHunterSource(userId, sourceId) {
  return statements.deleteHunterSource.run(userId, sourceId).changes > 0
}

export function listRuntimeFlowNodes(flowId) {
  return statements.listRuntimeFlowNodes.all(flowId).map(toRuntimeFlowNode)
}

export function getRuntimeFlowNodeByHunterSource(hunterSourceId) {
  const node = statements.getRuntimeFlowNodeByHunterSource.get(hunterSourceId)
  return node ? toRuntimeFlowNode(node) : null
}

export function createRuntimeFlowNode({
  flowId,
  hunterSourceId = null,
  name,
  type,
  positionX,
  positionY,
}) {
  const id = randomUUID()
  statements.createRuntimeFlowNode.run(
    id,
    flowId,
    hunterSourceId,
    name,
    type,
    positionX,
    positionY,
  )

  const node = hunterSourceId
    ? statements.getRuntimeFlowNodeByHunterSource.get(hunterSourceId)
    : null

  return node ? toRuntimeFlowNode(node) : null
}

export function updateRuntimeFlowNodeByHunterSource({ hunterSourceId, name }) {
  const result = statements.updateRuntimeFlowNodeByHunterSource.run(name, hunterSourceId)

  if (result.changes === 0) {
    return null
  }

  return getRuntimeFlowNodeByHunterSource(hunterSourceId)
}

export function deleteRuntimeFlowNodeByHunterSource(hunterSourceId) {
  return statements.deleteRuntimeFlowNodeByHunterSource.run(hunterSourceId).changes > 0
}
