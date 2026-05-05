<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ArrowLeft, LogOut, Plus, Trash2, UserPlus } from 'lucide-vue-next'
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
const currentPath = ref(window.location.pathname)
const contours = ref([])
const loading = ref(false)
const detailLoading = ref(false)
const saving = ref(false)
const deletingId = ref(null)
const selectedContour = ref(null)
const members = ref([])
const membersLoading = ref(false)
const createDialogOpen = ref(false)
const inviteDialogOpen = ref(false)
const inviting = ref(false)
const error = ref('')
const loginError = ref('')
const inviteError = ref('')
const inviteSearch = ref('')

const loginForm = reactive({
  login: 'anichkay',
  password: '',
})

const form = reactive({
  name: '',
  description: '',
})

const memberFilters = reactive({
  query: '',
  access: 'all',
  role: 'all',
})

const inviteForm = reactive({
  username: '',
  email: '',
  role: 'viewer',
  access: 'view',
})

const isAdmin = computed(() => currentUser.value?.role === 'admin')
const contourPageId = computed(() => {
  const match = currentPath.value.match(/^\/contours\/(\d+)$/)
  return match ? Number(match[1]) : null
})
const isContourPage = computed(() => contourPageId.value !== null)
const canCreate = computed(() => form.name.trim().length > 0 && !saving.value && isAdmin.value)
const canLogin = computed(
  () => loginForm.login.trim().length > 0 && loginForm.password.length > 0 && !loginSubmitting.value,
)
const canInvite = computed(
  () =>
    inviteForm.username.trim().length > 0 &&
    inviteForm.email.trim().length > 0 &&
    !inviting.value &&
    isAdmin.value,
)
const filteredInviteMembers = computed(() => {
  const query = inviteSearch.value.trim().toLowerCase()

  if (!query) {
    return members.value
  }

  return members.value.filter((member) => {
    return (
      member.username.toLowerCase().includes(query) ||
      member.email.toLowerCase().includes(query)
    )
  })
})
const availableContoursLabel = computed(() => {
  const contoursAccess = currentUser.value?.availableContours ?? []

  if (contoursAccess.includes('all')) {
    return 'all contours'
  }

  return contoursAccess.length > 0 ? contoursAccess.join(', ') : 'нет доступных контуров'
})

const roleLabels = {
  owner: 'Владелец',
  admin: 'Админ',
  editor: 'Редактор',
  viewer: 'Наблюдатель',
}

const accessLabels = {
  all: 'Все доступы',
  full: 'Полный',
  edit: 'Редактирование',
  view: 'Просмотр',
}

const statusLabels = {
  active: 'Активен',
  invited: 'Инвайт',
}

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

function syncPath() {
  currentPath.value = window.location.pathname
}

function pushPath(path) {
  window.history.pushState({}, '', path)
  syncPath()
}

