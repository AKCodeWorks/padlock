import { Padlock } from "./padlock/padlock.js"
import { env } from "$env/dynamic/private"

import { trustedProvider } from "./padlock/trusted-provider.js"


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
      createdAt: new Date()
    }

    return {
      provider: "internal",
      providerAccountId: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: null,
      raw: {
        id: user.id,
        role: user.role,
        createdAt: user.createdAt
      }
    }
  }
})


export const padlock = new Padlock({
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
      scope: "read:user user:email"
    },
  },

  callbacks: {
    async onUser(user) {
      // basically a user was authenticated from the provider and returned

      console.log("user authed", user)

      return user

    },
    async onError(error) {
      console.error(error)
    }
  }
})