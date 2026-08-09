// ── Shifts module — Shift + ShiftParticipant + ShiftTool ─────
export {
  findOpenShiftForStaff,
  findOpenOperationalShift,
  shiftWithParticipantsInclude,
  shiftWithAllParticipantsInclude,
  calculateExpectedCash,
  getShiftTransactions,
  getShiftRevenueData,
  calcToolStats,
  type TransactionItem,
  type ShiftRevenueData,
  type ShiftDayGroup,
} from './helpers'
export { closeShift, mapCloseShiftError } from './use-cases/close-shift'
export { openOrJoinShift, mapOpenOrJoinShiftError } from './use-cases/open-or-join'
export { addShiftParticipant, mapAddShiftParticipantError, removeShiftParticipant, mapRemoveShiftParticipantError } from './use-cases/manage-participant'
export { adjustShiftCashDifference, mapAdjustShiftCashDifferenceError } from './use-cases/adjust-shift-cash'
export type {
  CloseShiftInput,
  CloseShiftResult,
} from './use-cases/close-shift'
export type {
  OpenOrJoinShiftInput,
  OpenOrJoinShiftResult,
} from './use-cases/open-or-join'
export type {
  AddShiftParticipantInput,
  AddShiftParticipantResult,
  RemoveShiftParticipantInput,
  RemoveShiftParticipantResult,
} from './use-cases/manage-participant'
export type {
  AdjustShiftCashDifferenceInput,
  AdjustShiftCashDifferenceResult,
} from './use-cases/adjust-shift-cash'
export type { ShiftRepository, OpenShiftDetail, ShiftForClose, CloseShiftData, ShiftListRow, ShiftListFilter, ShiftReportRow } from './ports'
export * from './validations'
