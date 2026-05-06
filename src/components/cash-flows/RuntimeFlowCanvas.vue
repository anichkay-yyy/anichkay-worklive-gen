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

function mapRuntimeNode(node) {
  return {
    id: node.id,
    position: {
      x: Number(node.positionX ?? 0),
      y: Number(node.positionY ?? 0),
    },
    data: {
      label: node.name,
    },
    class: 'runtime-source-node',
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
    runtimeNodes.value = (payload.nodes ?? []).map(mapRuntimeNode)
    runtimeEdges.value = payload.flows ?? []
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

.runtime-flow-canvas :deep(.runtime-source-node) {
  border: 1px solid #18181b;
  border-radius: 6px;
  background: white;
  color: #18181b;
  font-weight: 500;
}
</style>
