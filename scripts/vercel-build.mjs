// Build trên Vercel: đồng bộ schema DB rồi build.
// Chỉ chạy `prisma db push` trên Production — preview deployment không được
// ghi schema vào DB thật (tránh nhánh PR chưa merge làm lệch schema production).
import { execSync } from 'node:child_process'

const run = (command) => execSync(command, { stdio: 'inherit' })

if (process.env.VERCEL_ENV === 'production') {
  if (!process.env.DIRECT_URL) {
    console.error(
      'Thiếu DIRECT_URL. `prisma db push` cần kết nối session pooler (port 5432), ' +
        'không chạy DDL được qua transaction pooler (port 6543).',
    )
    process.exit(1)
  }
  run('npx prisma db push')
}

run('npm run build')
