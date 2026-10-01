import { describe, expect, it } from 'vitest'
import { getBoardAccess } from './board-access'

// ── Ma trận quyền màn "Ca hôm nay" ────────────────────────────────────────
// Khoá lại đúng ba quyết định: ai được thao tác tiền (phải có ca của mình),
// ai được xem bảng dù chưa vào ca (ADMIN/MANAGER), và STAFF chưa vào ca vẫn
// chỉ thấy màn "Mở ca" — không thấy bảng vận hành.
describe('getBoardAccess', () => {
  it('STAFF chưa vào ca: không thao tác, không xem bảng', () => {
    expect(getBoardAccess('STAFF', false)).toEqual({
      canOperate: false,
      canMonitor: false,
      showBoard: false,
    })
  })

  it('STAFF đang trong ca: thao tác được nhưng không phải chế độ giám sát', () => {
    expect(getBoardAccess('STAFF', true)).toEqual({
      canOperate: true,
      canMonitor: false,
      showBoard: true,
    })
  })

  it('ADMIN và MANAGER chưa vào ca: xem bảng ở chế độ chỉ xem', () => {
    for (const role of ['ADMIN', 'MANAGER']) {
      expect(getBoardAccess(role, false)).toEqual({
        canOperate: false,
        canMonitor: true,
        showBoard: true,
      })
    }
  })

  it('ADMIN/MANAGER đang trong ca: thao tác được như người trực quầy', () => {
    for (const role of ['ADMIN', 'MANAGER']) {
      expect(getBoardAccess(role, true)).toEqual({
        canOperate: true,
        canMonitor: true,
        showBoard: true,
      })
    }
  })

  it('role khác (TEACHER) hoặc chưa đọc được role: không mở bảng khi chưa vào ca', () => {
    expect(getBoardAccess('TEACHER', false).showBoard).toBe(false)
    expect(getBoardAccess(null, false).showBoard).toBe(false)
    expect(getBoardAccess(undefined, false).showBoard).toBe(false)
  })
})
