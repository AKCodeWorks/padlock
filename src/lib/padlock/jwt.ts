import jwt from "jsonwebtoken"

export type PadlockJwtPayload = {
  sub: string
  provider: string
  providerAccountId: string
}

export function signJwt(
  payload: PadlockJwtPayload,
  secret: string,
  expiresInSeconds = 60 * 60
): string {
  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: expiresInSeconds
  })
}

export function verifyJwt<T extends PadlockJwtPayload>(
  token: string,
  secret: string
): T {
  return jwt.verify(token, secret) as T
}
