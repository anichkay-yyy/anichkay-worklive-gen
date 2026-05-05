const sessionCookieName = 'worklive_session'

function encodeCookieValue(value) {
  return encodeURIComponent(value)
}

function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return ''
  }
}

export function getSessionToken(request) {
  const header = request.headers.cookie

  if (!header) {
    return ''
  }

  const cookies = header.split(';').map((cookie) => cookie.trim())

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const name = cookie.slice(0, separatorIndex)
    const value = cookie.slice(separatorIndex + 1)

    if (name === sessionCookieName) {
      return decodeCookieValue(value)
    }
  }

  return ''
}

export function sessionCookie(token, maxAgeSeconds) {
  const parts = [
    `${sessionCookieName}=${encodeCookieValue(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ]

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure')
  }

  return parts.join('; ')
}

export function clearSessionCookie() {
  const parts = [
    `${sessionCookieName}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ]

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure')
  }

  return parts.join('; ')
}
