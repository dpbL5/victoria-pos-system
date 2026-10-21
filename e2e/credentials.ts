import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface E2ECredentials {
  username: string
  password: string
}

export function loadCredentials(): E2ECredentials {
  if (process.env.E2E_ADMIN_USERNAME && process.env.E2E_ADMIN_PASSWORD) {
    return {
      username: process.env.E2E_ADMIN_USERNAME,
      password: process.env.E2E_ADMIN_PASSWORD,
    }
  }

  return JSON.parse(
    readFileSync(resolve(process.cwd(), '.e2e-auth.json'), 'utf8'),
  ) as E2ECredentials
}
