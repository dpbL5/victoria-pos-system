import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function assertDevDatabase() {
  if (process.env.E2E_ALLOW_DEV_DATABASE !== '1') {
    throw new Error('E2E tạo user tạm trên DB dev. Chạy lại với E2E_ALLOW_DEV_DATABASE=1.')
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Không chạy E2E có fixture trên NODE_ENV=production.')
  }
}

async function run(script: string, action: string) {
  await execFileAsync('./node_modules/.bin/tsx', [script, action], {
    cwd: process.cwd(),
    env: process.env,
  })
}

function usesProvidedAccount() {
  return !!(process.env.E2E_ADMIN_USERNAME && process.env.E2E_ADMIN_PASSWORD)
}

export default async function globalSetup() {
  assertDevDatabase()
  if (usesProvidedAccount()) return

  await run('e2e/db-fixture.ts', 'create')
  return async () => {
    // Dọn dữ liệu [E2E] trước khi xoá user fixture — session.staffId là FK
    // tới user, nếu xoá user trước sẽ vướng sessions_staff_id_fkey.
    await run('e2e/e2e-data.ts', 'cleanup')
    await run('e2e/db-fixture.ts', 'cleanup')
  }
}
