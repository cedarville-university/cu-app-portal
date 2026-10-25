/** Pattern redaction is a safeguard, not a guarantee that arbitrary application logs contain no sensitive data. */
export function redactDiagnosticText(value: string): string {
  return value
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted private key]")
    .replace(/\b(Authorization\s*:\s*)(?:Bearer|Basic)\s+[^\r\n]+/gi, "$1[redacted]")
    .replace(/\b(AccountKey|SharedAccessSignature|Pwd|Password)\s*=\s*(?:"(?:[^"\r\n]|"")*"|'(?:[^'\r\n]|'')*'|[^;\r\n]*)(?:;|$)/gi, "$1=[redacted];")
    .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [redacted]")
    .replace(/(["']?\b(?:[\w.-]*(?:secret|token|password|passwd|api[_-]?key|signature|authorization|connection[_-]?string|database[_-]?url)|sig)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&]+)(?:;[^\r\n]*)?/gi, "$1[redacted]")
    .replace(/\b([a-z][a-z\d+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, "$1[redacted]@")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, "[redacted]");
}
