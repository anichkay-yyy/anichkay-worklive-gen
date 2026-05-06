<script setup>
import { onMounted, ref, watch } from 'vue'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { VueFlow } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'

const props = defineProps({
  flowId: {
    type: String,
    default: '',
  },
})

const runtimeNodes = ref([])
const runtimeEdges = ref([])
const loading = ref(false)
const error = ref('')

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

  return response.json()
}

function runtimeFlowSourceId(flow) {
  return String(flow.source ?? flow.sourceNodeId ?? flow.source_node_id ?? '')
}

function mapRuntimeNode(node, outgoingNodeIds) {
  const nodeType = node.type || 'source'
  const needsNextStep = nodeType === 'source' && !outgoingNodeIds.has(node.id)

  return {
    id: node.id,
    type: 'runtimeSource',
    position: {
      x: Number(node.positionX ?? 0),
      y: Number(node.positionY ?? 0),
    },
    data: {
      label: node.name || 'Source',
      nodeType,
      needsNextStep,
    },
    zIndex: needsNextStep ? 2 : 1,
  }
}

async function loadRuntimeFlow() {
  if (!props.flowId) {
    runtimeNodes.value = []
    runtimeEdges.value = []
    return
  }

  loading.value = true
  error.value = ''

  try {
    const payload = await requestJson(`/api/runtime-flows/${encodeURIComponent(props.flowId)}`)
    const flows = payload.flows ?? []
    const outgoingNodeIds = new Set(flows.map(runtimeFlowSourceId).filter(Boolean))

    runtimeNodes.value = (payload.nodes ?? []).map((node) => mapRuntimeNode(node, outgoingNodeIds))
    runtimeEdges.value = flows
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    loading.value = false
  }
}

onMounted(loadRuntimeFlow)
watch(() => props.flowId, loadRuntimeFlow)
</script>

<template>
  <section class="runtime-flow-canvas min-w-0">
    <div class="relative h-[420px] min-h-[320px] overflow-hidden rounded-lg border bg-background">
      <div
        v-if="loading"
        class="absolute inset-x-3 top-3 z-10 rounded-md border bg-background px-3 py-2 text-sm"
      >
        Загрузка runtime flow
      </div>
      <div
        v-else-if="error"
        class="absolute inset-x-3 top-3 z-10 rounded-md border bg-background px-3 py-2 text-sm"
        role="alert"
      >
        {{ error }}
      </div>
      <VueFlow
        v-model:nodes="runtimeNodes"
        v-model:edges="runtimeEdges"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :edges-updatable="false"
        :elements-selectable="false"
        :zoom-on-double-click="false"
        :fit-view-on-init="true"
        class="runtime-flow"
      >
        <Background variant="dots" :gap="20" :size="1" color="#d4d4d8" />
        <Controls />

        <template #node-runtimeSource="{ data }">
          <div class="runtime-source-card">
            <span
              v-if="data.needsNextStep"
              class="runtime-source-dot"
              aria-hidden="true"
            />

            <p class="max-w-48 truncate text-sm font-medium leading-5">
              {{ data.label }}
            </p>
            <p class="mt-1 text-xs leading-4 text-muted-foreground">
              {{ data.nodeType }}
            </p>
          </div>
        </template>
      </VueFlow>
    </div>
  </section>
</template>

<style scoped>
.runtime-flow-canvas :deep(.vue-flow__controls) {
  border: 1px solid hsl(0 0% 89.8%);
  border-radius: 6px;
  box-shadow: none;
}

.runtime-flow-canvas :deep(.vue-flow__controls-button) {
  border-bottom-color: hsl(0 0% 89.8%);
  background: white;
  color: #18181b;
}

.runtime-flow-canvas :deep(.vue-flow__controls-button:hover) {
  background: #f4f4f5;
}

.runtime-flow {
  width: 100%;
  height: 100%;
}

.runtime-source-card {
  position: relative;
  min-width: 144px;
  border: 2px solid #18181b;
  border-radius: 6px;
  background: white;
  color: #18181b;
  padding: 12px 16px;
  text-align: center;
}

.runtime-source-dot {
  position: absolute;
  right: 8px;
  top: 8px;
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: #eab308;
  box-shadow: 0 0 0 0 rgb(234 179 8 / 0.45);
  animation: runtime-source-dot-pulse 1.2s ease-in-out infinite;
}

@keyframes runtime-source-dot-pulse {
  0%,
  100% {
    opacity: 1;
    box-shadow: 0 0 0 0 rgb(234 179 8 / 0.45);
  }

  50% {
    opacity: 0.55;
    box-shadow: 0 0 0 6px rgb(234 179 8 / 0);
  }
}
</style>
