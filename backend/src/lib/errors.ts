/** Thrown when AI summarization fails in a controlled way (non-500). */
export class SummarizerError extends Error {
  readonly statusCode: number;
  /** Included in JSON as `details` when set (e.g. YouTube parse debugging). */
  readonly details?: Record<string, unknown>;

  constructor(message: string, statusCode = 503, details?: Record<string, unknown>) {
    super(message);
    this.name = "SummarizerError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

/** Thrown for validation / conflict errors on item move and folder rules (4xx). */
export class HttpClientError extends Error {
  readonly statusCode: number;
  /** Included in JSON as `details` when set (safe diagnostics for clients / support). */
  readonly details?: Record<string, unknown>;

  constructor(message: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "HttpClientError";
    this.statusCode = statusCode;
    this.details = details;
  }
}
