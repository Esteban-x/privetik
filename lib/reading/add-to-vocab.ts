import { addWord, createList, fetchLists, isDuplicateWordError } from "@/lib/vocabulary/custom";
import { isQuotaError } from "@/lib/billing/quota-client";

/**
 * Un mot du texte, dans son vocabulaire.
 *
 * LA LECTURE ET LE VOCABULAIRE NE SE PARLAIENT PAS. On croisait шко́ле dans
 * un texte, on touchait le mot, on lisait « école, forme du dictionnaire
 * шко́ла »… et pour le revoir demain, il fallait aller le retaper dans une
 * liste. Un geste suffit maintenant : la forme du dictionnaire, sa
 * traduction, et la PHRASE DU TEXTE comme exemple — c'est elle qui fera la
 * phrase à trous (lib/vocabulary/cloze.ts).
 *
 * Tout passe par la route d'ajout habituelle : accent posé, doublons
 * refusés, classement du mot. Rien n'est réécrit ici.
 */

export const READING_LIST_NAME = "Mes lectures";

export type AddWordState =
  | { status: "adding" }
  | { status: "added" }
  | { status: "duplicate" }
  | { status: "failed"; message: string };

let readingListId: Promise<string> | null = null;

function readingList(): Promise<string> {
  if (!readingListId) {
    readingListId = fetchLists().then(async ({ lists }) => {
      const existing = lists.find((l) => l.name === READING_LIST_NAME);
      return existing ? existing.id : (await createList(READING_LIST_NAME)).list.id;
    });
    // Un échec ne doit pas rester en mémoire : le geste suivant réessaie.
    readingListId.catch(() => {
      readingListId = null;
    });
  }
  return readingListId;
}

export async function addReadingWord(word: {
  ru: string;
  fr: string;
  exampleRu?: string;
  exampleFr?: string;
}): Promise<AddWordState> {
  try {
    const listId = await readingList();
    await addWord(listId, word);
    return { status: "added" };
  } catch (err) {
    if (isDuplicateWordError(err)) return { status: "duplicate" };
    if (isQuotaError(err)) return { status: "failed", message: err.message };
    return { status: "failed", message: "Ajout impossible pour le moment." };
  }
}
