/**
 * La comparaison à la lettre d'une traduction et de sa référence.
 *
 * Ce qui ne compte pas : la casse, l'accent tonique, ё / е, la ponctuation —
 * et le tiret de la phrase nominale (« Мой брат — врач »), que personne ne
 * tape. Tout le reste compte, y compris l'ordre des mots : une phrase juste
 * mais construite autrement n'est PAS refusée pour autant, elle passe au
 * second avis (app/api/translation/attempt), qui sait qu'en russe l'ordre
 * est libre.
 */
export function normalizeSentence(value: string): string {
  return value
    .toLowerCase()
    .replace(/́/g, "")
    .replace(/ё/g, "е")
    .replace(/[.,!?;:«»"„“”()—–]/g, " ")
    .replace(/(^|\s)-+|-+(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesTranslation(answer: string, reference: string): boolean {
  const given = normalizeSentence(answer);
  return given.length > 0 && given === normalizeSentence(reference);
}
