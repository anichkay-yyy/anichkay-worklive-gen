<script setup>
import { computed, ref, watch } from 'vue'
import RuntimeFlowCanvas from '@/components/cash-flows/RuntimeFlowCanvas.vue'
import HunterBoard from '@/components/participant/HunterBoard.vue'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

const props = defineProps({
  flowId: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    required: true,
  },
})

const contour = ref(null)
const loading = ref(false)
const error = ref('')

const roleLabels = {
  hunter: 'Hunter',
  support: 'Support',
  worker: 'Worker',
  ultima: 'Ultima',
}

const roleLabel = computed(() => roleLabels[props.role] ?? props.role)

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

function contourTitle(item) {
  const label = String(item?.flowLabel ?? '').trim()

  if (label) {
    return label
  }

  if (item?.sourceName && item?.targetName) {
    return `${item.sourceName} -> ${item.targetName}`
  }

  return item?.contourName ?? `${roleLabel.value} board`
}

const boardTitle = computed(() => contourTitle(contour.value))

const boardMeta = computed(() => {
  const item = contour.value

  if (!item) {
    return ''
  }

  const parts = []

  if (item.contourName && item.contourName !== boardTitle.value) {
    parts.push(item.contourName)
  }

  if (item.sourceName && item.targetName && item.flowLabel) {
    parts.push(`${item.sourceName} -> ${item.targetName}`)
  }

  return parts.join(' · ')
})

async function loadContour() {
  loading.value = true
  error.value = ''
  contour.value = null

  try {
    const payload = await requestJson('/api/my-contours')
    contour.value = (payload.contours ?? []).find((candidate) => {
      return candidate.flowId === props.flowId && candidate.role === props.role
    }) ?? null

    if (!contour.value) {
      error.value = 'Контур не найден.'
    }
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    loading.value = false
  }
}

watch(() => [props.flowId, props.role], loadContour, { immediate: true })
</script>

<template>
  <section class="w-full space-y-4 py-4">
    <div v-if="loading" class="space-y-4">
      <div class="rounded-lg border bg-card p-4">
        <Skeleton class="mb-3 h-6 w-52" />
        <Skeleton class="h-4 w-72 max-w-full" />
      </div>
      <Skeleton class="h-[420px] w-full rounded-lg" />
    </div>

    <div
      v-else-if="error"
      class="rounded-md border bg-background px-4 py-3 text-sm text-foreground"
      role="alert"
    >
      {{ error }}
    </div>

    <template v-else>
      <div class="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div class="min-w-0">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <h1 class="min-w-0 truncate text-xl font-semibold leading-7">
              {{ boardTitle }}
            </h1>
            <Badge variant="outline">
              {{ roleLabel }}
            </Badge>
          </div>
          <p v-if="boardMeta" class="mt-1 truncate text-sm leading-5 text-muted-foreground">
            {{ boardMeta }}
          </p>
        </div>
      </div>

      <HunterBoard v-if="role === 'hunter'" :flow-id="flowId" />
      <RuntimeFlowCanvas v-else :flow-id="flowId" />
    </template>
  </section>
</template>
