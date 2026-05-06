<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { LogOut } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import CashFlowsEditor from '@/components/cash-flows/CashFlowsEditor.vue'
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

const loginForm = reactive({
  login: 'anichkay',
  password: '',
})

const isAdmin = computed(() => currentUser.value?.role === 'admin')
const canLogin = computed(
  () => loginForm.login.trim().length > 0 && loginForm.password.length > 0 && !loginSubmitting.value,
)

function normalizeHomePath() {
  if (window.location.pathname !== '/') {
    window.history.replaceState({}, '', '/')
  }
}

async function loadAuth() {
  authLoading.value = true
  loginError.value = ''

  try {
    currentUser.value = await getCurrentUser()
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
  }
}

onMounted(() => {
  normalizeHomePath()
  void loadAuth()
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
      <header class="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold leading-tight sm:text-3xl">Cash-flows</h1>
        </div>

        <div class="flex items-center justify-between gap-3 sm:justify-end">
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
        <CashFlowsEditor :can-edit="isAdmin" />
      </section>
    </div>
  </main>
</template>
