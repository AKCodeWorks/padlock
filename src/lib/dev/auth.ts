import { Padlock } from "../padlock/padlock.ts"
import { env } from "$env/dynamic/private"

import { trustedProvider } from "../padlock/trusted-provider.ts"
import type { PadlockConfig } from "../padlock/types.js"


type InternalUserRaw = {
  id: string
  role: "admin" | "user"
  createdAt: Date
}
const trusted = trustedProvider<InternalUserRaw>()({
  async authenticate(email: string, password: string) {
    console.log(password)
    const user = {
      id: "123",
      email,
      name: "John Does",
      role: "admin" as const,
      createdAt: new Date(),

    }

    return {
      provider: "internal",
      providerAccountId: user.id,
      email: user.email,
      name: user.name,
      avatar: null,
      raw: {
        id: user.id,
        role: user.role,
        createdAt: user.createdAt
      }
    }
  }
})


const config = {
  baseUrl: "http://localhost:5173",
  jwt: {
    secret: env.AUTH_SECRET,
    cookie: {
      name: "padlock_jwt",
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    }
  },
  trustedProviders: {
    internal: trusted
  },
  providers: {
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      scopes: ["read:user", "user:email"]
    },
    microsoft: {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      scopes: ["user.read"]
    }
  },

  callbacks: {
    async onUser(user) {

      console.log("user authed", user)

      return user

    },
    async onError(error) {
      console.error(error)
    }
  }
} satisfies PadlockConfig

export const padlock = new Padlock(config)
