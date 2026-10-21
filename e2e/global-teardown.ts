import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Luôn dọn dữ liệu E2E sau mỗi lượt chạy — kể cả khi test fail giữa chừng —
 * để bảng giá/hàng hoá `[E2E]` không đè lên dữ liệu vận hành của DB dev.
 */
export default async function globalTeardown() {
  if (process.env.E2E_ALLOW_DEV_DATABASE !== '1') return

  const { stdout } = await execFileAsync('./node_modules/.bin/tsx', ['e2e/e2e-data.ts', 'cleanup'], {
    cwd: process.cwd(),
    env: process.env,
  })
  if (stdout.trim()) console.log('[e2e teardown]', stdout.trim())
}
