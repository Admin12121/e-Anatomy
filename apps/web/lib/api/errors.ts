type ApiErrorEnvelope = {
  error?: {
    code?: string
    message?: string
  }
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = "ApiClientError"
  }
}

export async function parseApiError(response: Response) {
  let message = `Request failed with status ${response.status}`
  let code: string | undefined

  try {
    const payload = (await response.json()) as ApiErrorEnvelope
    message = payload.error?.message ?? message
    code = payload.error?.code
  } catch {
    // No structured payload available.
  }

  return new ApiClientError(message, response.status, code)
}
