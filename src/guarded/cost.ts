/**
 * Cost accounting in integer micro-USD (1e-6 USD). A run of 40 small calls
 * costs well under a cent each, so cents would round most of them to zero, and
 * floats would drift when summed.
 */

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
};

/**
 * Prices for one model, supplied by the caller. Not hard-coded here: list
 * prices change, and a library that ships last quarter's prices under-reports
 * spend without anyone noticing.
 */
export type ModelRate = {
  /** USD per million input tokens. */
  inputPerMTok: number;
  /** USD per million output tokens. */
  outputPerMTok: number;
  /** Multiplier on the input rate for writing to the prompt cache. */
  cacheWriteMultiplier: number;
  /** Multiplier on the input rate for reading from the prompt cache. */
  cacheReadMultiplier: number;
};

export const EMPTY_USAGE: TokenUsage = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
});

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
  };
}

/**
 * Rounded up, so the ledger can over-report spend but never under-report it.
 * USD per million tokens is the same number as micro-USD per token, so the
 * rates multiply token counts directly.
 */
export function costMicros(rate: ModelRate, usage: TokenUsage): number {
  const micros =
    usage.inputTokens * rate.inputPerMTok +
    usage.cacheCreationInputTokens * rate.inputPerMTok * rate.cacheWriteMultiplier +
    usage.cacheReadInputTokens * rate.inputPerMTok * rate.cacheReadMultiplier +
    usage.outputTokens * rate.outputPerMTok;
  // The epsilon stops float noise (3 * 0.1 = 0.30000000000000004) rounding up a whole micro.
  return Math.ceil(micros - 1e-9);
}

export function formatMicros(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}
