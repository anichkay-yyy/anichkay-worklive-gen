<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { Handle, MarkerType, Position, VueFlow, useVueFlow } from '@vue-flow/core'
import { Plus, Trash2 } from 'lucide-vue-next'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

const props = defineProps({
  apiBasePath: {
    type: String,
    required: true,
  },
  canEdit: {
    type: Boolean,
    default: false,
  },
})

const { fitView, getViewport } = useVueFlow()

const boardRef = ref(null)
const loading = ref(false)
const error = ref('')
const businessNodes = ref([])
const businessEdges = ref([])
const members = ref([])
const nodeDialogOpen = ref(false)
const nodeDialogMode = ref('create')
const editingNodeId = ref(null)
const nodeSubmitting = ref(false)
const nodeDeleting = ref(false)
const edgeDialogOpen = ref(false)
const selectedEdge = ref(null)
const edgeDeleting = ref(false)
const selectedMember = ref(null)
const userSearch = ref('')
const inviting = ref(false)
const inviteError = ref('')

const nodeForm = reactive({
  name: '',
  type: 'hunter',
})

const inviteForm = reactive({
  username: '',
  email: '',
})

const typeLabels = {
  hunter: 'Hunter',
  support: 'Support',
  worker: 'Worker',
  ultima: 'Ultima',
}

const typeClasses = {
  hunter: 'border-foreground bg-background',
  support: 'border-border bg-muted',
  worker: 'border-foreground/60 bg-card shadow-sm',
  ultima: 'border-foreground bg-muted',
}

const filteredMembers = computed(() => {
  const query = userSearch.value.trim().toLowerCase()

  if (!query) {
    return members.value
  }

  return members.value.filter((member) => {
    return (
      member.username.toLowerCase().includes(query) ||
      member.email.toLowerCase().includes(query) ||
      normalizedMemberLabel(member).includes(query)
    )
  })
})

const canSubmitNode = computed(
  () => props.canEdit && nodeForm.name.trim().length > 0 && !nodeSubmitting.value,
)
const canInvite = computed(() => {
  return (
    props.canEdit &&
    inviteForm.username.trim().length > 0 &&
    inviteForm.email.trim().length > 0 &&
    !inviting.value
  )
})

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    let message = 'Ошибка запроса.'

    try {
      const payload = await response.json()
      message = payload.message || message
    } catch {
      // Keep fallback for empty API responses.
    }

    throw new Error(message)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

function mapNode(node) {
  return {
    id: node.id,
    type: 'businessNode',
    position: {
      x: node.positionX,
      y: node.positionY,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      label: node.name,
      nodeType: node.type,
    },
  }
}

function mapFlow(flow) {
  return {
    id: flow.id,
    source: flow.sourceNodeId,
    target: flow.targetNodeId,
    type: 'smoothstep',
    animated: true,
    markerEnd: MarkerType.ArrowClosed,
    interactionWidth: 18,
    style: {
      stroke: '#18181b',
      strokeWidth: 2,
      opacity: 0.95,
    },
  }
}

function nodeClass(type) {
  return typeClasses[type] || typeClasses.hunter
}

async function loadBusinessFlow() {
  loading.value = true
  error.value = ''

  try {
    const payload = await requestJson(props.apiBasePath)
    businessNodes.value = payload.nodes.map(mapNode)
    businessEdges.value = (payload.flows ?? []).map(mapFlow)
    members.value = payload.members ?? []

    if (businessNodes.value.length > 0) {
      await nextTick()
      await fitView({ padding: 0.2 })
    }
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    loading.value = false
  }
}

function boardCenterPosition() {
  const viewport = getViewport()
  const bounds = boardRef.value?.getBoundingClientRect()
  const width = bounds?.width || window.innerWidth
  const height = bounds?.height || window.innerHeight

  return {
    x: (-viewport.x + width / 2) / viewport.zoom,
    y: (-viewport.y + height / 2) / viewport.zoom,
  }
}

function resetNodeForm(node) {
  const member = findMember(node?.data?.label ?? '')

  selectedMember.value = member
  nodeForm.name = member?.username ?? node?.data?.label ?? ''
  nodeForm.type = node?.data?.nodeType ?? 'hunter'
  userSearch.value = member ? memberLabel(member) : nodeForm.name
  inviteForm.username = ''
  inviteForm.email = ''
  inviteError.value = ''
}

