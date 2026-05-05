import crypto from 'node:crypto'

const keyLength = 64

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url')
  const hash = crypto.scryptSync(password, salt, keyLength).toString('base64url')

  return { hash, salt }
}

export function verifyPassword(password, salt, expectedHash) {
  const actualHash = crypto.scryptSync(password, salt, keyLength)
  const expectedBuffer = Buffer.from(expectedHash, 'base64url')

  if (actualHash.length !== expectedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(actualHash, expectedBuffer)
}
