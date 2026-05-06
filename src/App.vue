<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ArrowLeft, LogOut } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import CashFlowsEditor from '@/components/cash-flows/CashFlowsEditor.vue'
import CashFlowSettingsPage from '@/components/cash-flows/CashFlowSettingsPage.vue'
import ParticipantBoardPage from '@/components/participant/ParticipantBoardPage.vue'
import ParticipantContoursPage from '@/components/participant/ParticipantContoursPage.vue'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { getCurrentUser, login, logout } from '@/lib/auth'

const currentUser = ref(null)
const authLoading = ref(true)
const loginSubmitting = ref(false)
const loginError = ref('')
const currentPath = ref(window.location.pathname)

const loginForm = reactive({
  login: 'anichkay',
  password: '',
})

function decodeRoutePart(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

const isAdmin = computed(() => currentUser.value?.role === 'admin')
const flowPageId = computed(() => {
  const match = currentPath.value.match(/^\/cash-flows\/flows\/([^/]+)$/)
  return match ? decodeRoutePart(match[1]) : null
})
const isFlowPage = computed(() => flowPageId.value !== null)
const participantBoardPage = computed(() => {
  const match = currentPath.value.match(/^\/my-contours\/([^/]+)\/([^/]+)$/)

  if (!match) {
    return null
  }

  const flowId = decodeRoutePart(match[1])
  const role = decodeRoutePart(match[2])

  return flowId && role ? { flowId, role } : null
})
const isParticipantBoardPage = computed(() => participantBoardPage.value !== null)
const showBackButton = computed(() => (
  isAdmin.value ? isFlowPage.value : isParticipantBoardPage.value
))
const canLogin = computed(
  () => loginForm.login.trim().length > 0 && loginForm.password.length > 0 && !loginSubmitting.value,
)

function syncPath() {
  currentPath.value = window.location.pathname
}

function normalizeKnownPath() {
  if (window.location.pathname !== '/' && !flowPageId.value && !participantBoardPage.value) {
    window.history.replaceState({}, '', '/')
    syncPath()
  }
}

function normalizePathForCurrentUser() {
  if (!currentUser.value) {
    return
  }

  const isAdminUser = currentUser.value.role === 'admin'

  if ((isAdminUser && isParticipantBoardPage.value) || (!isAdminUser && isFlowPage.value)) {
    window.history.replaceState({}, '', '/')
    syncPath()
  }
}

function pushPath(path) {
  window.history.pushState({}, '', path)
  syncPath()
}

function openFlowPage(flowId) {
  pushPath(`/cash-flows/flows/${encodeURIComponent(flowId)}`)
}

function openParticipantBoard(contour) {
  pushPath(`/my-contours/${encodeURIComponent(contour.flowId)}/${encodeURIComponent(contour.role)}`)
}

function goHome() {
  pushPath('/')
}

function handlePopstate() {
  syncPath()
  normalizeKnownPath()
  normalizePathForCurrentUser()
}

async function loadAuth() {
  authLoading.value = true
  loginError.value = ''

  try {
    currentUser.value = await getCurrentUser()
    normalizePathForCurrentUser()
  } catch (requestError) {
    loginError.value = requestError.message
  } finally {
    authLoading.value = false
  }
}

async function submitLogin() {
  if (!canLogin.value) {
    return
  }

  loginSubmitting.value = true
  loginError.value = ''

  try {
    currentUser.value = await login({
      login: loginForm.login,
      password: loginForm.password,
    })
    loginForm.password = ''
    normalizePathForCurrentUser()
  } catch (requestError) {
    loginError.value = requestError.message
  } finally {
    loginSubmitting.value = false
  }
}

async function logoutUser() {
  try {
    await logout()
  } finally {
    currentUser.value = null
    loginError.value = ''
    window.history.replaceState({}, '', '/')
    syncPath()
  }
}

onMounted(() => {
  syncPath()
  normalizeKnownPath()
  window.addEventListener('popstate', handlePopstate)
  void loadAuth()
})

onUnmounted(() => {
  window.removeEventListener('popstate', handlePopstate)
})
</script>

<template>
  <main class="min-h-svh bg-background text-foreground">
    <div
      v-if="authLoading"
      class="mx-auto flex min-h-svh w-full max-w-md items-center px-4 py-6 sm:px-6"
    >
      <div class="w-full rounded-lg border bg-card p-6">
        <Skeleton class="mb-4 h-6 w-32" />
        <Skeleton class="mb-2 h-10 w-full" />
        <Skeleton class="h-10 w-full" />
      </div>
    </div>

    <div
      v-else-if="!currentUser"
      class="mx-auto flex min-h-svh w-full max-w-md items-center px-4 py-6 sm:px-6"
    >
      <Card class="w-full">
        <CardHeader>
          <CardTitle>Вход</CardTitle>
        </CardHeader>
        <CardContent>
          <form class="space-y-5" @submit.prevent="submitLogin">
            <div class="space-y-2">
              <Label for="login">Логин</Label>
              <Input
                id="login"
                v-model="loginForm.login"
                autocomplete="username"
                placeholder="anichkay"
              />
            </div>

            <div class="space-y-2">
              <Label for="password">Пароль</Label>
              <Input
                id="password"
                v-model="loginForm.password"
                type="password"
                autocomplete="current-password"
              />
            </div>

            <div
              v-if="loginError"
              class="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
              role="alert"
            >
              {{ loginError }}
            </div>

            <Button type="submit" class="w-full" :disabled="!canLogin">
              Войти
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>

    <div v-else class="flex min-h-svh flex-col px-4 py-4 sm:px-6 lg:px-8">
      <header class="flex items-center justify-between border-b pb-4">
        <Button
          v-if="showBackButton"
          type="button"
          variant="outline"
          size="sm"
          @click="goHome"
        >
          <ArrowLeft class="size-4" />
          Назад
        </Button>
        <div v-else />

        <div class="flex items-center justify-end gap-3">
          <div class="min-w-0 text-right">
            <p class="truncate text-sm font-medium leading-5">
              {{ currentUser.username || currentUser.email }}
            </p>
            <p class="text-xs leading-5 text-muted-foreground">
              {{ currentUser.role }}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Выйти"
            aria-label="Выйти"
            @click="logoutUser"
          >
            <LogOut class="size-4" />
          </Button>
        </div>
      </header>

      <section class="min-w-0 flex-1 py-4">
        <template v-if="isAdmin">
          <CashFlowSettingsPage
            v-if="isFlowPage"
            :flow-id="flowPageId"
            :can-edit="isAdmin"
          />
          <CashFlowsEditor
            v-else
            :can-edit="isAdmin"
            @open-flow="openFlowPage"
          />
        </template>

        <template v-else>
          <ParticipantBoardPage
            v-if="participantBoardPage"
            :flow-id="participantBoardPage.flowId"
            :role="participantBoardPage.role"
          />
          <ParticipantContoursPage
            v-else
            @open-board="openParticipantBoard"
          />
        </template>
      </section>
    </div>
  </main>
</template>
