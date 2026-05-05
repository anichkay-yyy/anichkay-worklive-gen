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
