import {
  cashInputToNumber,
  getCashInputSuggestions,
  normalizeCashInput,
} from './cash-input'

describe('normalizeCashInput', () => {
  it('chỉ giữ lại chữ số đã nhập', () => {
    expect(normalizeCashInput('1a5')).toEqual({ value: '15', caret: 2 })
  })

  it('format dấu chấm và ẩn gợi ý từ 10 triệu', () => {
    expect(normalizeCashInput('1000')).toEqual({ value: '1.000', caret: 5 })
    expect(getCashInputSuggestions('1')).toEqual([
      { value: 1000, label: '1.000' },
      { value: 1000000, label: '1.000.000' },
    ])
    expect(getCashInputSuggestions('10.000.000')).toEqual([])
    expect(cashInputToNumber('1.000.000')).toBe(1_000_000)
  })
})
