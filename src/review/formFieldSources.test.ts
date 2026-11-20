import { describe, expect, it } from 'vitest'
import { cellSourceKey, formatSourceFieldLabel, parseCellSourceKey } from './formFieldSources'

describe('cell source keys', () => {
  it('round-trips a table, row and column', () => {
    expect(cellSourceKey({ table: 'lineItems', row: 3, column: 'price' })).toBe('lineItems[3].price')
    expect(parseCellSourceKey('lineItems[3].price')).toEqual({ table: 'lineItems', row: 3, column: 'price' })
  })

  it('is null for a plain field key', () => {
    expect(parseCellSourceKey('total')).toBeNull()
    expect(parseCellSourceKey('lineItems[].price')).toBeNull()
  })

  it('parses names starting with a digit, which a form title like "1st Item" produces', () => {
    expect(parseCellSourceKey('1st_items[0].2nd_price')).toEqual({ table: '1st_items', row: 0, column: '2nd_price' })
  })

  it('parses hand-typed names with any characters, instead of dropping them as plain fields', () => {
    expect(parseCellSourceKey('položky[1].cena-kč')).toEqual({ table: 'položky', row: 1, column: 'cena-kč' })
  })

  it('binds the row index to the last `[n].`, so a dotted path names the table', () => {
    expect(parseCellSourceKey('invoice.lineItems[2].price')).toEqual({ table: 'invoice.lineItems', row: 2, column: 'price' })
  })

  it('labels a cell with a 1-based row number and leaves a plain key alone', () => {
    expect(formatSourceFieldLabel('lineItems[3].price')).toBe('price (lineItems row 4)')
    expect(formatSourceFieldLabel('total')).toBe('total')
  })
})
