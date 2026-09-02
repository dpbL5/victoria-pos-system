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
      { value: 100, label: '100' },
      { value: 1000, label: '1.000' },
      { value: 10000, label: '10.000' },
      { value: 1000000, label: '1.000.000' },
    ])
    expect(getCashInputSuggestions('50')).toEqual([
      { value: 5000, label: '5.000' },
      { value: 50000, label: '50.000' },
      { value: 500000, label: '500.000' },
    ])
    expect(getCashInputSuggestions('10.000.000')).toEqual([])
    expect(cashInputToNumber('1.000.000')).toBe(1_000_000)
  })
})
