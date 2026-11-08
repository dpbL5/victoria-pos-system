import { describe, expect, it } from 'vitest'
import { getBoardAccess } from './board-access'

// ── Ma trận quyền màn "Ca hôm nay" ────────────────────────────────────────
// Khoá lại đúng ba quyết định: ai được thao tác tiền (phải có ca của mình),
// ai được xem bảng dù chưa vào ca (quyền sessions.monitor hoặc ADMIN), và
// user không có quyền nào chưa vào ca vẫn chỉ thấy màn "Mở ca".
const MONITOR_PERMS = ['sessions.monitor']
const NO_PERMS: string[] = []

describe('getBoardAccess', () => {
  it('user không có quyền monitor, chưa vào ca: không thao tác, không xem bảng', () => {
    expect(getBoardAccess(NO_PERMS, null, false)).toEqual({
      canOperate: false,
      canMonitor: false,
      showBoard: false,
    })
  })

  it('user đang trong ca: thao tác được nhưng không phải chế độ giám sát', () => {
    expect(getBoardAccess(NO_PERMS, null, true)).toEqual({
      canOperate: true,
      canMonitor: false,
      showBoard: true,
    })
  })

  it('ADMIN bypass: chưa vào ca vẫn xem bảng ở chế độ chỉ xem', () => {
    expect(getBoardAccess([], 'ADMIN', false)).toEqual({
      canOperate: false,
      canMonitor: true,
      showBoard: true,
    })
  })

  it('role tuỳ chỉnh có sessions.monitor: xem bảng chỉ đọc', () => {
    expect(getBoardAccess(MONITOR_PERMS, null, false)).toEqual({
      canOperate: false,
      canMonitor: true,
      showBoard: true,
    })
  })

  it('có monitor + đang trong ca: thao tác được như người trực quầy', () => {
    expect(getBoardAccess(MONITOR_PERMS, null, true)).toEqual({
      canOperate: true,
      canMonitor: true,
      showBoard: true,
    })
  })
})
