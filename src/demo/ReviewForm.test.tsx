import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReviewForm } from './ReviewForm'
import { sample } from './sample'

const renderForm = () => render(<ReviewForm fieldSources={sample.fieldSources} />)
const renderWithChecks = () =>
  render(<ReviewForm fieldSources={sample.fieldSources} checks={sample.checks} checksSlot={document.body} />)
const checksButton = () => screen.getByRole('button', { name: /^Consistency checks:/ })
const checksPanel = () => within(screen.getByRole('region', { name: 'Consistency checks' }))
const panelShown = () => screen.queryByRole('region', { name: 'Consistency checks' }) !== null
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const confirmButton = (label: string) => screen.getByRole('button', { name: `Confirm ${label}` })
const fieldConfirmButtons = () => screen.getAllByRole('button', { name: /^Confirm (?!section:)/ })
const sectionButton = (title: string) => screen.getByRole('button', { name: `Confirm section: ${title}` })
const sectionInactive = (title: string) => sectionButton(title).getAttribute('aria-disabled') === 'true'
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

    for (const button of fieldConfirmButtons()) fireEvent.click(button)
    expect(approveButton().disabled).toBe(false)
    fireEvent.click(approveButton())

    expect(input('Revenue').readOnly).toBe(true)
    expect(screen.getByText('Approved: 19 confirmed, 1 corrected, 0 added')).toBeTruthy()
  })

  it('confirms the confident fields of one section, then sends the reviewer to the first one it left to check', () => {
    renderForm()

    fireEvent.click(sectionButton('Profit and loss (thousands)'))

    expect(pressed('Revenue')).toBe('true')
    expect(pressed('Depreciation')).toBe('false')
    expect(pressed('Interest expense')).toBe('false')
    expect(pressed('Company name')).toBe('false')
    expect(pressed('Fixed assets')).toBe('false')
    expect(document.activeElement).toBe(input('Depreciation'))
    expect(approveButton().disabled).toBe(true)
  })

  it('moves on to the next section once a section has nothing left to check, and turns its button off', () => {
    renderForm()

    fireEvent.click(sectionButton('Company'))

    expect(pressed('Company name')).toBe('true')
    expect(document.activeElement).toBe(input('Revenue'))
    expect(sectionInactive('Company')).toBe(true)
    expect(sectionButton('Company').title).toBe('Every value in this section is checked')
  })

  it('says what confirming a section would do, and why it cannot once only uncertain values are left', () => {
    renderForm()
    const section = 'Profit and loss (thousands)'
    expect(sectionButton(section).title).toBe(
      'Confirm the 6 values the AI was at least 75 % sure of; 2 values more to check one by one',
    )

    fireEvent.click(sectionButton(section))

    expect(sectionInactive(section)).toBe(true)
    expect(sectionButton(section).title).toBe(
      '2 values left to check one by one: the AI was unsure, or they are in a check that does not add up',
    )
  })

  it('does nothing when pressed with nothing to confirm', () => {
    renderForm()
    fireEvent.click(sectionButton('Company'))
    input('Currency').focus()

    fireEvent.click(sectionButton('Company'))

    expect(document.activeElement).toBe(input('Currency'))
  })

  it('has no way to confirm the whole document at once', () => {
    renderForm()

    expect(screen.queryByRole('button', { name: 'Confirm all' })).toBeNull()
  })

  it('moves to Approve document after Enter on the last field to check', () => {
    renderForm()
    const buttons = fieldConfirmButtons()
    for (const button of buttons.slice(0, -1)) fireEvent.click(button)
    const last = input('Total liabilities and equity')
    last.focus()

    fireEvent.keyDown(last, { key: 'Enter' })

    expect(document.activeElement).toBe(approveButton())
  })
})

describe('ReviewForm consistency checks', () => {
  it('shows on its button how many checks fail, and lists them once opened', () => {
    renderWithChecks()
    expect(checksButton().getAttribute('aria-label')).toBe('Consistency checks: 3 of 5 do not add up')
    expect(checksButton().getAttribute('aria-expanded')).toBe('false')
    expect(panelShown()).toBe(false)

    fireEvent.click(checksButton())

    expect(checksButton().getAttribute('aria-expanded')).toBe('true')
    expect(checksPanel().getByText('3 of 5 do not add up. Their fields are marked, and confirming a section leaves them to you.')).toBeTruthy()
  })

  it('gives the all-clear once corrections make every check add up, and withholds it while one cannot run', () => {
    renderWithChecks()

    fireEvent.change(input('Depreciation'), { target: { value: '-6140' } })
    fireEvent.change(input('Interest expense'), { target: { value: '-2310' } })
    fireEvent.change(input('Bank loans'), { target: { value: '38900' } })
    expect(checksButton().getAttribute('aria-label')).toBe('Consistency checks: all add up')

    fireEvent.change(input('Revenue'), { target: { value: '' } })
    expect(checksButton().getAttribute('aria-label')).toBe('Consistency checks: none fails, but some could not run')
  })

  it('closes on Escape and on a press outside it', () => {
    renderWithChecks()
    fireEvent.click(checksButton())

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(panelShown()).toBe(false)

    fireEvent.click(checksButton())
    fireEvent.pointerDown(input('Revenue'))
    expect(panelShown()).toBe(false)
  })

  it('warns about a sum the AI values break, and says so once a correction puts it right', () => {
    renderWithChecks()
    fireEvent.click(checksButton())
    expect(checksPanel().getByText('Off by 900: the parts add up to 130,650, the total is 129,750')).toBeTruthy()
    expect(input('Equity').getAttribute('aria-describedby')).toContain('check-liabilitiesAddUp')

    fireEvent.change(input('Bank loans'), { target: { value: '38900' } })

    expect(checksPanel().getByText('Adds up after your corrections')).toBeTruthy()
    expect(input('Equity').getAttribute('aria-describedby') ?? '').not.toContain('check-liabilitiesAddUp')
  })

  it('leaves the fields of a failing check out of the section confirmation', () => {
    renderWithChecks()

    fireEvent.click(sectionButton('Balance sheet (thousands)'))

    expect(pressed('Total assets')).toBe('true')
    expect(pressed('Equity')).toBe('false')
    expect(document.activeElement).toBe(input('Equity'))
  })

  it('does not block approval', () => {
    renderWithChecks()

    for (const button of fieldConfirmButtons()) fireEvent.click(button)

    expect(approveButton().disabled).toBe(false)
  })
})
