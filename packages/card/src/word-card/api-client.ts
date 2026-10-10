import { createShirabeClient, type Client } from "@shirabe-org/api";

/**
 * The Card package is deliberately host-neutral, but its online hosts all
 * speak Shirabe's API. Keep that transport in one place so the generated SDK,
 * rather than hand-written paths and JSON encoding, is the contract boundary.
 */
export function createCardApiClient(options: {
  apiBase: string;
  fetch: typeof globalThis.fetch;
  accessToken?: string;
}): Client {
  return createShirabeClient({
    baseUrl: options.apiBase.replace(/\/$/, ""),
    // API operations are JSON by contract. This also keeps embedded/WebView
    // hosts robust when a proxy strips a response Content-Type header.
    parseAs: "json",
    fetch: options.fetch,
    accessToken: options.accessToken,
  });
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

type SdkResult<T> = { data?: T; error?: unknown; response?: Response };

/** Convert the generated SDK's typed result into the Card host's stable error. */
export async function cardApiResult<T>(result: Promise<SdkResult<T>>, fallback: string): Promise<T> {
  const answer = await result;
  if (answer.data !== undefined) return answer.data;
  const status = answer.response?.status ?? 0;
  throw new ApiError(status, problemMessage(answer.error, fallback, status));
}

function problemMessage(error: unknown, fallback: string, status: number): string {
  if (error && typeof error === "object") {
    const problem = error as { detail?: unknown; title?: unknown; message?: unknown };
    for (const value of [problem.detail, problem.title, problem.message]) {
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  if (typeof error === "string" && error.trim()) return error;
  return status ? `${fallback} (${status})` : fallback;
}
