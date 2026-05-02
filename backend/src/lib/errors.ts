/** Thrown when AI summarization fails in a controlled way (non-500). */
export class SummarizerError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = "SummarizerError";
    this.statusCode = statusCode;
  }
}
