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
    default: '/api/cash-flows',
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
const flowNodes = ref([])
const flowEdges = ref([])
const nodeDialogOpen = ref(false)
const nodeDialogMode = ref('create')
const editingNodeId = ref(null)
const nodeSubmitting = ref(false)
const nodeDeleting = ref(false)
const flowDialogOpen = ref(false)
const flowDialogMode = ref('create')
const editingFlowId = ref(null)
const flowSubmitting = ref(false)
const flowDeleting = ref(false)
const pendingConnection = ref(null)
const apiBasePath = computed(() => props.apiBasePath.replace(/\/$/, ''))

const nodeForm = reactive({
  name: '',
  type: 'source',
})

const flowForm = reactive({
  label: '',
  constancy: 50,
  share: 100,
})

const nodeTypeLabels = {
  source: 'Source',
  consumer: 'Consumer',
  middleware: 'Middleware',
}

const nodeTypeClasses = {
  source: 'border-foreground bg-background',
  consumer: 'border-border bg-muted',
  middleware: 'border-foreground/60 bg-card shadow-sm',
}

const defaultEdgeOptions = {
  type: 'smoothstep',
  markerEnd: MarkerType.ArrowClosed,
  interactionWidth: 18,
}

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
    type: 'cashNode',
    position: {
      x: node.positionX,
      y: node.positionY,
    },
    data: {
      label: node.name,
      nodeType: node.type,
    },
  }
}

function mapFlow(flow) {
  const constancy = Number(flow.constancy ?? 50)
  const share = Number(flow.share ?? 100)
  const strokeWidth = 1 + (share / 100) * 3
  const opacity = 0.45 + (constancy / 100) * 0.55
  const label = flow.label ? `${flow.label} · c:${constancy}% s:${share}%` : `c:${constancy}% s:${share}%`

  return {
    id: flow.id,
    source: flow.sourceNodeId,
    target: flow.targetNodeId,
    type: 'smoothstep',
    label,
    animated: constancy > 0,
    markerEnd: MarkerType.ArrowClosed,
    interactionWidth: 18,
    style: {
      stroke: '#18181b',
      strokeWidth,
      opacity,
    },
    labelStyle: {
      fill: '#18181b',
      fontSize: 12,
      fontWeight: 500,
    },
    labelBgStyle: {
      fill: '#ffffff',
      stroke: '#e4e4e7',
      strokeWidth: 1,
    },
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 4,
    data: {
      label: flow.label,
      constancy,
      share,
    },
  }
}

function nodeClass(type) {
  return nodeTypeClasses[type] || nodeTypeClasses.source
}