function memberLabel(member) {
  return `${member.username} · ${member.email}`
}

function normalizedMemberLabel(member) {
  return memberLabel(member).toLowerCase()
}

function findMember(value) {
  const normalized = String(value ?? '').trim().toLowerCase()

  if (!normalized) {
    return null
  }

  return members.value.find((member) => {
    return (
      member.username.toLowerCase() === normalized ||
      member.email.toLowerCase() === normalized ||
      normalizedMemberLabel(member) === normalized
    )
  }) ?? null
}

function selectMember(member) {
  selectedMember.value = member
  nodeForm.name = member.username || member.email
  userSearch.value = memberLabel(member)
  inviteForm.username = ''
  inviteForm.email = ''
  inviteError.value = ''
}

function prepareInvite() {
  const query = userSearch.value.trim()
  const member = findMember(query)

  if (member) {
    selectMember(member)
    return
  }

  if (selectedMember.value) {
    return
  }

  if (!inviteForm.username) {
    inviteForm.username = query.includes('@') ? query.split('@')[0] : query
  }

  if (!inviteForm.email && query.includes('@')) {
    inviteForm.email = query
  }
}

function handleUserSearchInput() {
  const member = findMember(userSearch.value)

  if (member) {
    selectMember(member)
    return
  }

  selectedMember.value = null
  nodeForm.name = ''
  inviteForm.username = ''
  inviteForm.email = ''
  prepareInvite()
}

async function createInvite() {
  if (!canInvite.value) {
    return
  }

  inviting.value = true
  inviteError.value = ''

  try {
    const payload = await requestJson(`${props.apiBasePath}/invites`, {
      method: 'POST',
      body: JSON.stringify({
        username: inviteForm.username,
        email: inviteForm.email,
      }),
    })

    members.value = [
      payload.member,
      ...members.value.filter((member) => member.userId !== payload.member.userId),
    ]
    selectMember(payload.member)
  } catch (requestError) {
    inviteError.value = requestError.message
  } finally {
    inviting.value = false
  }
}

function openCreateNodeDialog() {
  if (!props.canEdit) {
    return
  }

  editingNodeId.value = null
  nodeDialogMode.value = 'create'
  resetNodeForm()
  error.value = ''
  nodeDialogOpen.value = true
}

function openEditNodeDialog(event) {
  if (!props.canEdit) {
    return
  }

  editingNodeId.value = event.node.id
  nodeDialogMode.value = 'edit'
  resetNodeForm(event.node)
  error.value = ''
  nodeDialogOpen.value = true
}

