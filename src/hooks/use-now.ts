import { useSyncExternalStore } from 'react'

// ── Đồng hồ dùng chung cho các chỗ hiển thị thời gian realtime ──────────────
// Một interval duy nhất cho cả app, và chỉ component nào gọi `useNow()` mới
// re-render mỗi giây. Trước đây màn Ca hôm nay tick ở component gốc nên MỌI thứ
// trên màn (tất cả thẻ phiên, khối lịch đặt, cả 10 dialog đang mount) re-render
// lại mỗi giây, dù chỉ vài thẻ thật sự hiện đồng hồ.
//
// Interval tự tắt khi không còn ai subscribe (rời màn là hết tick).
let currentNow = Date.now()
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

function emit() {
  currentNow = Date.now()
  for (const notify of listeners) notify()
}

function subscribe(listener: () => void): () => void {
  // Đồng hồ đứng khi không ai xem → làm mới ngay lúc có người xem lại. React so
  // lại snapshot sau khi subscribe nên lần render đầu không bị trễ một nhịp.
  if (listeners.size === 0) {
    currentNow = Date.now()
    timer = setInterval(emit, 1000)
  }
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

const getSnapshot = () => currentNow
// Lượt render trên server dùng giá trị này (ổn định trong suốt lượt render);
// sau hydrate, `subscribe` làm mới và React render lại ngay.
const getServerSnapshot = () => currentNow

/**
 * Thời điểm hiện tại (ms), cập nhật mỗi giây — dùng cho đồng hồ đếm giờ chơi và
 * thời gian tạm dừng. Truyền giá trị này xuống các hàm tính thời gian
 * (`calcElapsedHMS`, `pausedSecondsUntil`, `sessionDayLabel`) thay vì để chúng
 * tự gọi `Date.now()`, nhờ vậy một lần tick = một lần render đúng chỗ.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
