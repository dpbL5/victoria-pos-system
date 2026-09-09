// Gọi từ cron mỗi phút: node --env-file=.env scripts/run-calendar-worker.mjs
const base = process.env.CALENDAR_WORKER_URL || process.env.NEXT_PUBLIC_APP_URL
const secret = process.env.CALENDAR_CRON_SECRET
if (!base || !secret || secret.length < 32) throw new Error('Cần URL ứng dụng và CALENDAR_CRON_SECRET tối thiểu 32 ký tự')
const url = new URL('/api/internal/calendar', base)
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Worker yêu cầu HTTPS ngoài localhost')
const response = await fetch(url, {
  method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(90_000),
})
if (!response.ok) throw new Error(`Tác vụ lịch chưa hoàn tất (HTTP ${response.status}); xem trạng thái trong ứng dụng`)
console.log('Đã chạy tác vụ lịch')
