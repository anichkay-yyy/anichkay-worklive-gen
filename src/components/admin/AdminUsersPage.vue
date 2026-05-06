<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Check, Copy, UserPlus } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
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
import {
  createAdminInviteLink,
  inviteAdminUser,
  listAdminUsers,
} from '@/lib/auth'

const users = ref([])
const loading = ref(false)
const inviteOpen = ref(false)
const submitting = ref(false)
const error = ref('')
const inviteError = ref('')
const lastInviteLink = ref('')
const copiedKey = ref('')
const linkLoadingUserId = ref(null)

const inviteForm = reactive({
  username: '',
  email: '',
})

const canInvite = computed(() => (
  inviteForm.username.trim().length > 0 &&
  inviteForm.email.trim().length > 0 &&
  !submitting.value
))

const statusLabels = {
  active: 'active',
  invited: 'invited',
}

function statusLabel(status) {
  return statusLabels[status] ?? status
}

function userName(user) {
  return user.username || user.email
}

function resetInviteForm() {
  inviteForm.username = ''
  inviteForm.email = ''
  inviteError.value = ''
  lastInviteLink.value = ''
}

function replaceUser(nextUser) {
  users.value = [
    nextUser,
    ...users.value.filter((user) => user.id !== nextUser.id),
  ].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'invited' ? -1 : 1
    }

    return String(userName(left)).localeCompare(String(userName(right)))
  })
}

async function copyText(text, key) {
  if (!text) {
    return
  }

  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }

  copiedKey.value = key
  window.setTimeout(() => {
    if (copiedKey.value === key) {
      copiedKey.value = ''
    }
  }, 1600)
}

async function loadUsers() {
  loading.value = true
  error.value = ''

  try {
    users.value = await listAdminUsers()
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    loading.value = false
  }
}

async function submitInvite() {
  if (!canInvite.value) {
    return
  }

  submitting.value = true
  inviteError.value = ''
  lastInviteLink.value = ''

  try {
    const payload = await inviteAdminUser({
      username: inviteForm.username,
      email: inviteForm.email,
    })
    replaceUser(payload.user)

    if (payload.inviteLink) {
      lastInviteLink.value = payload.inviteLink
      await copyText(payload.inviteLink, 'last-invite')
    } else {
      inviteOpen.value = false
      resetInviteForm()
    }
  } catch (requestError) {
    inviteError.value = requestError.message
  } finally {
    submitting.value = false
  }
}

async function copyInviteLink(user) {
  if (user.status !== 'invited' || linkLoadingUserId.value) {
    return
  }

  linkLoadingUserId.value = user.id
  error.value = ''

  try {
    const payload = await createAdminInviteLink(user.id)
    replaceUser(payload.user)
    await copyText(payload.inviteLink, `user-${user.id}`)
  } catch (requestError) {
    error.value = requestError.message
  } finally {
    linkLoadingUserId.value = null
  }
}

function closeInvite() {
  inviteOpen.value = false
  resetInviteForm()
}

function handleInviteOpen(value) {
  if (value) {
    inviteOpen.value = true
    return
  }

  closeInvite()
}

onMounted(loadUsers)
</script>

<template>
  <section class="mx-auto w-full max-w-5xl py-4">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <h1 class="text-xl font-semibold leading-7">Юзеры</h1>
      <Button type="button" size="sm" @click="inviteOpen = true">
        <UserPlus class="size-4" />
        Пригласить
      </Button>
    </div>

    <div v-if="loading" class="grid gap-3">
      <div v-for="index in 4" :key="index" class="rounded-lg border bg-card p-4">
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
      v-else-if="users.length === 0"
      class="rounded-lg border bg-card px-4 py-8 text-sm text-muted-foreground"
    >
      Юзеров нет
    </div>

    <div v-else class="grid gap-3">
      <div
        v-for="user in users"
        :key="user.id"
        class="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="min-w-0">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <h2 class="truncate text-base font-semibold leading-6">
              {{ userName(user) }}
            </h2>
            <Badge variant="outline">
              {{ user.role }}
            </Badge>
            <Badge :variant="user.status === 'invited' ? 'default' : 'outline'">
              {{ statusLabel(user.status) }}
            </Badge>
          </div>
          <p class="mt-1 truncate text-sm leading-5 text-muted-foreground">
            {{ user.email }}
          </p>
        </div>

        <Button
          v-if="user.status === 'invited'"
          type="button"
          variant="outline"
          size="sm"
          :disabled="linkLoadingUserId === user.id"
          @click="copyInviteLink(user)"
        >
          <Check v-if="copiedKey === `user-${user.id}`" class="size-4" />
          <Copy v-else class="size-4" />
          Скопировать ссылку
        </Button>
      </div>
    </div>

    <Dialog :open="inviteOpen" @update:open="handleInviteOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Пригласить юзера</DialogTitle>
          <DialogDescription>Username и email</DialogDescription>
        </DialogHeader>

        <form class="space-y-5" @submit.prevent="submitInvite">
          <div class="space-y-2">
            <Label for="admin-invite-username">Username</Label>
            <Input
              id="admin-invite-username"
              v-model="inviteForm.username"
              autocomplete="off"
              maxlength="32"
            />
          </div>

          <div class="space-y-2">
            <Label for="admin-invite-email">Email</Label>
            <Input
              id="admin-invite-email"
              v-model="inviteForm.email"
              type="email"
              autocomplete="off"
            />
          </div>

          <div v-if="lastInviteLink" class="space-y-2">
            <Label for="admin-invite-link">Invite link</Label>
            <div class="flex gap-2">
              <Input
                id="admin-invite-link"
                :model-value="lastInviteLink"
                readonly
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Скопировать ссылку"
                aria-label="Скопировать ссылку"
                @click="copyText(lastInviteLink, 'last-invite')"
              >
                <Check v-if="copiedKey === 'last-invite'" class="size-4" />
                <Copy v-else class="size-4" />
              </Button>
            </div>
          </div>

          <div
            v-if="inviteError"
            class="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
            role="alert"
          >
            {{ inviteError }}
          </div>

          <DialogFooter class="gap-2">
            <Button type="button" variant="outline" @click="closeInvite">
              Закрыть
            </Button>
            <Button type="submit" :disabled="!canInvite">
              Пригласить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>
</template>
