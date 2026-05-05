<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { LogOut, Plus, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { getCurrentUser, login, logout } from '@/lib/auth'

const currentUser = ref(null)
const authLoading = ref(true)
const loginSubmitting = ref(false)
const contours = ref([])
const loading = ref(false)
const saving = ref(false)
const deletingId = ref(null)
const createDialogOpen = ref(false)
const error = ref('')
const loginError = ref('')

const loginForm = reactive({
  login: 'anichkay',
  password: '',
})

const form = reactive({
  name: '',
  description: '',
})

const isAdmin = computed(() => currentUser.value?.role === 'admin')
const canCreate = computed(() => form.name.trim().length > 0 && !saving.value && isAdmin.value)
const canLogin = computed(
  () => loginForm.login.trim().length > 0 && loginForm.password.length > 0 && !loginSubmitting.value,
)
const availableContoursLabel = computed(() => {
  const contoursAccess = currentUser.value?.availableContours ?? []

  if (contoursAccess.includes('all')) {
    return 'all contours'
  }

  return contoursAccess.length > 0 ? contoursAccess.join(', ') : 'нет доступных контуров'
})

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

    const requestError = new Error(message)
    requestError.status = response.status
    throw requestError
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

function handleApiError(requestError) {
  if (requestError.status === 401) {
    currentUser.value = null
    contours.value = []
    return
  }

  error.value = requestError.message
}

function openCreateDialog() {
  if (!isAdmin.value) {
    return
  }

  form.name = ''
  form.description = ''
  error.value = ''
  createDialogOpen.value = true
}

async function loadContours() {
  if (!currentUser.value) {
    loading.value = false
    return
  }

  loading.value = true
  error.value = ''

  try {
    const payload = await requestJson('/api/contours')
    contours.value = payload.contours
  } catch (requestError) {
    handleApiError(requestError)
  } finally {
    loading.value = false
  }
}

async function loadAuth() {
  authLoading.value = true
  loginError.value = ''

  try {
    currentUser.value = await getCurrentUser()

    if (currentUser.value) {
      await loadContours()
    }
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
    await loadContours()
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
    contours.value = []
    error.value = ''
    loading.value = false
  }
}

async function createNewContour() {
  if (!canCreate.value) {
    return
  }

  saving.value = true
  error.value = ''

  try {
    const payload = await requestJson('/api/contours', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        description: form.description,
      }),
    })

    contours.value = [payload.contour, ...contours.value]
    createDialogOpen.value = false
    form.name = ''
    form.description = ''
  } catch (requestError) {
    handleApiError(requestError)
  } finally {
    saving.value = false
  }
}

async function removeContour(id) {
  if (!isAdmin.value) {
    return
  }

  deletingId.value = id
  error.value = ''

  try {
    await requestJson(`/api/contours/${id}`, { method: 'DELETE' })
    contours.value = contours.value.filter((contour) => contour.id !== id)
  } catch (requestError) {
    handleApiError(requestError)
  } finally {
    deletingId.value = null
  }
}

onMounted(loadAuth)
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
          <CardDescription>Авторизация через cookie session</CardDescription>
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

    <div v-else class="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header class="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div class="space-y-2">
          <h1 class="text-3xl font-semibold leading-tight sm:text-4xl">Контуры</h1>
          <p class="max-w-2xl text-sm leading-6 text-muted-foreground">
            Список сущностей с названием и описанием.
          </p>
        </div>

        <div class="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
          <div class="text-left sm:text-right">
            <p class="text-sm font-medium leading-5">
              {{ currentUser.username || currentUser.email }}
            </p>
            <p class="text-xs leading-5 text-muted-foreground">
              {{ currentUser.role }} · {{ availableContoursLabel }}
            </p>
          </div>

          <div class="flex gap-2">
            <Button
              v-if="isAdmin"
              type="button"
              size="icon"
              title="Добавить контур"
              aria-label="Добавить контур"
              @click="openCreateDialog"
            >
              <Plus class="size-4" />
            </Button>

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
        </div>
      </header>

      <div class="flex-1 py-6">
        <section class="min-w-0">
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
              <CardHeader>
                <CardTitle class="min-w-0 break-words pr-2 leading-snug">{{ contour.name }}</CardTitle>
                <CardDescription class="text-xs">#{{ contour.id }}</CardDescription>
                <CardAction v-if="isAdmin">
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

      <Dialog v-model:open="createDialogOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый контур</DialogTitle>
            <DialogDescription>Название и описание</DialogDescription>
          </DialogHeader>

          <form class="space-y-5" @submit.prevent="createNewContour">
            <div class="space-y-2">
              <Label for="contour-name">Название</Label>
              <Input
                id="contour-name"
                v-model="form.name"
                maxlength="120"
                placeholder="Например: Продажи"
                autocomplete="off"
              />
            </div>

            <div class="space-y-2">
              <Label for="contour-description">Описание</Label>
              <Textarea
                id="contour-description"
                v-model="form.description"
                maxlength="800"
                placeholder="Короткое описание контура"
                class="min-h-28 resize-none"
              />
            </div>

            <div
              v-if="error"
              class="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
              role="alert"
            >
              {{ error }}
            </div>

            <DialogFooter>
              <Button type="submit" class="w-full sm:w-auto" :disabled="!canCreate">
                Создать
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  </main>
</template>
