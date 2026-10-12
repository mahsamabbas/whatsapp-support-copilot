const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8003'

export interface Status {
  ollama_ok: boolean
  bot_count: number
  db_ok: boolean
}

export interface Bot {
  id: number
  name: string
  created_at: string
}

export interface KnowledgeDocument {
  id: number
  bot_id: number
  filename: string
  created_at: string
}

export interface Thread {
  id: number
  bot_id: number
  customer_name: string
  status: string
  updated_at: string
  last_message_preview: string | null
}

export interface Message {
  id: number
  thread_id: number
  role: 'customer' | 'agent'
  body: string
  created_at: string
}

export interface Draft {
  id: number
  thread_id: number
  body: string
  confidence: number
  sources_json: string
  state: string
  created_at: string
}

export interface ThreadDetail extends Thread {
  messages: Message[]
  latest_draft: Draft | null
}

export interface DraftResult {
  body: string
  confidence: number
  sources: string[]
  escalated: boolean
  reason: string | null
  draft_id: number
}

export interface Escalation {
  id: number
  thread_id: number
  reason: string
  status: string
  created_at: string
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)
  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      typeof payload === 'object' &&
      payload !== null &&
      'detail' in payload &&
      typeof payload.detail === 'string'
        ? payload.detail
        : `Request failed with status ${response.status}.`
    throw new ApiError(detail, response.status)
  }

  return payload as T
}

function jsonRequest(method: 'POST', body?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }
}

export const getStatus = () => request<Status>('/status')
export const listBots = () => request<Bot[]>('/bots')
export const createBot = (name: string) => request<Bot>('/bots', jsonRequest('POST', { name }))
export const listKnowledge = (botId: number) => request<KnowledgeDocument[]>(`/bots/${botId}/knowledge`)
export const listThreads = (botId: number) => request<Thread[]>(`/bots/${botId}/threads`)
export const createThread = (botId: number, customerName: string) =>
  request<Thread>(`/bots/${botId}/threads`, jsonRequest('POST', { customer_name: customerName }))
export const getThread = (threadId: number) => request<ThreadDetail>(`/threads/${threadId}`)
export const postMessage = (threadId: number, role: Message['role'], body: string) =>
  request<Message>(`/threads/${threadId}/messages`, jsonRequest('POST', { role, body }))
export const generateDraft = (threadId: number) =>
  request<DraftResult>(`/threads/${threadId}/draft`, jsonRequest('POST'))
export const approveDraft = (threadId: number, body?: string) =>
  request<ThreadDetail>(`/threads/${threadId}/approve`, jsonRequest('POST', { body }))
export const escalateThread = (threadId: number, reason?: string) =>
  request<ThreadDetail>(`/threads/${threadId}/escalate`, jsonRequest('POST', { reason }))
export const listEscalations = (botId: number) =>
  request<Escalation[]>(`/bots/${botId}/escalations`)

export async function uploadKnowledge(botId: number, file: File): Promise<KnowledgeDocument> {
  const formData = new FormData()
  formData.append('file', file)
  return request<KnowledgeDocument>(`/bots/${botId}/knowledge`, {
    method: 'POST',
    body: formData,
  })
}
