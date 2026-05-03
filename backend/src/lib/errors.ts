/** Thrown when AI summarization fails in a controlled way (non-500). */
export class SummarizerError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = "SummarizerError";
    this.statusCode = statusCode;
  }
}

/** Thrown for validation / conflict errors on item move and folder rules (4xx). */
export class HttpClientError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "HttpClientError";
    this.statusCode = statusCode;
  }
}
