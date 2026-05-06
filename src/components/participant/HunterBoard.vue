<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

const props = defineProps({
  flowId: {
    type: String,
    required: true,
  },
})

const sources = ref([])
const loading = ref(false)
const submitting = ref(false)
const deletingId = ref('')
const error = ref('')
const dialogOpen = ref(false)
const dialogMode = ref('create')
const selectedSourceId = ref('')

const form = reactive({
  companyInfo: '',
  contactInfo: '',
  description: '',
})

const canSubmit = computed(() => (
  (form.companyInfo.trim() || form.contactInfo.trim() || form.description.trim()) &&
  !submitting.value
))

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

function sourceTitle(source) {
  const firstCompanyLine = source.companyInfo.split('\n').find((line) => line.trim())

  if (firstCompanyLine) {
    return firstCompanyLine
  }

  const firstContactLine = source.contactInfo.split('\n').find((line) => line.trim())
  return firstContactLine || 'Сорс'
}

function resetForm() {
  form.companyInfo = ''
  form.contactInfo = ''
  form.description = ''
  selectedSourceId.value = ''
  error.value = ''
}

function openCreateDialog() {
  dialogMode.value = 'create'
  resetForm()
  dialogOpen.value = true
}

function openEditDialog(source) {
  dialogMode.value = 'edit'
  selectedSourceId.value = source.id
  form.companyInfo = source.companyInfo
  form.contactInfo = source.contactInfo
  form.description = source.description
  error.value = ''
  dialogOpen.value = true
}

function handleDialogOpen(value) {
  dialogOpen.value = value

  if (!value) {
    resetForm()
  }
}

async function loadSources() {
  loading.value = true
  error.value = ''

  try {
    const payload = await requestJson(`/api/hunter/sources?flowId=${encodeURIComponent(props.flowId)}`)
    sources.value = payload.sources ?? []
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    loading.value = false
  }
}

async function submitSource() {
  if (!canSubmit.value) {
    return
  }

  submitting.value = true
  error.value = ''

  try {
    const body = JSON.stringify({
      flowId: props.flowId,
      companyInfo: form.companyInfo,
      contactInfo: form.contactInfo,
      description: form.description,
    })
    const payload = dialogMode.value === 'edit'
      ? await requestJson(`/api/hunter/sources/${encodeURIComponent(selectedSourceId.value)}`, {
        method: 'PATCH',
        body,
      })
      : await requestJson('/api/hunter/sources', {
        method: 'POST',
        body,
      })

    const source = payload.source
    sources.value = [
      source,
      ...sources.value.filter((candidate) => candidate.id !== source.id),
    ]
    dialogOpen.value = false
    resetForm()
    await loadSources()
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    submitting.value = false
  }
}

async function deleteSource(source) {
  if (deletingId.value) {
    return
  }

  deletingId.value = source.id
  error.value = ''

  try {
    await requestJson(`/api/hunter/sources/${encodeURIComponent(source.id)}`, {
      method: 'DELETE',
    })
    sources.value = sources.value.filter((candidate) => candidate.id !== source.id)
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    deletingId.value = ''
  }
}

onMounted(loadSources)
watch(() => props.flowId, loadSources)
</script>

<template>
  <section class="space-y-4">
    <div class="flex justify-end">
      <Button type="button" size="sm" @click="openCreateDialog">
        <Plus class="size-4" />
        Добавить сорс
      </Button>
    </div>

    <div v-if="loading" class="grid gap-3 lg:grid-cols-2">
      <div v-for="index in 4" :key="index" class="rounded-lg border bg-card p-4">
        <Skeleton class="mb-3 h-5 w-48" />
        <Skeleton class="mb-2 h-4 w-full" />
        <Skeleton class="h-4 w-2/3" />
      </div>
    </div>

    <div
      v-else-if="error && sources.length === 0"
      class="rounded-md border bg-background px-4 py-3 text-sm text-foreground"
      role="alert"
    >
      {{ error }}
    </div>

    <div
      v-else-if="sources.length === 0"
      class="rounded-lg border bg-card px-4 py-8 text-sm text-muted-foreground"
    >
      Хантов нет
    </div>

    <div v-else class="grid gap-3 lg:grid-cols-2">
      <article
        v-for="source in sources"
        :key="source.id"
        class="min-w-0 rounded-lg border bg-card p-4"
      >
        <div class="mb-3 flex min-w-0 items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <h2 class="truncate text-base font-semibold leading-6">
                {{ sourceTitle(source) }}
              </h2>
            </div>
          </div>

          <div class="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Редактировать"
              aria-label="Редактировать"
              @click="openEditDialog(source)"
            >
              <Pencil class="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Удалить"
              aria-label="Удалить"
              :disabled="deletingId === source.id"
              @click="deleteSource(source)"
            >
              <Trash2 class="size-4" />
            </Button>
          </div>
        </div>

        <div class="space-y-3 text-sm leading-5">
          <section v-if="source.companyInfo" class="space-y-1">
            <h3 class="font-medium">Компания</h3>
            <p class="whitespace-pre-wrap text-muted-foreground">{{ source.companyInfo }}</p>
          </section>

          <section v-if="source.contactInfo" class="space-y-1">
            <h3 class="font-medium">Контактное лицо</h3>
            <p class="whitespace-pre-wrap text-muted-foreground">{{ source.contactInfo }}</p>
          </section>

          <section v-if="source.description" class="space-y-1">
            <h3 class="font-medium">Описание</h3>
            <p class="whitespace-pre-wrap text-muted-foreground">{{ source.description }}</p>
          </section>
        </div>
      </article>
    </div>

    <div
      v-if="error && sources.length > 0"
      class="rounded-md border bg-background px-4 py-3 text-sm text-foreground"
      role="alert"
    >
      {{ error }}
    </div>

    <Dialog :open="dialogOpen" @update:open="handleDialogOpen">
      <DialogContent class="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{{ dialogMode === 'create' ? 'Новый сорс' : 'Сорс' }}</DialogTitle>
          <DialogDescription>Компания, контактное лицо и описание</DialogDescription>
        </DialogHeader>

        <form class="space-y-5" @submit.prevent="submitSource">
          <div class="space-y-2">
            <Label for="hunter-company-info">Компания инфа</Label>
            <Textarea
              id="hunter-company-info"
              v-model="form.companyInfo"
              class="min-h-24"
              maxlength="2000"
            />
          </div>

          <div class="space-y-2">
            <Label for="hunter-contact-info">Контактное лицо инфа</Label>
            <Textarea
              id="hunter-contact-info"
              v-model="form.contactInfo"
              class="min-h-24"
              maxlength="2000"
            />
          </div>

          <div class="space-y-2">
            <Label for="hunter-description">Описание</Label>
            <Textarea
              id="hunter-description"
              v-model="form.description"
              class="min-h-28"
              maxlength="4000"
            />
          </div>

          <DialogFooter class="gap-2">
            <Button type="button" variant="outline" @click="handleDialogOpen(false)">
              Закрыть
            </Button>
            <Button type="submit" :disabled="!canSubmit">
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>
</template>
