import type { LookupResult, WordCardHost } from "./host.js";

/**
 * Ask one host, and fall back to another when it has no answer.
 *
 * The case this exists for is the browser extension: look a word up in the
 * offline pack, and reach for the API only when the pack does not have it (or
 * is not installed yet). A reader gets the offline speed of the pack and the
 * coverage of the server, and the card is not told which one answered.
 *
 * Everything other than lookup comes from the primary, because the fallback is
 * about where DEFINITIONS come from and not about whose account is in play: a
 * save must not quietly go somewhere else because a lookup missed.
 */
export function withFallback(primary: WordCardHost, fallback: WordCardHost): WordCardHost {
  // `pending` is the primary saying "ask me again shortly", so it is answered by
  // waiting rather than by going elsewhere: an installing pack is about to be
  // the better answer. Only a miss or a failure moves on.
  const escalate = async (
    first: () => Promise<LookupResult>,
    second: () => Promise<LookupResult>,
  ): Promise<LookupResult> => {
    const result = await first();
    if (result.status === "pending" || result.status === "unavailable") return result;
    if (result.status === "found" && result.definition) return result;
    const secondary = await second();
    // A miss from both is a miss, not an error: the word is simply not there.
    if (secondary.status === "failed" && result.status === "found") return result;
    return secondary;
  };

  return {
    ...primary,
    lookup: (query, kind, context) => escalate(() => primary.lookup(query, kind, context), () => fallback.lookup(query, kind, context)),
    lookupEntry: (entry, surface) => escalate(() => primary.lookupEntry(entry, surface), () => fallback.lookupEntry(entry, surface)),
  };
}
