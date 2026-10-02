import { isManagerOrAdmin } from '@/lib/shared/roles'

/**
 * Quyền trên bảng vận hành của màn "Ca hôm nay".
 *
 * Trước đây một cờ `shiftReady = isAdmin || !!shift` gánh cả hai câu hỏi khác
 * nhau, nên: ADMIN chưa vào ca thấy nút Check-in/Thu ở trạng thái bật nhưng
 * backend luôn trả `SHIFT_REQUIRED`, còn MANAGER chưa vào ca thì không thấy
 * bảng nào cả (cả màn bị thay bằng màn "Mở ca").
 *
 * - `canOperate`: có ca của CHÍNH MÌNH — đúng bằng guard `findOpenIdForStaff`
 *   của check-in/check-out (src/lib/sessions/use-cases/check-in.ts), nên không
 *   còn control bật mà bấm vào là lỗi.
 * - `canMonitor`: ADMIN/MANAGER xem phiên đang chơi + lịch đặt để giám sát dù
 *   chưa vào ca. Chỉ xem — mọi thao tác tiền vẫn cần `canOperate`.
 */
export interface BoardAccess {
  canOperate: boolean
  canMonitor: boolean
  showBoard: boolean
}

export function getBoardAccess(
  role: string | null | undefined,
  hasOwnShift: boolean
): BoardAccess {
  const canOperate = hasOwnShift
  const canMonitor = isManagerOrAdmin(role ?? undefined)
  return { canOperate, canMonitor, showBoard: canOperate || canMonitor }
}
