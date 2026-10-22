// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App'
import fixture from './plan.fixture.json'

vi.mock('maplibre-gl', () => {
  // jsdom has no WebGL: simulate the real failure mode to prove the app survives it.
  class Map {
    constructor() {
      throw new Error('Failed to initialize WebGL')
    }
  }
  return { Map, Popup: class {}, Marker: class {}, NavigationControl: class {}, LngLatBounds: class {} }
})

describe('App', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/api/plan')) return new Response(JSON.stringify(fixture), { status: 200 })
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    }) as typeof fetch
  })

  it('renders the planner even when WebGL is unavailable', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /compare routes/i })).toBeTruthy()
    expect(screen.getByText(/could not start the WebGL map/i)).toBeTruthy()
  })

  it('plans the sample trip and shows three ranked routes', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /sample trip/i }))
    fireEvent.click(screen.getByRole('button', { name: /compare routes/i }))
    const group = await screen.findByRole('radiogroup', { name: /route options/i })
    const cards = within(group).getAllByRole('radio')
    expect(cards).toHaveLength(3)
    expect(within(group).getByText('Recommended')).toBeTruthy()
    expect(screen.getByRole('slider', { name: /forecast hour/i })).toBeTruthy()
    // timeline lists the recommended route's checkpoints
    const best = fixture.routes.find((r) => r.id === fixture.recommended_route_id)!
    await waitFor(() => expect(screen.getByLabelText(`${best.name} checkpoints`)).toBeTruthy())
  })

  it('validates missing places before calling the API', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /compare routes/i }))
    expect(screen.getByText(/choose an origin/i)).toBeTruthy()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
