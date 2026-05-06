class AuthError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

async function authRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    let message = 'Ошибка авторизации.'

    try {
      const payload = await response.json()
      message = payload.message || message
    } catch {
      // Keep fallback message when the auth service returns no JSON body.
    }

    throw new AuthError(message, response.status)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

export async function getCurrentUser() {
  try {
    const payload = await authRequest('/auth/me')
    return payload.user
  } catch (error) {
    if (error.status === 401) {
      return null
    }

    throw error
  }
}

export async function login({ login, password }) {
  const payload = await authRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
  })

  return payload.user
}

export async function logout() {
  await authRequest('/auth/logout', { method: 'POST' })
}

export async function listAdminUsers() {
  const payload = await authRequest('/auth/admin/users')
  return payload.users ?? []
}

export async function inviteAdminUser({ username, email }) {
  return authRequest('/auth/admin/users/invite', {
    method: 'POST',
    body: JSON.stringify({ username, email }),
  })
}

export async function createAdminInviteLink(userId) {
  return authRequest(`/auth/admin/users/${encodeURIComponent(userId)}/invite-link`, {
    method: 'POST',
  })
}

export async function getInvite(token) {
  return authRequest(`/auth/invites/${encodeURIComponent(token)}`)
}

export async function acceptInvite({ token, password }) {
  const payload = await authRequest(`/auth/invites/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  })

  return payload.user
}
