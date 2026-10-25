import { redactDiagnosticText } from "../redaction";
import { LogReadError } from "./types";
const unavailable = () => new LogReadError("unavailable", "Log retrieval exceeded its time or download budget.");
export function clipLogText(value: string, offset: number, maxLines: number, bytes: number) {
  const safe = redactDiagnosticText(value);
  const lines = safe.slice(offset).split("\n");
  const selected = lines.slice(0, maxLines).join("\n");
  let text = "";
  let used = 0;
  for (const char of selected) {
    const size = Buffer.byteLength(char);
    if (used + size > bytes)
      break;
    text += char;
    used += size;
  }
  const end = offset + text.length;
  const nextOffset = text.length === selected.length && end < safe.length && safe[end] === "\n" ? end + 1 : end;
  return {
    text, nextOffset, nextLine: text ? text.split("\n").length : 0, truncated: nextOffset < safe.length
  };
}
export class LogReadBudget {
  private downloaded = 0;
  private output = 0;
  private controller = new AbortController();
  private timer: ReturnType<typeof setTimeout>;
  private readonly limits: {
    responseBytes: number;
    totalBytes: number;
    requestMs: number;
    overallMs: number;
  };
  constructor(private fetchImpl: typeof fetch = fetch, limits: Partial<LogReadBudget["limits"]> = {}) {
    this.limits = {
      responseBytes: 5 * 1024 * 1024, totalBytes: 10 * 1024 * 1024, requestMs: 10000, overallMs: 30000, ...limits
    };
    this.timer = setTimeout(() => this.controller.abort(), this.limits.overallMs);
  }
  get remainingOutput() { return 64 * 1024 - this.output; }
  excerpt(text: string, offset: number, maxLines: number) {
    const result = clipLogText(text, offset, maxLines, this.remainingOutput);
    this.output += Buffer.byteLength(result.text);
    return result;
  }
  close() { clearTimeout(this.timer); this.controller.abort(); }
  async request(url: string, init: RequestInit = {}, tokenProvider?: () => Promise<string>) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    this.controller.signal.addEventListener("abort", abort, { once: true });
    if (this.controller.signal.aborted)
      abort();
    const timer = setTimeout(abort, this.limits.requestMs);
    let rejectAbort: () => void = () => { };
    const aborted = new Promise<never>((_, reject) => { rejectAbort = () => reject(unavailable()); controller.signal.addEventListener("abort", rejectAbort, { once: true }); if (controller.signal.aborted)
      rejectAbort(); });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      return await Promise.race([aborted, (async () => {
          const headers = new Headers(init.headers);
          if (tokenProvider)
            headers.set("Authorization", `Bearer ${await Promise.race([tokenProvider(), aborted])}`);
          if (controller.signal.aborted)
            throw unavailable();
          const response = await this.fetchImpl(url, {
            ...init, headers, redirect: "manual", credentials: "omit", signal: controller.signal
          });
          if (controller.signal.aborted) {
            void response.body?.cancel().catch(() => { });
            throw unavailable();
          }
          const length = Number(response.headers.get("Content-Length") ?? 0);
          if (length > this.limits.responseBytes || length + this.downloaded > this.limits.totalBytes) {
            void response.body?.cancel().catch(() => { });
            throw unavailable();
          }
          reader = response.body?.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;
          if (reader)
            for (;;) {
              const part = await Promise.race([reader.read(), aborted]);
              if (part.done)
                break;
              received += part.value.byteLength;
              this.downloaded += part.value.byteLength;
              if (received > this.limits.responseBytes || this.downloaded > this.limits.totalBytes)
                throw unavailable();
              chunks.push(part.value);
            }
          return {
            status: response.status, headers: response.headers, text: Buffer.concat(chunks).toString("utf8")
          };
        })()]);
    }
    catch (error) {
      controller.abort();
      if (error instanceof LogReadError)
        throw error;
      throw new LogReadError("unavailable", "The provider log request failed.");
    }
    finally {
      clearTimeout(timer);
      this.controller.signal.removeEventListener("abort", abort);
      controller.signal.removeEventListener("abort", rejectAbort);
      if (reader)
        void reader.cancel().catch(() => { });
    }
  }
}
export function checkLogResponse(response: {
  status: number;
}) {
  if (response.status >= 200 && response.status < 300)
    return;
  if ([401, 403].includes(response.status))
    throw new LogReadError("forbidden", "The configured provider identity cannot read these logs.");
  if ([404, 410].includes(response.status))
    throw new LogReadError("not_found", "These logs are not available or have expired.");
  if ([400, 405, 501].includes(response.status))
    throw new LogReadError("unsupported", "This log interface is not supported for the app.");
  throw new LogReadError("unavailable", "The provider could not return these logs.");
}
export function parseLogJson(text: string): unknown {
  try {
    return JSON.parse(text);
  }
  catch {
    throw new LogReadError("unavailable", "The provider returned an unsupported log response.");
  }
}
