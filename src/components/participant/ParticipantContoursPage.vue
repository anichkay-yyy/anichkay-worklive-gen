<script setup>
import { onMounted, ref } from 'vue'
import { ArrowRight } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

const emit = defineEmits(['open-board'])

const contours = ref([])
const loading = ref(false)
const error = ref('')

const roleLabels = {
  hunter: 'Hunter',
  support: 'Support',
  worker: 'Worker',
  ultima: 'Ultima',
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

  return response.json()
}

function roleLabel(role) {
  return roleLabels[role] ?? role
}

function contourTitle(contour) {
  const label = String(contour.flowLabel ?? '').trim()

  if (label) {
    return label
  }

  if (contour.sourceName && contour.targetName) {
    return `${contour.sourceName} -> ${contour.targetName}`
  }

  return contour.contourName
}

function contourMeta(contour) {
  const parts = []

  if (contour.contourName && contour.contourName !== contourTitle(contour)) {
    parts.push(contour.contourName)
  }

  if (contour.sourceName && contour.targetName && contour.flowLabel) {
    parts.push(`${contour.sourceName} -> ${contour.targetName}`)
  }

  if (contour.contourDescription) {
    parts.push(contour.contourDescription)
  }

  return parts.join(' · ')
}

async function loadContours() {
  loading.value = true
  error.value = ''

  try {
    const payload = await requestJson('/api/my-contours')
    contours.value = payload.contours ?? []
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    loading.value = false
  }
}

onMounted(loadContours)
</script>

<template>
  <section class="mx-auto w-full max-w-5xl py-4">
    <div class="mb-4 flex items-center justify-between gap-3 border-b pb-4">
      <h1 class="text-xl font-semibold leading-7">Контуры</h1>
    </div>

    <div v-if="loading" class="grid gap-3">
      <div v-for="index in 3" :key="index" class="rounded-lg border bg-card p-4">
        <Skeleton class="mb-3 h-5 w-48" />
        <Skeleton class="h-4 w-72 max-w-full" />
      </div>
    </div>

    <div
      v-else-if="error"
      class="rounded-md border bg-background px-4 py-3 text-sm text-foreground"
      role="alert"
    >
      {{ error }}
    </div>

    <div
      v-else-if="contours.length === 0"
      class="rounded-lg border bg-card px-4 py-8 text-sm text-muted-foreground"
    >
      Контуров нет
    </div>

    <div v-else class="grid gap-3">
      <button
        v-for="contour in contours"
        :key="contour.id"
        type="button"
        class="group flex w-full items-center gap-4 rounded-lg border bg-card p-4 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="`Открыть ${roleLabel(contour.role)} board`"
        @click="emit('open-board', contour)"
      >
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <h2 class="min-w-0 truncate text-base font-semibold leading-6">
              {{ contourTitle(contour) }}
            </h2>
            <Badge variant="outline">
              {{ roleLabel(contour.role) }}
            </Badge>
          </div>
          <p
            v-if="contourMeta(contour)"
            class="mt-1 truncate text-sm leading-5 text-muted-foreground"
          >
            {{ contourMeta(contour) }}
          </p>
        </div>

        <ArrowRight class="size-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
      </button>
    </div>
  </section>
</template>
