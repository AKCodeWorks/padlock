import { github } from "./github.js"
import type { OAuthProvider } from "../types.js"
import { microsoft } from "./microsoft.js"


export const providers = {
  github,
  microsoft
} satisfies Record<string, OAuthProvider>
