export const ATTE_LANGUAGE_RULE = "Reply in the language of the user's latest message. If it is unclear, use the workspace/UI language (default English). Never switch languages mid-conversation. Tool names, ids and code stay verbatim.";

export type AtteUserLanguage = "English" | "Spanish" | "Russian" | "Chinese" | "Japanese" | "Korean" | "Arabic";

const ENGLISH_WORDS = new Set([
  "a", "and", "are", "cut", "for", "from", "in", "is", "it", "make", "of", "please", "review", "that", "the", "this", "to", "with", "you",
]);
const SPANISH_WORDS = new Set([
  "de", "del", "el", "en", "es", "esta", "este", "la", "las", "los", "para", "por", "que", "revisa", "revisar", "una", "un", "y",
]);

export const detectAtteUserLanguage = (text: string): AtteUserLanguage => {
  if (/\p{Script=Arabic}/u.test(text)) return "Arabic";
  if (/\p{Script=Cyrillic}/u.test(text)) return "Russian";
  if (/\p{Script=Hangul}/u.test(text)) return "Korean";
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return "Japanese";
  if (/\p{Script=Han}/u.test(text)) return "Chinese";

  const words = text.toLocaleLowerCase("en-US").match(/[\p{Script=Latin}]+/gu) ?? [];
  const english = words.reduce((score, word) => score + (ENGLISH_WORDS.has(word) ? 1 : 0), 0);
  const spanish = words.reduce((score, word) => score + (SPANISH_WORDS.has(word) ? 1 : 0), 0)
    + (/[¿¡ñáéíóúü]/iu.test(text) ? 2 : 0);
  return spanish > english ? "Spanish" : "English";
};

export const atteLanguagePrompt = (userLanguage?: AtteUserLanguage): string => [
  ATTE_LANGUAGE_RULE,
  ...(userLanguage ? [`Detected user language: ${userLanguage}. This deterministic hint comes from the user's latest message.`] : []),
].join("\n");

export const withAtteLanguageRule = (prompt: string, userLanguage?: AtteUserLanguage): string => {
  const trimmed = prompt.trim();
  if (trimmed.startsWith(ATTE_LANGUAGE_RULE)) {
    if (!userLanguage) return trimmed;
    const remainder = trimmed
      .slice(ATTE_LANGUAGE_RULE.length)
      .trimStart()
      .replace(/^Detected user language: [^.]+\. This deterministic hint comes from the user's latest message\.\s*/, "");
    return `${atteLanguagePrompt(userLanguage)}\n${remainder}`;
  }
  return `${atteLanguagePrompt(userLanguage)}\n\n${trimmed}`;
};
