import { STRESS_FORMS } from "./stress.generated";

/**
 * L'accent tonique posé sur un mot qui entre dans une liste — SANS JAMAIS
 * LE DEVINER.
 *
 * ⚠ SERVEUR UNIQUEMENT. L'index pèse 694 Ko ; l'importer depuis un
 * composant client l'expédierait au navigateur. Il n'a pas à y aller :
 * l'accent se pose une fois, à l'ajout du mot (app/api/vocab/words), et
 * voyage ensuite dans la donnée.
 *
 * POURQUOI LE MODULE VOCABULAIRE EN MANQUAIT. Les deux chemins qui
 * CONNAISSENT l'accent le perdaient au dernier mètre. La complétion et
 * /api/vocab/suggest rendent bien « приве́т » ; mais le formulaire ne
 * réécrit jamais le champ que l'apprenant a rempli lui-même — et il a
 * raison, écraser sa saisie serait le contraire de « garde la tienne ».
 * Celui qui tapait son mot en entier l'enregistrait donc nu, et perdait du
 * même coup sa translittération, qui se déduit DE l'accent (voir
 * transliterate.ts : sans lui aucune réduction vocalique n'est appliquée,
 * et « хорошо́ » ne peut pas donner « kharacho »).
 *
 * L'ACCENT N'EST PAS UNE CORRECTION, et c'est ce qui autorise à le poser
 * après coup. Il n'ajoute aucune lettre et ne change aucun mot : replié, le
 * résultat est exactement ce que l'apprenant a tapé — c'est la définition
 * même de wordKey (voir duplicate.ts), pour qui кни́га et книга sont la même
 * entrée de liste. Le mot reste le sien ; il gagne sa lecture.
 *
 * UN ACCENT FAUX EST PIRE QU'UN ACCENT ABSENT : absent, l'apprenant sait
 * qu'il ne sait pas ; faux, il apprend une prononciation erronée avec la
 * même confiance que le reste. D'où trois abstentions.
 *
 *   1. LE MOT EST INCONNU de l'index (voir scripts/build-stress.mjs : les
 *      formes les plus fréquentes du dictionnaire, plus les banques).
 *   2. LE MOT EST AMBIGU. « за́мок » (château) et « замо́к » (serrure),
 *      « до́ма » (à la maison) et « дома́ » (des maisons), « бо́льшая » et
 *      « больша́я » : seul le contexte tranche, et il faut un humain. Ces
 *      6 429 homographes sont ABSENTS de l'index, donc introuvables ici —
 *      l'abstention est acquise par construction plutôt que vérifiée à
 *      l'exécution. C'est le point qu'un index bâti sur nos seules banques
 *      ratait : elles ne peuvent pas hésiter sur ce qu'elles ignorent, et
 *      « за́мок » y figurant seul, le château aurait soufflé son accent à
 *      la serrure.
 *   3. L'ORTHOGRAPHE DIFFÈRE D'UN Ё. « все » (tous) et « всё » (tout) sont
 *      deux mots ; poser l'accent de l'un sur l'autre les confondrait —
 *      exactement ce que wordKey refuse de faire.
 *
 * Le monosyllabe, lui, n'a rien à marquer : l'accent y est forcé, et le
 * noter alourdirait la lecture sans rien apprendre.
 */

const ACUTE = "\u0301";
const VOWELS = /[аеёиоуыэюяАЕЁИОУЫЭЮЯ]/g;

/** Casse et accent tonique mis de côté ; ё reste distinct de е (voir 3). */
function fold(word: string): string {
  return word.normalize("NFC").split(ACUTE).join("").toLowerCase();
}

function vowelCount(word: string): number {
  return (word.match(VOWELS) ?? []).length;
}

/**
 * « forme repliée -> forme accentuée », construit à la première demande.
 *
 * Le fichier généré ne stocke QUE les formes accentuées : la clé s'en
 * déduit, et la stocker aurait doublé un fichier déjà lourd. Le découpage
 * de 37 499 mots prend quelques millisecondes, une fois par processus.
 */
let index: Map<string, string> | null = null;

function stressIndex(): Map<string, string> {
  if (index) return index;
  const built = new Map<string, string>();
  for (const form of STRESS_FORMS.split(" ")) built.set(fold(form), form);
  index = built;
  return built;
}

/** Le mot porte-t-il déjà son accent ? */
export function hasStress(text: string): boolean {
  return text.normalize("NFC").includes(ACUTE);
}

/** Le mot sans son accent tonique — la graphie qu'on tape au clavier. */
export function stripStress(text: string): string {
  return text.normalize("NFC").split(ACUTE).join("");
}

/**
 * Pose l'accent tonique sur le russe d'un texte, mot par mot. Ce qui n'est
 * pas décidable ressort tel quel : la fonction ne signale rien et ne lève
 * jamais — au pire, elle rend son entrée.
 */
export function accentRu(text: string): string {
  if (!text) return text;
  const idx = stressIndex();

  return text.normalize("NFC").replace(/[а-яёА-ЯЁ][а-яёА-ЯЁ\u0301]*/g, (word) => {
    if (hasStress(word) || vowelCount(word) < 2) return word;

    const found = idx.get(fold(word));
    // Le repli garde le ё : deux graphies qui diffèrent d'autre chose que
    // de l'accent ne sont pas le même mot.
    if (!found || stripStress(found).toLowerCase() !== word.toLowerCase()) return word;

    // La majuscule vient du mot d'origine — un prénom reste un prénom, et
    // l'index est tout en minuscules.
    return word[0] === word[0].toUpperCase() ? found[0].toUpperCase() + found.slice(1) : found;
  });
}
