/** Session and sign-in policy. Plain constants so tests and docs can reference them. */

/** Sessions expire this long after creation or the last refresh. */
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours
/**
 * A session older than this is extended (to a fresh TTL) the next time it is used in a
 * Server Action. Page renders never extend a session, so idle sessions always expire.
 */
export const SESSION_REFRESH_AGE_SECONDS = 60 * 60; // 1 hour

/** Sign-in attempts allowed per email address (from any IP) per window. */
export const SIGN_IN_EMAIL_LIMIT = { limit: 5, windowSeconds: 15 * 60 };
/** Sign-in attempts allowed per client IP (across all emails) per window. */
export const SIGN_IN_IP_LIMIT = { limit: 20, windowSeconds: 15 * 60 };
/** Password-change attempts (wrong current password guesses) per user per window. */
export const CHANGE_PASSWORD_LIMIT = { limit: 5, windowSeconds: 15 * 60 };
