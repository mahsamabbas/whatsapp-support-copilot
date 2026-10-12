import { afterEach, describe, expect, it, vi } from 'vitest'

import { createThread } from './api'

describe('createThread', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts a customer name to the selected bot thread endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 7,
          bot_id: 3,
          customer_name: 'Priya Shah',
          status: 'open',
          updated_at: '2026-10-12T12:00:00Z',
          last_message_preview: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(createThread(3, 'Priya Shah')).resolves.toMatchObject({
      id: 7,
      customer_name: 'Priya Shah',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8003/bots/3/threads',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ customer_name: 'Priya Shah' }),
      }),
    )
  })
})