async function submitNode() {
  if (!canSubmitNode.value) {
    return
  }

  nodeSubmitting.value = true
  error.value = ''

  try {
    if (nodeDialogMode.value === 'create') {
      const position = boardCenterPosition()
      const payload = await requestJson(`${props.apiBasePath}/nodes`, {
        method: 'POST',
        body: JSON.stringify({
          name: nodeForm.name,
          type: nodeForm.type,
          positionX: position.x,
          positionY: position.y,
        }),
      })

      businessNodes.value = [...businessNodes.value, mapNode(payload.node)]
    } else if (editingNodeId.value) {
      const payload = await requestJson(`${props.apiBasePath}/nodes/${editingNodeId.value}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: nodeForm.name,
          type: nodeForm.type,
        }),
      })

      businessNodes.value = businessNodes.value.map((node) =>
        node.id === payload.node.id ? mapNode(payload.node) : node,
      )
    }

    nodeDialogOpen.value = false
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    nodeSubmitting.value = false
  }
}

async function deleteNode() {
  if (!props.canEdit || !editingNodeId.value || nodeDeleting.value) {
    return
  }

  nodeDeleting.value = true
  error.value = ''

  try {
    const nodeId = editingNodeId.value
    await requestJson(`${props.apiBasePath}/nodes/${nodeId}`, {
      method: 'DELETE',
    })
    businessNodes.value = businessNodes.value.filter((node) => node.id !== nodeId)
    businessEdges.value = businessEdges.value.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId,
    )
    nodeDialogOpen.value = false
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    nodeDeleting.value = false
  }
}

async function saveNodePosition(event) {
  if (!props.canEdit) {
    return
  }

  try {
    await requestJson(`${props.apiBasePath}/nodes/${event.node.id}/position`, {
      method: 'PATCH',
      body: JSON.stringify({
        positionX: event.node.position.x,
        positionY: event.node.position.y,
      }),
    })
  } catch (requestError) {
    error.value = requestError.message
  }
}

async function createBusinessEdge(connection) {
  if (!props.canEdit || !connection.source || !connection.target || connection.source === connection.target) {
    return
  }

  error.value = ''

  try {
    const payload = await requestJson(`${props.apiBasePath}/flows`, {
      method: 'POST',
      body: JSON.stringify({
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
      }),
    })
    businessEdges.value = [
      ...businessEdges.value.filter((edge) => edge.id !== payload.flow.id),
      mapFlow(payload.flow),
    ]
  } catch (requestError) {
    error.value = requestError.message
  }
}

function openDeleteEdgeDialog(event) {
  if (!props.canEdit) {
    return
  }

  selectedEdge.value = event.edge
  edgeDialogOpen.value = true
}

async function deleteSelectedEdge() {
  if (!props.canEdit || !selectedEdge.value || edgeDeleting.value) {
    return
  }

  edgeDeleting.value = true
  error.value = ''

  try {
    const edgeId = selectedEdge.value.id
    await requestJson(`${props.apiBasePath}/flows/${edgeId}`, {
      method: 'DELETE',
    })
    businessEdges.value = businessEdges.value.filter((edge) => edge.id !== edgeId)
    selectedEdge.value = null
    edgeDialogOpen.value = false
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    edgeDeleting.value = false
  }
}

watch(() => props.apiBasePath, loadBusinessFlow, { immediate: true })
</script>

<template>
  <section class="business-flow-editor min-w-0 space-y-3">
    <div
      v-if="error"
      class="rounded-md border bg-background px-4 py-3 text-sm text-foreground"
      role="alert"
    >
      {{ error }}
    </div>

    <div
      ref="boardRef"
      class="relative h-[520px] min-h-[420px] overflow-hidden rounded-lg border bg-background"
    >
      <div class="absolute left-3 top-3 z-10 flex gap-2">
        <Button
          v-if="canEdit"
          type="button"
          size="icon"
          title="Добавить узел"
          aria-label="Добавить узел"
          @click="openCreateNodeDialog"
        >
          <Plus class="size-4" />
        </Button>
      </div>

      <div v-if="loading" class="absolute inset-0 z-20 bg-background/80 p-4">
        <div class="h-full rounded-md border bg-card p-4">
          <Skeleton class="mb-3 h-8 w-28" />
          <Skeleton class="h-full min-h-72 w-full" />
        </div>
      </div>

      <VueFlow
        v-model:nodes="businessNodes"
        v-model:edges="businessEdges"
        :nodes-draggable="canEdit"
        :nodes-connectable="canEdit"
        :edges-updatable="false"
        :elements-selectable="canEdit"
        :zoom-on-double-click="false"
        :fit-view-on-init="true"
        class="business-flow-canvas"
        @connect="createBusinessEdge"
        @edge-click="openDeleteEdgeDialog"
        @node-double-click="openEditNodeDialog"
        @node-drag-stop="saveNodePosition"
      >
        <Background variant="dots" :gap="20" :size="1" color="#d4d4d8" />
        <Controls />

        <template #node-businessNode="{ data }">
          <div
            class="relative min-w-36 cursor-grab rounded-md border-2 px-4 py-3 text-center active:cursor-grabbing"
            :class="nodeClass(data.nodeType)"
          >
            <Handle
              type="target"
              :position="Position.Left"
              :connectable="canEdit"
              class="business-flow-handle"
            />

            <p class="max-w-48 truncate text-sm font-medium leading-5">
              {{ data.label }}
            </p>
            <p class="mt-1 text-xs leading-4 text-muted-foreground">
              {{ typeLabels[data.nodeType] || data.nodeType }}
            </p>

            <Handle
              type="source"
              :position="Position.Right"
              :connectable="canEdit"
              class="business-flow-handle"
            />
          </div>
        </template>
      </VueFlow>
    </div>

    <Dialog v-model:open="nodeDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ nodeDialogMode === 'create' ? 'Новый узел' : 'Узел' }}</DialogTitle>
          <DialogDescription>Пользователь и тип</DialogDescription>
        </DialogHeader>

        <form class="space-y-5" @submit.prevent="submitNode">
          <div class="space-y-2">
            <Label for="business-node-user">Пользователь</Label>
            <Input
              id="business-node-user"
              v-model="userSearch"
              maxlength="120"
              autocomplete="off"
              placeholder="Username или email"
              @input="handleUserSearchInput"
              @focus="prepareInvite"
            />

            <div
              v-if="!selectedMember && filteredMembers.length > 0"
              class="max-h-40 overflow-auto rounded-md border bg-background"
            >
              <button
                v-for="member in filteredMembers"
                :key="`business-member-${member.contourId}-${member.userId}`"
                type="button"
                class="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted"
                @click="selectMember(member)"
              >
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium">{{ member.username }}</span>
                  <span class="block truncate text-xs text-muted-foreground">{{ member.email }}</span>
                </span>
                <span class="shrink-0 text-xs text-muted-foreground">{{ member.status }}</span>
              </button>
            </div>

            <div
              v-if="!selectedMember && filteredMembers.length === 0"
              class="space-y-3 rounded-md border bg-background p-3"
            >
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="space-y-2">
                  <Label for="business-invite-username">Username</Label>
                  <Input
                    id="business-invite-username"
                    v-model="inviteForm.username"
                    autocomplete="off"
                    @focus="prepareInvite"
                  />
                </div>

                <div class="space-y-2">
                  <Label for="business-invite-email">Email</Label>
                  <Input
                    id="business-invite-email"
                    v-model="inviteForm.email"
                    type="email"
                    autocomplete="off"
                    @focus="prepareInvite"
                  />
                </div>
              </div>

              <div
                v-if="inviteError"
                class="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                role="alert"
              >
                {{ inviteError }}
              </div>

              <Button
                type="button"
                variant="outline"
                class="w-full"
                :disabled="!canInvite"
                @click="createInvite"
              >
                Создать invite
              </Button>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="business-node-type">Тип</Label>
            <select
              id="business-node-type"
              v-model="nodeForm.type"
              class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="hunter">Hunter</option>
              <option value="support">Support</option>
              <option value="worker">Worker</option>
              <option value="ultima">Ultima</option>
            </select>
          </div>

          <DialogFooter class="gap-2">
            <Button
              v-if="nodeDialogMode === 'edit'"
              type="button"
              variant="outline"
              :disabled="nodeDeleting"
              @click="deleteNode"
            >
              <Trash2 class="size-4" />
              Удалить
            </Button>
            <Button type="submit" :disabled="!canSubmitNode">
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="edgeDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Связь</DialogTitle>
          <DialogDescription>Удаление связи между узлами</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            :disabled="edgeDeleting"
            @click="deleteSelectedEdge"
          >
            <Trash2 class="size-4" />
            Удалить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>

<style scoped>
.business-flow-editor :deep(.vue-flow__controls) {
  border: 1px solid hsl(0 0% 89.8%);
  border-radius: 6px;
  box-shadow: none;
}

.business-flow-editor :deep(.vue-flow__controls-button) {
  border-bottom-color: hsl(0 0% 89.8%);
  background: white;
  color: #18181b;
}

.business-flow-editor :deep(.vue-flow__controls-button:hover) {
  background: #f4f4f5;
}

.business-flow-editor :deep(.business-flow-handle) {
  width: 10px;
  height: 10px;
  border: 2px solid white;
  background: #18181b;
}

.business-flow-editor :deep(.vue-flow__edge.animated path) {
  animation-duration: 0.8s;
  stroke-dasharray: 8 4;
}

.business-flow-editor :deep(.vue-flow__edge) {
  cursor: pointer;
}

.business-flow-canvas {
  width: 100%;
  height: 100%;
}
</style>
