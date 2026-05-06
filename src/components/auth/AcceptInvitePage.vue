<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { acceptInvite, getInvite } from '@/lib/auth'

const props = defineProps({
  token: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['accepted'])

const inviteUser = ref(null)
const loading = ref(true)
const submitting = ref(false)
const error = ref('')

const form = reactive({
  password: '',
  passwordRepeat: '',
})

const canAccept = computed(() => (
  form.password.length >= 8 &&
  form.password === form.passwordRepeat &&
  !submitting.value
))

async function loadInvite() {
  loading.value = true
  error.value = ''

  try {
    const payload = await getInvite(props.token)
    inviteUser.value = payload.user
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    loading.value = false
  }
}

async function submitAccept() {
  if (!canAccept.value) {
    return
  }

  submitting.value = true
  error.value = ''

  try {
    const user = await acceptInvite({
      token: props.token,
      password: form.password,
    })
    emit('accepted', user)
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    submitting.value = false
  }
}

onMounted(loadInvite)
</script>

<template>
  <main class="min-h-svh bg-background text-foreground">
    <div class="mx-auto flex min-h-svh w-full max-w-md items-center px-4 py-6 sm:px-6">
      <div v-if="loading" class="w-full rounded-lg border bg-card p-6">
        <Skeleton class="mb-4 h-6 w-40" />
        <Skeleton class="mb-2 h-10 w-full" />
        <Skeleton class="h-10 w-full" />
      </div>

      <Card v-else class="w-full">
        <CardHeader>
          <CardTitle>Invite</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            v-if="error && !inviteUser"
            class="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
            role="alert"
          >
            {{ error }}
          </div>

          <form v-else-if="inviteUser" class="space-y-5" @submit.prevent="submitAccept">
            <div class="rounded-md border bg-background px-3 py-2 text-sm">
              <p class="font-medium leading-5">
                {{ inviteUser.username || inviteUser.email }}
              </p>
              <p class="truncate leading-5 text-muted-foreground">
                {{ inviteUser.email }}
              </p>
            </div>

            <div class="space-y-2">
              <Label for="invite-password">Пароль</Label>
              <Input
                id="invite-password"
                v-model="form.password"
                type="password"
                autocomplete="new-password"
              />
            </div>

            <div class="space-y-2">
              <Label for="invite-password-repeat">Повторить пароль</Label>
              <Input
                id="invite-password-repeat"
                v-model="form.passwordRepeat"
                type="password"
                autocomplete="new-password"
              />
            </div>

            <div
              v-if="error"
              class="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
              role="alert"
            >
              {{ error }}
            </div>

            <Button type="submit" class="w-full" :disabled="!canAccept">
              Принять invite
            </Button>
          </form>

          <div v-else class="space-y-3">
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  </main>
</template>
