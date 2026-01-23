import { padlock } from "$lib/dev/auth.ts";

export const GET = padlock.auth()
export const POST = padlock.auth()