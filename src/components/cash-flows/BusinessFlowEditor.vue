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
const nodeDialogOpen = ref(false)
const nodeDialogMode = ref('create')
const editingNodeId = ref(null)
const nodeSubmitting = ref(false)
const nodeDeleting = ref(false)

const nodeForm = reactive({
  name: '',
  type: 'hunter',
})

const typeOrder = {
  hunter: 0,
  support: 1,
  worker: 2,
}

const typeLabels = {
  hunter: 'Hunter',
  support: 'Support',
  worker: 'Worker',
}

const typeClasses = {
  hunter: 'border-foreground bg-background',
  support: 'border-border bg-muted',
  worker: 'border-foreground/60 bg-card shadow-sm',
}

const sortedNodes = computed(() => {
  return [...businessNodes.value].sort((a, b) => {
    const typeDiff = (typeOrder[a.data.nodeType] ?? 99) - (typeOrder[b.data.nodeType] ?? 99)

    if (typeDiff !== 0) {
      return typeDiff
    }

    return a.position.x - b.position.x || a.position.y - b.position.y || a.id.localeCompare(b.id)
  })
})

const businessEdges = computed(() => {
  return sortedNodes.value.slice(0, -1).map((node, index) => {
    const target = sortedNodes.value[index + 1]

    return {
      id: `business-${node.id}-${target.id}`,
      source: node.id,
      target: target.id,
      type: 'smoothstep',
      animated: true,
      markerEnd: MarkerType.ArrowClosed,
      interactionWidth: 0,
      selectable: false,
      style: {
        stroke: '#18181b',
        strokeWidth: 2,
        opacity: 0.95,
      },
    }
  })
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

function nodeClass(type) {
  return typeClasses[type] || typeClasses.hunter
}

async function loadBusinessFlow() {
  loading.value = true
  error.value = ''

  try {
    const payload = await requestJson(props.apiBasePath)
    businessNodes.value = payload.nodes.map(mapNode)

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
  nodeForm.name = node?.data?.label ?? ''
  nodeForm.type = node?.data?.nodeType ?? 'hunter'
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
        :edges="businessEdges"
        :nodes-draggable="canEdit"
        :nodes-connectable="false"
        :edges-updatable="false"
        :elements-selectable="false"
        :zoom-on-double-click="false"
        :fit-view-on-init="true"
        class="business-flow-canvas"
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
              :connectable="false"
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
              :connectable="false"
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
          <DialogDescription>Название и тип</DialogDescription>
        </DialogHeader>

        <form class="space-y-5" @submit.prevent="submitNode">
          <div class="space-y-2">
            <Label for="business-node-name">Название</Label>
            <Input
              id="business-node-name"
              v-model="nodeForm.name"
              maxlength="120"
              autocomplete="off"
            />
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
  pointer-events: none;
}

.business-flow-canvas {
  width: 100%;
  height: 100%;
}
</style>
