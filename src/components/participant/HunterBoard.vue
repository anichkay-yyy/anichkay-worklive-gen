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
import { Input } from '@/components/ui/input'
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

const emptyForm = () => ({
  companyName: '',
  website: '',
  industry: '',
  companySize: '',
  location: '',
  contactName: '',
  contactRole: '',
  contactEmail: '',
  contactPhone: '',
  contactMessenger: '',
  sourceChannel: '',
  status: 'new',
  nextStep: '',
  nextContactAt: '',
  summary: '',
})

const form = reactive(emptyForm())

const statusOptions = [
  { value: 'new', label: 'Новый' },
  { value: 'contacted', label: 'Связались' },
  { value: 'qualified', label: 'Есть интерес' },
  { value: 'paused', label: 'На паузе' },
  { value: 'rejected', label: 'Не подходит' },
]

const canSubmit = computed(() => (
  [
    form.companyName,
    form.website,
    form.industry,
    form.companySize,
    form.location,
    form.contactName,
    form.contactRole,
    form.contactEmail,
    form.contactPhone,
    form.contactMessenger,
    form.sourceChannel,
    form.nextStep,
    form.nextContactAt,
    form.summary,
  ].some((value) => value.trim()) && !submitting.value
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

function statusLabel(status) {
  return statusOptions.find((option) => option.value === status)?.label ?? status
}

function sourceTitle(source) {
  return source.companyName || source.contactName || 'Источник'
}

function filledRows(rows) {
  return rows.filter((row) => String(row.value ?? '').trim())
}

function companyRows(source) {
  return filledRows([
    { label: 'Компания', value: source.companyName },
    { label: 'Сайт', value: source.website },
    { label: 'Отрасль', value: source.industry },
    { label: 'Размер', value: source.companySize },
    { label: 'Локация', value: source.location },
  ])
}

function contactRows(source) {
  return filledRows([
    { label: 'Контактное лицо', value: source.contactName },
    { label: 'Должность', value: source.contactRole },
    { label: 'Email', value: source.contactEmail },
    { label: 'Телефон', value: source.contactPhone },
    { label: 'Telegram / LinkedIn', value: source.contactMessenger },
  ])
}

function workRows(source) {
  return filledRows([
    { label: 'Как нашли', value: source.sourceChannel },
    { label: 'Статус', value: statusLabel(source.status) },
    { label: 'Следующий шаг', value: source.nextStep },
    { label: 'Дата следующего контакта', value: source.nextContactAt },
  ])
}

function resetForm() {
  Object.assign(form, emptyForm())
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
  Object.assign(form, {
    companyName: source.companyName ?? '',
    website: source.website ?? '',
    industry: source.industry ?? '',
    companySize: source.companySize ?? '',
    location: source.location ?? '',
    contactName: source.contactName ?? '',
    contactRole: source.contactRole ?? '',
    contactEmail: source.contactEmail ?? '',
    contactPhone: source.contactPhone ?? '',
    contactMessenger: source.contactMessenger ?? '',
    sourceChannel: source.sourceChannel ?? '',
    status: source.status ?? 'new',
    nextStep: source.nextStep ?? '',
    nextContactAt: source.nextContactAt ?? '',
    summary: source.summary ?? '',
  })
  error.value = ''
  dialogOpen.value = true
}

function handleDialogOpen(value) {
  dialogOpen.value = value

  if (!value) {
    resetForm()
  }
}

function sourcePayload() {
  return {
    flowId: props.flowId,
    companyName: form.companyName,
    website: form.website,
    industry: form.industry,
    companySize: form.companySize,
    location: form.location,
    contactName: form.contactName,
    contactRole: form.contactRole,
    contactEmail: form.contactEmail,
    contactPhone: form.contactPhone,
    contactMessenger: form.contactMessenger,
    sourceChannel: form.sourceChannel,
    status: form.status,
    nextStep: form.nextStep,
    nextContactAt: form.nextContactAt,
    summary: form.summary,
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
    const body = JSON.stringify(sourcePayload())
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
        Добавить источник
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
      В этом контуре пока нет добавленных источников.
    </div>

    <div v-else class="grid gap-3 lg:grid-cols-2">
      <article
        v-for="source in sources"
        :key="source.id"
        class="min-w-0 rounded-lg border bg-card p-4"
      >
        <div class="mb-4 flex min-w-0 items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="truncate text-base font-semibold leading-6">
              {{ sourceTitle(source) }}
            </h2>
            <p v-if="source.summary" class="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
              {{ source.summary }}
            </p>
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

        <div class="grid gap-4 text-sm leading-5 md:grid-cols-2">
          <section v-if="companyRows(source).length" class="space-y-2">
            <h3 class="font-medium">Компания</h3>
            <dl class="space-y-1 text-muted-foreground">
              <div v-for="row in companyRows(source)" :key="row.label" class="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
                <dt class="text-foreground">{{ row.label }}</dt>
                <dd class="min-w-0 break-words">{{ row.value }}</dd>
              </div>
            </dl>
          </section>

          <section v-if="contactRows(source).length" class="space-y-2">
            <h3 class="font-medium">Контакт</h3>
            <dl class="space-y-1 text-muted-foreground">
              <div v-for="row in contactRows(source)" :key="row.label" class="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
                <dt class="text-foreground">{{ row.label }}</dt>
                <dd class="min-w-0 break-words">{{ row.value }}</dd>
              </div>
            </dl>
          </section>

          <section v-if="workRows(source).length" class="space-y-2 md:col-span-2">
            <h3 class="font-medium">Работа с источником</h3>
            <dl class="grid gap-1 text-muted-foreground md:grid-cols-2">
              <div v-for="row in workRows(source)" :key="row.label" class="grid grid-cols-[150px_minmax(0,1fr)] gap-2">
                <dt class="text-foreground">{{ row.label }}</dt>
                <dd class="min-w-0 break-words">{{ row.value }}</dd>
              </div>
            </dl>
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
      <DialogContent class="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ dialogMode === 'create' ? 'Новый источник' : 'Источник' }}</DialogTitle>
          <DialogDescription>Заполните данные компании, контактного лица и следующий шаг</DialogDescription>
        </DialogHeader>

        <form class="space-y-6" @submit.prevent="submitSource">
          <section class="space-y-3">
            <h3 class="text-sm font-medium">Компания</h3>
            <div class="grid gap-3 md:grid-cols-2">
              <div class="space-y-2">
                <Label for="hunter-company-name">Название компании</Label>
                <Input id="hunter-company-name" v-model="form.companyName" maxlength="160" />
              </div>

              <div class="space-y-2">
                <Label for="hunter-website">Сайт</Label>
                <Input id="hunter-website" v-model="form.website" maxlength="240" />
              </div>

              <div class="space-y-2">
                <Label for="hunter-industry">Отрасль</Label>
                <Input id="hunter-industry" v-model="form.industry" maxlength="160" />
              </div>

              <div class="space-y-2">
                <Label for="hunter-company-size">Размер компании</Label>
                <Input id="hunter-company-size" v-model="form.companySize" maxlength="80" />
              </div>

              <div class="space-y-2 md:col-span-2">
                <Label for="hunter-location">Город или страна</Label>
                <Input id="hunter-location" v-model="form.location" maxlength="160" />
              </div>
            </div>
          </section>

          <section class="space-y-3">
            <h3 class="text-sm font-medium">Контактное лицо</h3>
            <div class="grid gap-3 md:grid-cols-2">
              <div class="space-y-2">
                <Label for="hunter-contact-name">Имя</Label>
                <Input id="hunter-contact-name" v-model="form.contactName" maxlength="160" />
              </div>

              <div class="space-y-2">
                <Label for="hunter-contact-role">Должность</Label>
                <Input id="hunter-contact-role" v-model="form.contactRole" maxlength="160" />
              </div>

              <div class="space-y-2">
                <Label for="hunter-contact-email">Email</Label>
                <Input id="hunter-contact-email" v-model="form.contactEmail" type="email" maxlength="240" />
              </div>

              <div class="space-y-2">
                <Label for="hunter-contact-phone">Телефон</Label>
                <Input id="hunter-contact-phone" v-model="form.contactPhone" maxlength="80" />
              </div>

              <div class="space-y-2 md:col-span-2">
                <Label for="hunter-contact-messenger">Telegram / LinkedIn</Label>
                <Input id="hunter-contact-messenger" v-model="form.contactMessenger" maxlength="160" />
              </div>
            </div>
          </section>

          <section class="space-y-3">
            <h3 class="text-sm font-medium">Работа с источником</h3>
            <div class="grid gap-3 md:grid-cols-2">
              <div class="space-y-2">
                <Label for="hunter-source-channel">Как нашли</Label>
                <Input id="hunter-source-channel" v-model="form.sourceChannel" maxlength="160" />
              </div>

              <div class="space-y-2">
                <Label for="hunter-status">Статус</Label>
                <select
                  id="hunter-status"
                  v-model="form.status"
                  class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option
                    v-for="option in statusOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </div>

              <div class="space-y-2">
                <Label for="hunter-next-step">Следующий шаг</Label>
                <Input id="hunter-next-step" v-model="form.nextStep" maxlength="240" />
              </div>

              <div class="space-y-2">
                <Label for="hunter-next-contact-at">Дата следующего контакта</Label>
                <Input id="hunter-next-contact-at" v-model="form.nextContactAt" type="date" />
              </div>

              <div class="space-y-2 md:col-span-2">
                <Label for="hunter-summary">Краткое описание запроса</Label>
                <Textarea id="hunter-summary" v-model="form.summary" class="min-h-20" maxlength="1000" />
              </div>
            </div>
          </section>

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
