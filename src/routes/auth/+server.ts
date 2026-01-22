import { padlock } from "$lib/auth.js";

export const GET = padlock.auth()
export const POST = padlock.auth()