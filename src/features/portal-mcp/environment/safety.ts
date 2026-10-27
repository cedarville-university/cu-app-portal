import { redactDiagnosticText } from "../admin/redaction";

// Conservative safeguards complement the saved isSecret flag. Arbitrary opaque
// credentials incorrectly saved as ordinary values cannot be identified reliably.
export function isSensitiveEnvironmentKey(key: string): boolean {
  return /secret|token|password|passwd|pwd|credential|key|connection.?string|database.?url|authorization|cookie|certificate|(?:^|_)sas(?:_|$)|(?:^|_)sig(?:_|$)/i.test(key);
}

export function isSensitiveEnvironmentValue(value: string): boolean {
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* Inspect the original if malformed. */ }
  return [value, decoded].some(text =>
    redactDiagnosticText(text) !== text ||
    // Connection-string and JSON credential members can lack the key names
    // handled by diagnostic-text redaction (for example SharedAccessKey/Pwd).
    /["']?\b(?:sharedaccesskey|sharedaccesssignature|credential[s]?|pwd|passwd|password)["']?\s*[:=]/i.test(text) ||
    /\bBasic\s+[A-Za-z0-9+/=_-]+/i.test(text) ||
    /-----BEGIN\s|\bsk-[A-Za-z0-9_-]{16,}|\bAKIA[A-Z0-9]{16}\b/i.test(text) ||
    /[?&](?:code|sig|sas|token|access_token|refresh_token|client_secret|api[_-]?key|password|credential|authorization)=/i.test(text),
  );
}