async function loadCashFlows() {
  loading.value = true
  error.value = ''

  try {
    const payload = await requestJson(apiBasePath.value)
    flowNodes.value = payload.nodes.map(mapNode)
    flowEdges.value = payload.flows.map(mapFlow)

    if (flowNodes.value.length > 0) {
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
  nodeForm.name = node?.data?.label ?? ''
  nodeForm.type = node?.data?.nodeType ?? 'source'
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
  if (!props.canEdit || !nodeForm.name.trim() || nodeSubmitting.value) {
    return
  }

  nodeSubmitting.value = true
  error.value = ''

  try {
    if (nodeDialogMode.value === 'create') {
      const position = boardCenterPosition()
      const payload = await requestJson(`${apiBasePath.value}/nodes`, {
        method: 'POST',
        body: JSON.stringify({
          name: nodeForm.name,
          type: nodeForm.type,
          positionX: position.x,
          positionY: position.y,
        }),
      })

      flowNodes.value = [...flowNodes.value, mapNode(payload.node)]
    } else if (editingNodeId.value) {
      const payload = await requestJson(
        `${apiBasePath.value}/nodes/${editingNodeId.value}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: nodeForm.name,
            type: nodeForm.type,
          }),
        },
      )

      flowNodes.value = flowNodes.value.map((node) =>
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
    await requestJson(`${apiBasePath.value}/nodes/${nodeId}`, {
      method: 'DELETE',
    })
    flowNodes.value = flowNodes.value.filter((node) => node.id !== nodeId)
    flowEdges.value = flowEdges.value.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
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
    await requestJson(
      `${apiBasePath.value}/nodes/${event.node.id}/position`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          positionX: event.node.position.x,
          positionY: event.node.position.y,
        }),
      },
    )
  } catch (requestError) {
    error.value = requestError.message
  }
}

function resetFlowForm(edge) {
  flowForm.label = edge?.data?.label ?? ''
  flowForm.constancy = edge?.data?.constancy ?? 50
  flowForm.share = edge?.data?.share ?? 100
}

function openCreateFlowDialog(connection) {
  if (!props.canEdit || !connection.source || !connection.target) {
    return
  }

  pendingConnection.value = connection
  editingFlowId.value = null
  flowDialogMode.value = 'create'
  resetFlowForm()
  error.value = ''
  flowDialogOpen.value = true
}

function openEditFlowDialog(event) {
  if (!props.canEdit) {
    return
  }

  editingFlowId.value = event.edge.id
  pendingConnection.value = null
  flowDialogMode.value = 'edit'
  resetFlowForm(event.edge)
  error.value = ''
  flowDialogOpen.value = true
}

function handleFlowDialogOpen(open) {
  flowDialogOpen.value = open

  if (!open) {
    pendingConnection.value = null
  }
}

async function submitFlow() {
  if (!props.canEdit || flowSubmitting.value) {
    return
  }

  flowSubmitting.value = true
  error.value = ''

  try {
    if (flowDialogMode.value === 'create' && pendingConnection.value) {
      const payload = await requestJson(`${apiBasePath.value}/flows`, {
        method: 'POST',
        body: JSON.stringify({
          sourceNodeId: pendingConnection.value.source,
          targetNodeId: pendingConnection.value.target,
          label: flowForm.label,
          constancy: flowForm.constancy,
          share: flowForm.share,
        }),
      })

      flowEdges.value = [...flowEdges.value, mapFlow(payload.flow)]
    } else if (editingFlowId.value) {
      const payload = await requestJson(
        `${apiBasePath.value}/flows/${editingFlowId.value}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            label: flowForm.label,
            constancy: flowForm.constancy,
            share: flowForm.share,
          }),
        },
      )

      flowEdges.value = flowEdges.value.map((edge) =>
        edge.id === payload.flow.id ? mapFlow(payload.flow) : edge,
      )
    }

    pendingConnection.value = null
    flowDialogOpen.value = false
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    flowSubmitting.value = false
  }
}

async function deleteFlow() {
  if (!props.canEdit || !editingFlowId.value || flowDeleting.value) {
    return
  }

  flowDeleting.value = true
  error.value = ''

  try {
    const flowId = editingFlowId.value
    await requestJson(`${apiBasePath.value}/flows/${flowId}`, {
      method: 'DELETE',
    })
    flowEdges.value = flowEdges.value.filter((edge) => edge.id !== flowId)
    flowDialogOpen.value = false
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    flowDeleting.value = false
  }
}

watch(apiBasePath, loadCashFlows, { immediate: true })
</script>

