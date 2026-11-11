// OpenAI token prices for Attelier's paid calls (Atte on GPT models, asset description,
// web access, analysis budgets). Unknown models return undefined rather than a guessed price.
const nonNegativeNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

type OpenAiTokenPrice = {
  input: number;
  cachedInput: number;
  cacheWriteMultiplier: number;
  output: number;
  longContext?: { threshold: number; inputMultiplier: number; outputMultiplier: number };
};

/** USD per one million tokens. This table is deliberately narrow and
 * versioned with the adapter: unknown models remain "unavailable" instead of
 * inventing a price. */
const OPENAI_TOKEN_PRICES: Readonly<Record<string, OpenAiTokenPrice>> = {
  "gpt-5.6-sol": {
    input: 4,
    cachedInput: 0.4,
    cacheWriteMultiplier: 1.25,
    output: 20,
    longContext: { threshold: 272_000, inputMultiplier: 2, outputMultiplier: 1.5 },
  },
  "gpt-5.6-terra": {
    input: 2,
    cachedInput: 0.2,
    cacheWriteMultiplier: 1.25,
    output: 12,
    longContext: { threshold: 272_000, inputMultiplier: 2, outputMultiplier: 1.5 },
  },
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, cacheWriteMultiplier: 1.25, output: 1.2 },
};

export const estimateOpenAiResponsesCost = (input: {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens?: number;
  outputTokens: number;
}): number | undefined => {
  const price = OPENAI_TOKEN_PRICES[input.model];
  if (!price) return undefined;
  const inputTokens = nonNegativeNumber(input.inputTokens);
  const cachedInputTokens = Math.min(inputTokens, nonNegativeNumber(input.cachedInputTokens));
  const cacheWriteInputTokens = Math.min(
    Math.max(0, inputTokens - cachedInputTokens),
    nonNegativeNumber(input.cacheWriteInputTokens),
  );
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens - cacheWriteInputTokens);
  const outputTokens = nonNegativeNumber(input.outputTokens);
  const longContext = price.longContext && inputTokens > price.longContext.threshold
    ? price.longContext
    : undefined;
  const inputMultiplier = longContext?.inputMultiplier ?? 1;
  const outputMultiplier = longContext?.outputMultiplier ?? 1;
  return (
    uncachedInputTokens * price.input * inputMultiplier +
    cachedInputTokens * price.cachedInput * inputMultiplier +
    cacheWriteInputTokens * price.input * price.cacheWriteMultiplier * inputMultiplier +
    outputTokens * price.output * outputMultiplier
  ) / 1_000_000;
};
