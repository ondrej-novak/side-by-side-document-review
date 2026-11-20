import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReviewForm } from './ReviewForm'
import { sample } from './sample'

const renderForm = () => render(<ReviewForm fieldSources={sample.fieldSources} />)
const renderWithChecks = () => render(<ReviewForm fieldSources={sample.fieldSources} checks={sample.checks} />)
const checksPanel = () => within(screen.getByRole('region', { name: 'Consistency checks' }))
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const confirmButton = (label: string) => screen.getByRole('button', { name: `Confirm ${label}` })
const approveButton = () => screen.getByRole('button', { name: 'Approve document' }) as HTMLButtonElement
const pressed = (label: string) => confirmButton(label).getAttribute('aria-pressed')

describe('ReviewForm', () => {
  it('confirms a field with its check button, and a second press withdraws it', () => {
    renderForm()

    fireEvent.click(confirmButton('Revenue'))
    expect(pressed('Revenue')).toBe('true')

    fireEvent.click(confirmButton('Revenue'))
    expect(pressed('Revenue')).toBe('false')
  })

  it('confirms with Enter and moves to the next field still to check', () => {
    renderForm()
    fireEvent.click(confirmButton('Cost of sales'))
    input('Revenue').focus()

    fireEvent.keyDown(input('Revenue'), { key: 'Enter' })

    expect(pressed('Revenue')).toBe('true')
    expect(document.activeElement).toBe(input('Personnel costs'))
  })

  it('keeps a confirmed field confirmed when Enter passes over it', () => {
    renderForm()
    fireEvent.click(confirmButton('Revenue'))
    input('Revenue').focus()

    fireEvent.keyDown(input('Revenue'), { key: 'Enter' })

    expect(pressed('Revenue')).toBe('true')
    expect(document.activeElement).toBe(input('Cost of sales'))
  })

  it('treats a changed value as reviewed, so it has nothing to confirm', () => {
    renderForm()

    fireEvent.change(input('Depreciation'), { target: { value: '-6410' } })

    expect(confirmButton('Depreciation')).toHaveProperty('disabled', true)
  })

  it('approves only once every field is checked, then locks the form', () => {
    renderForm()
    fireEvent.change(input('Depreciation'), { target: { value: '-6410' } })
    expect(approveButton().disabled).toBe(true)

    for (const button of screen.getAllByRole('button', { name: /^Confirm / })) fireEvent.click(button)
    expect(approveButton().disabled).toBe(false)
    fireEvent.click(approveButton())

    expect(input('Revenue').readOnly).toBe(true)
    expect(screen.getByText('Approved: 19 confirmed, 1 corrected, 0 added')).toBeTruthy()
  })

  it('confirms all confident fields at once, then sends the reviewer to the first one left to check', () => {
    renderForm()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm all' }))

    expect(pressed('Revenue')).toBe('true')
    expect(pressed('Depreciation')).toBe('false')
    expect(pressed('Interest expense')).toBe('false')
    expect(document.activeElement).toBe(input('Depreciation'))
    expect(approveButton().disabled).toBe(true)
  })

  it('moves to Approve document after Enter on the last field to check', () => {
    renderForm()
    const buttons = screen.getAllByRole('button', { name: /^Confirm / })
    for (const button of buttons.slice(0, -1)) fireEvent.click(button)
    const last = input('Total liabilities and equity')
    last.focus()

    fireEvent.keyDown(last, { key: 'Enter' })

    expect(document.activeElement).toBe(approveButton())
  })
})

describe('ReviewForm consistency checks', () => {
  it('warns about a sum the AI values break, and says so once a correction puts it right', () => {
    renderWithChecks()
    expect(checksPanel().getByText('Off by 900: the parts add up to 130,650, the total is 129,750')).toBeTruthy()
    expect(input('Equity').getAttribute('aria-describedby')).toContain('check-liabilitiesAddUp')

    fireEvent.change(input('Bank loans'), { target: { value: '38900' } })

    expect(checksPanel().getByText('Adds up after your corrections')).toBeTruthy()
    expect(input('Equity').getAttribute('aria-describedby') ?? '').not.toContain('check-liabilitiesAddUp')
  })

  it('leaves the fields of a failing check out of Confirm all', () => {
    renderWithChecks()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm all' }))

    expect(pressed('Total assets')).toBe('true')
    expect(pressed('Equity')).toBe('false')
    expect(pressed('Revenue')).toBe('false')
    expect(document.activeElement).toBe(input('Revenue'))
  })

  it('does not block approval', () => {
    renderWithChecks()

    for (const button of screen.getAllByRole('button', { name: /^Confirm / })) fireEvent.click(button)

    expect(approveButton().disabled).toBe(false)
  })
})
