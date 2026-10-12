import { describe, expect, it } from 'vitest'

import { threadBadge } from './badges'

describe('threadBadge', () => {
  it('marks escalated threads', () => {
    expect(threadBadge({ status: 'escalated' }, null)).toBe('escalated')
  })

  it('marks resolved threads as replied', () => {
    expect(threadBadge({ status: 'resolved' }, null)).toBe('replied')
  })

  it('marks threads with an agent last message as replied', () => {
    expect(threadBadge({ status: 'open', last_role: 'agent' }, null)).toBe('replied')
  })

  it('marks customer messages without a pending draft as needing a draft', () => {
    expect(threadBadge({ status: 'open', last_role: 'customer' }, null)).toBe('needs_draft')
  })

  it('keeps customer messages with a pending draft open', () => {
    expect(threadBadge({ status: 'open', last_role: 'customer' }, { state: 'pending' })).toBe('open')
  })

  it('keeps customer messages with an approved draft open', () => {
    expect(threadBadge({ status: 'open', last_role: 'customer' }, { state: 'approved' })).toBe('open')
  })
})
