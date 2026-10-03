/**
 * Tutor-code brute-force protection (FR-AUTH-007, §14.2.6).
 * Two independent limits over a sliding window:
 *   * per client (hashed IP): stops a single device guessing;
 *   * per code prefix: stops a distributed guess of one tutor's 1,000-code space.
 */
export interface RateLimitPolicy {
  windowMs: number;
  maxFailuresPerClient: number;
  maxFailuresPerPrefix: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitPolicy = {
  windowMs: 15 * 60 * 1000,
  maxFailuresPerClient: 5,
  maxFailuresPerPrefix: 10,
};

export interface FailureCounts {
  client: number;
  prefix: number;
}

export function isBlocked(counts: FailureCounts, policy: RateLimitPolicy = DEFAULT_RATE_LIMIT): boolean {
  return counts.client >= policy.maxFailuresPerClient || counts.prefix >= policy.maxFailuresPerPrefix;
}

export function retryAfterSeconds(policy: RateLimitPolicy = DEFAULT_RATE_LIMIT): number {
  return Math.ceil(policy.windowMs / 1000);
}