<template>
  <section class="cash-flow-editor min-w-0 space-y-4">
    <div
      v-if="error"
      class="rounded-md border bg-background px-4 py-3 text-sm text-foreground"
      role="alert"
    >
      {{ error }}
    </div>

    <div
      ref="boardRef"
      class="relative h-[calc(100svh-148px)] min-h-[560px] overflow-hidden rounded-lg border bg-background"
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
        v-model:nodes="flowNodes"
        v-model:edges="flowEdges"
        :default-edge-options="defaultEdgeOptions"
        :nodes-draggable="canEdit"
        :nodes-connectable="canEdit"
        :edges-updatable="false"
        :zoom-on-double-click="false"
        :fit-view-on-init="true"
        class="cash-flow-canvas"
        @connect="openCreateFlowDialog"
        @node-double-click="openEditNodeDialog"
        @edge-double-click="openEditFlowDialog"
        @node-drag-stop="saveNodePosition"
      >
        <Background variant="dots" :gap="20" :size="1" color="#d4d4d8" />
        <Controls />

        <template #node-cashNode="{ data }">
          <div
            class="relative min-w-36 cursor-grab rounded-md border-2 px-4 py-3 text-center active:cursor-grabbing"
            :class="nodeClass(data.nodeType)"
          >
            <Handle
              v-if="data.nodeType === 'consumer' || data.nodeType === 'middleware'"
              type="target"
              :position="Position.Left"
              class="cash-flow-handle"
            />

            <p class="max-w-48 truncate text-sm font-medium leading-5">
              {{ data.label }}
            </p>
            <p class="mt-1 text-xs leading-4 text-muted-foreground">
              {{ nodeTypeLabels[data.nodeType] || data.nodeType }}
            </p>

            <Handle
              v-if="data.nodeType === 'source' || data.nodeType === 'middleware'"
              type="source"
              :position="Position.Right"
              class="cash-flow-handle"
            />
          </div>
        </template>
      </VueFlow>
    </div>

    <Dialog v-model:open="nodeDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ nodeDialogMode === 'create' ? 'Новый узел' : 'Узел' }}</DialogTitle>
          <DialogDescription>Название и тип</DialogDescription>
        </DialogHeader>

        <form class="space-y-5" @submit.prevent="submitNode">
          <div class="space-y-2">
            <Label for="cash-node-name">Название</Label>
            <Input
              id="cash-node-name"
              v-model="nodeForm.name"
              maxlength="120"
              autocomplete="off"
            />
          </div>

          <div class="space-y-2">
            <Label for="cash-node-type">Тип</Label>
            <select
              id="cash-node-type"
              v-model="nodeForm.type"
              class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="source">Source</option>
              <option value="consumer">Consumer</option>
              <option value="middleware">Middleware</option>
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
            <Button type="submit" :disabled="!nodeForm.name.trim() || nodeSubmitting">
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog :open="flowDialogOpen" @update:open="handleFlowDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ flowDialogMode === 'create' ? 'Новая связь' : 'Связь' }}</DialogTitle>
          <DialogDescription>Параметры потока</DialogDescription>
        </DialogHeader>

        <form class="space-y-5" @submit.prevent="submitFlow">
          <div class="space-y-2">
            <Label for="cash-flow-label">Название</Label>
            <Input
              id="cash-flow-label"
              v-model="flowForm.label"
              maxlength="120"
              autocomplete="off"
            />
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between gap-3">
              <Label for="cash-flow-constancy">Constancy</Label>
              <span class="text-sm text-muted-foreground">{{ flowForm.constancy }}%</span>
            </div>
            <Input
              id="cash-flow-constancy"
              v-model.number="flowForm.constancy"
              type="range"
              min="0"
              max="100"
              step="1"
            />
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between gap-3">
              <Label for="cash-flow-share">Share</Label>
              <span class="text-sm text-muted-foreground">{{ flowForm.share }}%</span>
            </div>
            <Input
              id="cash-flow-share"
              v-model.number="flowForm.share"
              type="range"
              min="0"
              max="100"
              step="1"
            />
          </div>

          <DialogFooter class="gap-2">
            <Button
              v-if="flowDialogMode === 'edit'"
              type="button"
              variant="outline"
              :disabled="flowDeleting"
              @click="deleteFlow"
            >
              <Trash2 class="size-4" />
              Удалить
            </Button>
            <Button type="submit" :disabled="flowSubmitting">
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>
</template>

<style scoped>
.cash-flow-editor :deep(.vue-flow__controls) {
  border: 1px solid hsl(0 0% 89.8%);
  border-radius: 6px;
  box-shadow: none;
}

.cash-flow-editor :deep(.vue-flow__controls-button) {
  border-bottom-color: hsl(0 0% 89.8%);
  background: white;
  color: #18181b;
}

.cash-flow-editor :deep(.vue-flow__controls-button:hover) {
  background: #f4f4f5;
}

.cash-flow-editor :deep(.cash-flow-handle) {
  width: 10px;
  height: 10px;
  border: 2px solid white;
  background: #18181b;
}

.cash-flow-editor :deep(.vue-flow__edge.animated path) {
  stroke-dasharray: 8 4;
}

.cash-flow-canvas {
  width: 100%;
  height: 100%;
}
</style>
