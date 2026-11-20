import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SourceHighlightProvider, useSourceHighlight, type ActiveFieldSource } from './SourceHighlightContext'

function source(fieldName: string): ActiveFieldSource {
  return { fieldName, fileId: 'doc-1', boundingBoxes: [] }
}

/** Reports what the context currently exposes, and can publish/clear on demand. */
function Probe({ fieldName = 'amount' }: { fieldName?: string }) {
  const { active, activeReason, isActive, publish, clear } = useSourceHighlight()
  return (
    <div>
      <span data-testid="state">{`${isActive ? 'live' : 'inert'}:${active?.fieldName ?? 'none'}:${activeReason ?? 'none'}`}</span>
      <button type="button" onClick={() => publish(source(fieldName), 'hover')}>hover</button>
      <button type="button" onClick={() => publish(source(fieldName), 'focus')}>focus</button>
      <button type="button" onClick={() => clear(fieldName, 'hover')}>release</button>
    </div>
  )
}

const state = () => screen.getByTestId('state').textContent

describe('SourceHighlightProvider', () => {
  it('is inert outside a provider, so a plain form shows no indicator', () => {
    render(<Probe />)

    expect(state()).toBe('inert:none:none')
  })

  it('publishes and resolves a claim while enabled', async () => {
    render(<SourceHighlightProvider><Probe /></SourceHighlightProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'hover' }))

    expect(state()).toBe('live:amount:hover')
  })

  it('reports inert while disabled, without unmounting the tree', () => {
    render(<SourceHighlightProvider enabled={false}><Probe /></SourceHighlightProvider>)

    expect(state()).toBe('inert:none:none')
  })

  it('drops claims when it goes inert, so a stranded hover cannot outrank focus after reopening', () => {
    function Toggle() {
      const [enabled, setEnabled] = useState(true)
      return (
        <SourceHighlightProvider enabled={enabled}>
          <button type="button" onClick={() => setEnabled((e) => !e)}>toggle</button>
          <Probe />
        </SourceHighlightProvider>
      )
    }
    render(<Toggle />)
    fireEvent.click(screen.getByRole('button', { name: 'hover' }))
    expect(state()).toBe('live:amount:hover')

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
    expect(state()).toBe('inert:none:none')
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))

    expect(state()).toBe('live:none:none')
  })

  it('ignores a late release from a field that no longer holds the slot', () => {
    render(
      <SourceHighlightProvider>
        <Probe fieldName="amount" />
        <Probe fieldName="currency" />
      </SourceHighlightProvider>,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'hover' })[1])
    fireEvent.click(screen.getAllByRole('button', { name: 'release' })[0])

    expect(screen.getAllByTestId('state')[0].textContent).toBe('live:currency:hover')
  })
})