function handleApiError(requestError) {
  if (requestError.status === 401) {
    currentUser.value = null
    contours.value = []
    members.value = []
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

function openInviteDialog() {
  if (!isAdmin.value || !selectedContour.value) {
    return
  }

  inviteForm.username = ''
  inviteForm.email = ''
  inviteForm.role = 'viewer'
  inviteForm.access = 'view'
  inviteSearch.value = ''
  inviteError.value = ''
  inviteDialogOpen.value = true
}

async function loadActivePage() {
  if (isContourPage.value) {
    await loadContour(contourPageId.value)
    return
  }

  await loadContours()
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

async function loadContour(id) {
  if (!currentUser.value) {
    detailLoading.value = false
    return
  }

  detailLoading.value = true
  error.value = ''

  try {
    const payload = await requestJson(`/api/contours/${id}`)
    selectedContour.value = payload.contour
    await loadMembers(id)
  } catch (requestError) {
    selectedContour.value = null
    members.value = []
    handleApiError(requestError)
  } finally {
    detailLoading.value = false
  }
}

async function loadMembers(id = contourPageId.value) {
  if (!currentUser.value || !id) {
    membersLoading.value = false
    return
  }

  membersLoading.value = true

  try {
    const params = new URLSearchParams()

    if (memberFilters.query.trim()) {
      params.set('query', memberFilters.query.trim())
    }

    if (memberFilters.access !== 'all') {
      params.set('access', memberFilters.access)
    }

    if (memberFilters.role !== 'all') {
      params.set('role', memberFilters.role)
    }

    const suffix = params.toString() ? `?${params.toString()}` : ''
    const payload = await requestJson(`/api/contours/${id}/members${suffix}`)
    members.value = payload.members
  } catch (requestError) {
    handleApiError(requestError)
  } finally {
    membersLoading.value = false
  }
}

async function loadAuth() {
  authLoading.value = true
  loginError.value = ''

  try {
    currentUser.value = await getCurrentUser()

    if (currentUser.value) {
      await loadActivePage()
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
    await loadActivePage()
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
    selectedContour.value = null
    members.value = []
    error.value = ''
    loading.value = false
    detailLoading.value = false
    pushPath('/')
  }
}

function openContourPage(contour) {
  selectedContour.value = contour
  pushPath(`/contours/${contour.id}`)
  void loadContour(contour.id)
}

function goToContours() {
  selectedContour.value = null
  members.value = []
  error.value = ''
  pushPath('/')
  void loadContours()
}

async function createInvite() {
  if (!canInvite.value || !selectedContour.value) {
    return
  }

  inviting.value = true
  inviteError.value = ''

  try {
    const payload = await requestJson(`/api/contours/${selectedContour.value.id}/invites`, {
      method: 'POST',
      body: JSON.stringify({
        username: inviteForm.username,
        email: inviteForm.email,
        role: inviteForm.role,
        access: inviteForm.access,
      }),
    })

    members.value = [
      payload.member,
      ...members.value.filter((member) => member.userId !== payload.member.userId),
    ]
    inviteDialogOpen.value = false
  } catch (requestError) {
    inviteError.value = requestError.message
  } finally {
    inviting.value = false
  }
}

function handlePopstate() {
  syncPath()

  if (currentUser.value) {
    void loadActivePage()
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

onMounted(() => {
  syncPath()
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

    <div v-else class="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header class="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div class="space-y-2">
          <template v-if="isContourPage">
            <Button type="button" variant="outline" size="sm" @click="goToContours">
              <ArrowLeft class="size-4" />
              Контуры
            </Button>
            <p class="text-sm leading-6 text-muted-foreground">Контур</p>
            <h1 class="break-words text-3xl font-semibold leading-tight sm:text-4xl">
              {{ selectedContour?.name || 'Контур' }}
            </h1>
          </template>

          <template v-else>
            <h1 class="text-3xl font-semibold leading-tight sm:text-4xl">Контуры</h1>
            <p class="max-w-2xl text-sm leading-6 text-muted-foreground">
              Список сущностей с названием и описанием.
            </p>
          </template>
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
              v-if="isAdmin && !isContourPage"
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

          <div v-if="isContourPage && detailLoading" class="max-w-2xl rounded-lg border bg-card p-6">
            <Skeleton class="mb-3 h-4 w-20" />
            <Skeleton class="h-8 w-2/3" />
          </div>

          <div
            v-else-if="isContourPage && !selectedContour && !error"
            class="flex min-h-72 items-center justify-center rounded-lg border border-dashed bg-card p-8 text-center"
          >
            <div class="max-w-sm space-y-2">
              <h3 class="text-lg font-medium">Контур не найден</h3>
              <p class="text-sm leading-6 text-muted-foreground">
                Вернись к списку контуров.
              </p>
            </div>
          </div>

          <div v-else-if="isContourPage" class="grid gap-6 lg:grid-cols-[220px_1fr]">
            <aside class="border-b pb-4 lg:border-b-0 lg:border-r lg:pr-4">
              <div class="flex gap-2 lg:flex-col">
                <Button type="button" variant="secondary" class="justify-start">
                  Участники
                </Button>

                <Button
                  v-if="isAdmin"
                  type="button"
                  variant="outline"
                  class="justify-start"
                  @click="openInviteDialog"
                >
                  <UserPlus class="size-4" />
                  Пригласить
                </Button>
              </div>
            </aside>

            <section class="min-w-0 space-y-4">
              <div class="grid gap-3 md:grid-cols-[1fr_180px_180px]">
                <Input
                  v-model="memberFilters.query"
                  placeholder="Поиск"
                  @input="loadMembers()"
                />

                <select
                  v-model="memberFilters.access"
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  @change="loadMembers()"
                >
                  <option value="all">Все доступы</option>
                  <option value="full">Полный</option>
                  <option value="edit">Редактирование</option>
                  <option value="view">Просмотр</option>
                </select>

                <select
                  v-model="memberFilters.role"
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  @change="loadMembers()"
                >
                  <option value="all">Все роли</option>
                  <option value="owner">Владелец</option>
                  <option value="admin">Админ</option>
                  <option value="editor">Редактор</option>
                  <option value="viewer">Наблюдатель</option>
                </select>
              </div>

              <div v-if="membersLoading" class="space-y-3">
                <div v-for="index in 3" :key="index" class="rounded-lg border bg-card p-4">
                  <Skeleton class="mb-3 h-5 w-40" />
                  <Skeleton class="h-4 w-64 max-w-full" />
                </div>
              </div>

              <div
                v-else-if="members.length === 0"
                class="flex min-h-48 items-center justify-center rounded-lg border border-dashed bg-card p-8 text-center"
              >
                <div class="max-w-sm space-y-2">
                  <h3 class="text-lg font-medium">Участников нет</h3>
                  <p class="text-sm leading-6 text-muted-foreground">
                    Создай приглашение для первого участника.
                  </p>
                </div>
              </div>

              <div v-else class="space-y-3">
                <div
                  v-for="member in members"
                  :key="`${member.contourId}-${member.userId}`"
                  class="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium">
                      {{ member.username }}
                    </p>
                    <p class="truncate text-sm text-muted-foreground">
                      {{ member.email }}
                    </p>
                  </div>

                  <div class="flex flex-wrap gap-2">
                    <span class="rounded-sm border px-2 py-1 text-xs">
                      {{ roleLabels[member.role] || member.role }}
                    </span>
                    <span class="rounded-sm border px-2 py-1 text-xs">
                      {{ accessLabels[member.access] || member.access }}
                    </span>
                    <span class="rounded-sm border px-2 py-1 text-xs">
                      {{ statusLabels[member.status] || member.status }}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div v-else-if="loading" class="grid gap-3 md:grid-cols-2">
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
            <Card
              v-for="contour in contours"
              :key="contour.id"
              class="cursor-pointer transition-colors hover:border-foreground/30"
              role="button"
              tabindex="0"
              @click="openContourPage(contour)"
              @keydown.enter.prevent="openContourPage(contour)"
            >
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
                    @click.stop="removeContour(contour.id)"
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

      <Dialog v-model:open="inviteDialogOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Пригласить участника</DialogTitle>
            <DialogDescription>Доступ и роль в текущем контуре</DialogDescription>
          </DialogHeader>

          <div class="space-y-2">
            <Label for="invite-member-search">Поиск по участникам</Label>
            <Input
              id="invite-member-search"
              v-model="inviteSearch"
              placeholder="Имя или email"
            />

            <div
              v-if="filteredInviteMembers.length > 0"
              class="max-h-36 overflow-auto rounded-md border"
            >
              <div
                v-for="member in filteredInviteMembers"
                :key="`invite-${member.contourId}-${member.userId}`"
                class="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">{{ member.username }}</p>
                  <p class="truncate text-xs text-muted-foreground">{{ member.email }}</p>
                </div>
                <span class="shrink-0 text-xs text-muted-foreground">
                  {{ roleLabels[member.role] || member.role }}
                </span>
              </div>
            </div>
          </div>

          <form class="space-y-5" @submit.prevent="createInvite">
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-2">
                <Label for="invite-username">Username</Label>
                <Input
                  id="invite-username"
                  v-model="inviteForm.username"
                  autocomplete="off"
                  placeholder="username"
                />
              </div>

              <div class="space-y-2">
                <Label for="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  v-model="inviteForm.email"
                  type="email"
                  autocomplete="off"
                  placeholder="user@example.com"
                />
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-2">
                <Label for="invite-role">Роль</Label>
                <select
                  id="invite-role"
                  v-model="inviteForm.role"
                  class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="admin">Админ</option>
                  <option value="editor">Редактор</option>
                  <option value="viewer">Наблюдатель</option>
                </select>
              </div>

              <div class="space-y-2">
                <Label for="invite-access">Доступ</Label>
                <select
                  id="invite-access"
                  v-model="inviteForm.access"
                  class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="full">Полный</option>
                  <option value="edit">Редактирование</option>
                  <option value="view">Просмотр</option>
                </select>
              </div>
            </div>

            <div
              v-if="inviteError"
              class="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
              role="alert"
            >
              {{ inviteError }}
            </div>

            <DialogFooter>
              <Button type="submit" class="w-full sm:w-auto" :disabled="!canInvite">
                Создать инвайт
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  </main>
</template>
