<script setup>
import { onMounted, ref } from 'vue'
import { RefreshCw, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const contours = ref([])
const loading = ref(true)
const deletingId = ref(null)
const error = ref('')

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
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
      // Keep the fallback message when API returned no JSON body.
    }

    throw new Error(message)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

async function loadContours() {
  loading.value = true
  error.value = ''

  try {
    const payload = await requestJson('/api/contours')
    contours.value = payload.contours
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    loading.value = false
  }
}

async function removeContour(id) {
  deletingId.value = id
  error.value = ''

  try {
    await requestJson(`/api/contours/${id}`, { method: 'DELETE' })
    contours.value = contours.value.filter((contour) => contour.id !== id)
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    deletingId.value = null
  }
}

onMounted(loadContours)
</script>

<template>
  <main class="min-h-svh bg-background text-foreground">
    <div class="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header class="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div class="space-y-2">
          <h1 class="text-3xl font-semibold leading-tight sm:text-4xl">Контуры</h1>
          <p class="max-w-2xl text-sm leading-6 text-muted-foreground">
            Список сущностей с названием и описанием.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          class="w-full sm:w-auto"
          :disabled="loading"
          title="Обновить"
          @click="loadContours"
        >
          <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
          Обновить
        </Button>
      </header>

      <div class="flex-1 py-6">
        <section class="min-w-0">
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 class="text-xl font-semibold leading-tight">Список</h2>
              <p class="text-sm text-muted-foreground">Всего: {{ contours.length }}</p>
            </div>
          </div>

          <div
            v-if="error"
            class="mb-4 rounded-md border bg-background px-4 py-3 text-sm text-foreground"
            role="alert"
          >
            {{ error }}
          </div>

          <div v-if="loading" class="grid gap-3 md:grid-cols-2">
            <div v-for="index in 4" :key="index" class="rounded-lg border bg-card p-5">
              <Skeleton class="mb-4 h-5 w-2/3" />
              <Skeleton class="mb-2 h-4 w-full" />
              <Skeleton class="h-4 w-4/5" />
            </div>
          </div>

          <div
            v-else-if="contours.length === 0"
            class="flex min-h-72 items-center justify-center rounded-lg border border-dashed bg-card p-8 text-center"
          >
            <div class="max-w-sm space-y-2">
              <h3 class="text-lg font-medium">Пока нет контуров</h3>
              <p class="text-sm leading-6 text-muted-foreground">
                В базе еще нет записей.
              </p>
            </div>
          </div>

          <div v-else class="grid gap-3 md:grid-cols-2">
            <Card v-for="contour in contours" :key="contour.id">
              <CardHeader class="gap-3">
                <div class="min-w-0">
                  <CardTitle class="truncate">{{ contour.name }}</CardTitle>
                  <CardDescription>#{{ contour.id }}</CardDescription>
                </div>
                <CardAction>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    :disabled="deletingId === contour.id"
                    title="Удалить"
                    :aria-label="`Удалить контур ${contour.name}`"
                    @click="removeContour(contour.id)"
                  >
                    <Trash2 class="size-4" />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <p class="whitespace-pre-line text-sm leading-6 text-muted-foreground">
                  {{ contour.description || 'Описание не заполнено.' }}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>
