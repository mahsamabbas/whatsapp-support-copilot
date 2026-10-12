type BadgeThread = {
  status: string
  last_role?: 'customer' | 'agent'
}

type LatestDraft = {
  state: string
} | null

export type ThreadBadge = 'needs_draft' | 'escalated' | 'replied' | 'open'

export function threadBadge(thread: BadgeThread, latestDraft: LatestDraft): ThreadBadge {
  if (thread.status === 'escalated') return 'escalated'
  if (thread.status === 'resolved' || thread.last_role === 'agent') return 'replied'
  if (
    thread.last_role === 'customer' &&
    latestDraft?.state !== 'pending' &&
    latestDraft?.state !== 'approved'
  ) {
    return 'needs_draft'
  }
  return 'open'
}
