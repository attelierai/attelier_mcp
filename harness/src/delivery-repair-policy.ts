export type AttelierDeliveryRepairState = Readonly<{
  attempts: number;
  maximumAttempts: number;
}>;

/** Harness-owned guard for bounded automatic delivery repair.
 *
 * Renderers and UIs may propose a repair, but this policy is the authority
 * that prevents an unbounded critique -> edit -> render loop.
 */
export class AttelierDeliveryRepairPolicy {
  readonly #maximumAttempts: number;
  #attempts = 0;

  constructor(maximumAttempts = 1) {
    if (!Number.isInteger(maximumAttempts) || maximumAttempts < 0) {
      throw new Error("maximumAttempts must be a non-negative integer.");
    }
    this.#maximumAttempts = maximumAttempts;
  }

  state(): AttelierDeliveryRepairState {
    return { attempts: this.#attempts, maximumAttempts: this.#maximumAttempts };
  }

  canBegin(): boolean {
    return this.#attempts < this.#maximumAttempts;
  }

  begin(): boolean {
    if (!this.canBegin()) return false;
    this.#attempts += 1;
    return true;
  }

  reset(): void {
    this.#attempts = 0;
  }
}
