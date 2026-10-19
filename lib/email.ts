/**
 * Email normalisation policy, applied everywhere an email enters the system
 * (sign-in, user creation, CLI commands) so that lookups and the unique index agree:
 *
 * 1. Trim surrounding whitespace.
 * 2. Unicode NFC normalisation, so visually identical addresses compare equal.
 * 3. Lower-case the whole address.
 *
 * Lower-casing the local part is technically lossy (RFC 5321 allows case-sensitive
 * local parts) but no mainstream provider relies on it, and it prevents duplicate
 * accounts that differ only by case. Provider-specific rules (dots, +tags) are
 * deliberately NOT applied: they are not universal.
 */
export function normaliseEmail(email: string): string {
  return email.trim().normalize("NFC").toLowerCase();
}
