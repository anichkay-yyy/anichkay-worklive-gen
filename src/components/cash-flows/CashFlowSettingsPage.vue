<script setup>
import { computed, reactive, ref, watch } from 'vue'
import BusinessFlowEditor from '@/components/cash-flows/BusinessFlowEditor.vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

const props = defineProps({
  flowId: {
    type: String,
    required: true,
  },
  apiBasePath: {
    type: String,
    default: '/api/cash-flows',
  },
  canEdit: {
    type: Boolean,
    default: false,
  },
})

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const flowLabel = ref('')
const form = reactive({
  constancy: 50,
  share: 100,
})
const businessFlowApiBasePath = computed(() => `${props.apiBasePath}/flows/${props.flowId}/business-flow`)

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

async function loadFlow() {
  loading.value = true
  error.value = ''

  try {
    const payload = await requestJson(props.apiBasePath)
    const flow = payload.flows.find((candidate) => candidate.id === props.flowId)

    if (!flow) {
      error.value = 'Связь не найдена.'
      return
    }

    flowLabel.value = flow.label ?? ''
    form.constancy = Number(flow.constancy ?? 50)
    form.share = Number(flow.share ?? 100)
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    loading.value = false
  }
}

async function saveFlowSettings() {
  if (!props.canEdit || saving.value || error.value) {
    return
  }

  saving.value = true

  try {
    const payload = await requestJson(`${props.apiBasePath}/flows/${props.flowId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        label: flowLabel.value,
        constancy: form.constancy,
        share: form.share,
      }),
    })

    form.constancy = Number(payload.flow.constancy ?? form.constancy)
    form.share = Number(payload.flow.share ?? form.share)
    error.value = ''
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    saving.value = false
  }
}

watch(() => props.flowId, loadFlow, { immediate: true })
</script>

<template>
  <section class="w-full space-y-5 py-4">
    <div v-if="loading" class="space-y-5 rounded-lg border bg-card p-6">
      <Skeleton class="h-5 w-32" />
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
    </div>

    <div
      v-else-if="error"
      class="rounded-md border bg-background px-4 py-3 text-sm text-foreground"
      role="alert"
    >
      {{ error }}
    </div>

    <template v-else>
      <div class="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2">
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-3">
            <Label for="flow-page-constancy">Constancy</Label>
            <span class="text-sm text-muted-foreground">{{ form.constancy }}%</span>
          </div>
          <Input
            id="flow-page-constancy"
            v-model.number="form.constancy"
            type="range"
            min="0"
            max="100"
            step="1"
            :disabled="!canEdit || saving"
            @change="saveFlowSettings"
          />
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between gap-3">
            <Label for="flow-page-share">Share</Label>
            <span class="text-sm text-muted-foreground">{{ form.share }}%</span>
          </div>
          <Input
            id="flow-page-share"
            v-model.number="form.share"
            type="range"
            min="0"
            max="100"
            step="1"
            :disabled="!canEdit || saving"
            @change="saveFlowSettings"
          />
        </div>
      </div>

      <div class="space-y-3">
        <h2 class="text-lg font-semibold leading-7">Business flow</h2>
        <BusinessFlowEditor
          :api-base-path="businessFlowApiBasePath"
          :can-edit="canEdit"
        />
      </div>
    </template>
  </section>
</template>
