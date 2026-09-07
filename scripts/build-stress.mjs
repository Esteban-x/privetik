/**
 * L'index d'accentuation du module vocabulaire.
 *
 *   npm run build:stress   ->  lib/vocabulary/stress.generated.ts
 *
 * CE QU'IL RÉSOUT. lib/vocabulary/accent.ts pose l'accent tonique sur les
 * mots que l'apprenant ajoute à ses listes. Il a d'abord été branché sur
 * les banques livrées avec l'app — l'index de complétion et les formes des
 * 451 noms du module Cas — et sur une liste de vraies listes d'apprenant il
 * n'accentuait que trois mots sur dix-neuf : « поведе́ние », « существова́ть »,
 * « незави́симый », « большинство́ » n'y sont pas. Les banques couvrent ce que
 * l'app ENSEIGNE, pas ce qu'on lui apporte.
 *
 * DEUX SOURCES, DANS CET ORDRE.
 *
 *   1. LE DICTIONNAIRE OpenRussian — 58 433 mots, toutes formes fléchies,
 *      tous accentués — croisé avec la liste de fréquence ru_50k. Le
 *      croisement n'est pas une économie de place mais un choix de contenu :
 *      les 526 000 formes du dictionnaire pèsent 11 Mo, et leur queue est
 *      faite de mots qu'aucun apprenant n'écrira jamais. Les 50 000 formes
 *      les plus fréquentes du russe écrit, elles, sont exactement ce qu'on
 *      note dans une liste.
 *   2. LES BANQUES DE L'APP, pour ce que le dictionnaire n'a pas et que la
 *      fréquence ne classe pas : le lexique de complétion relu à la main.
 *
 * L'AMBIGUÏTÉ EST MESURÉE SUR LE DICTIONNAIRE COMPLET, avant tout filtre —
 * et c'est le point le plus délicat. « за́мок » (château) et « замо́к »
 * (serrure) partagent la forme nue ; « до́ма » (à la maison) et « дома́ »
 * (des maisons) aussi. Une forme lue de plusieurs façons n'entre pas dans
 * l'index : elle en sort donc non accentuée, ce qui est le résultat voulu.
 * Un accent faux est pire qu'un accent absent — absent, l'apprenant sait
 * qu'il ne sait pas ; faux, il apprend une prononciation erronée avec la
 * même confiance que le reste.
 *
 * IL FAUT LES LIGNES BRUTES pour voir cette ambiguïté : `dict.of(kind)` ne
 * garde que la première entrée d'une forme nue, c'est-à-dire qu'il écarte
 * précisément les homographes qu'on vient chercher. D'où `dict.rows(kind)`.
 *
 * SEUL LE RÉSULTAT EST VERSIONNÉ : les CSV (23 Mo) vivent dans
 * scripts/.cache/, hors dépôt, et se retéléchargent au besoin.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { loadDictionary, accentuate, canonicalForms, FORM_COLUMNS } from "./lib/dictionary.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });
const OUT = path.join(ROOT, "lib", "vocabulary", "stress.generated.ts");
const FREQ = path.join(ROOT, "scripts", ".cache", "ru_50k.txt");

const ACUTE = "\u0301";
/**
 * Le repli de lib/vocabulary/accent.ts, à l'identique : casse et accent
 * seulement. Il GARDE le ё, contrairement à celui du dictionnaire — « все »
 * (tous) et « всё » (tout) sont deux mots, et les replier ensemble ferait
 * poser l'accent de l'un sur l'autre.
 */
const fold = (w) => w.normalize("NFC").split(ACUTE).join("").toLowerCase();

// ── 1. Toutes les lectures du dictionnaire, homographes compris ────────
const dict = await loadDictionary();
const readings = new Map();
for (const kind of Object.keys(FORM_COLUMNS).concat(["others"])) {
  for (const row of dict.rows(kind)) {
    const columns = FORM_COLUMNS[kind] ?? [];
    for (const raw of [row.accented, ...columns.map((c) => row[c])]) {
      for (const variant of canonicalForms(raw)) {
        const accented = accentuate(variant).normalize("NFC");
        if (!accented.includes(ACUTE)) continue;
        const key = fold(accented);
        if (!readings.has(key)) readings.set(key, new Set());
        readings.get(key).add(accented);
      }
    }
  }
}

// ── 2. Ce qui mérite d'être embarqué ───────────────────────────────────
if (!fs.existsSync(FREQ)) {
  console.error(
    `Liste de fréquence absente : ${path.relative(ROOT, FREQ)}\n` +
      "Elle est téléchargée par `npm run build:nouns`."
  );
  process.exit(1);
}
const frequent = new Set(
  fs
    .readFileSync(FREQ, "utf8")
    .split(/\r?\n/)
    .map((line) => line.split(" ")[0])
    .filter(Boolean)
    .map(fold)
);

const kept = new Map(); // repli -> forme accentuée
let ambiguous = 0;
for (const [key, forms] of readings) {
  if (forms.size > 1) {
    ambiguous += 1;
    continue;
  }
  if (!frequent.has(key)) continue;
  kept.set(key, [...forms][0]);
}
const fromDictionary = kept.size;

// ── 3. Les banques de l'app, pour ce que le dictionnaire n'a pas ───────
const { LEXICON } = await jiti.import("../lib/vocabulary/lexicon.generated.ts");
const { NOUNS } = await jiti.import("../lib/grammar/nouns-data.ts");

let fromBanks = 0;
const addBank = (form) => {
  if (!form) return;
  const accented = form.normalize("NFC");
  if (!accented.includes(ACUTE)) return;
  const key = fold(accented);
  if (kept.has(key)) return;
  // Le dictionnaire hésite : la banque ne suffit pas à trancher, puisque
  // c'est le SENS qui décide et qu'une liste n'en porte aucun.
  if ((readings.get(key)?.size ?? 0) > 1) return;
  kept.set(key, accented);
  fromBanks += 1;
};
for (const entry of LEXICON) addBank(entry[0]);
for (const noun of NOUNS) {
  for (const form of noun.forms.singular) addBank(form);
  for (const form of noun.forms.plural) addBank(form);
}

// ── 4. Écriture ────────────────────────────────────────────────────────
//
// UNE SEULE CHAÎNE, découpée à la première demande. Un tableau de 38 000
// littéraux coûterait quatre caractères de guillemets et de virgule par
// entrée — 150 Ko de ponctuation — et donnerait un fichier qu'aucun
// éditeur n'ouvre. La clé n'est pas stockée : elle se déduit de la forme
// en retirant l'accent, ce que fait accent.ts au chargement.
const forms = [...kept.values()].sort((a, b) => (fold(a) < fold(b) ? -1 : 1));
const header = `// GÉNÉRÉ PAR scripts/build-stress.mjs — NE PAS ÉDITER À LA MAIN.
//
// ${forms.length} formes russes accentuées : les plus fréquentes du
// dictionnaire OpenRussian (croisées avec ru_50k), plus les banques de
// l'app. Les homographes en sont ABSENTS — « за́мок » / « замо́к » ne se
// tranchent qu'au contexte, et lib/vocabulary/accent.ts s'en abstient donc
// faute de les trouver ici.
//
// Une seule chaîne, séparée par des espaces : la clé de recherche est la
// forme sans son accent, déduite au chargement (voir accent.ts). Ce module
// est LOURD (~${Math.round(Buffer.byteLength(forms.join(" "), "utf8") / 1024)} Ko) et
// SERVEUR UNIQUEMENT — ne l'importe jamais depuis un composant client.

export const STRESS_FORMS =
`;

fs.writeFileSync(OUT, `${header}  ${JSON.stringify(forms.join(" "))};\n`, "utf8");

console.log(
  `${path.relative(ROOT, OUT)} : ${forms.length} formes ` +
    `(${fromDictionary} du dictionnaire, ${fromBanks} des banques), ` +
    `${ambiguous} homographes écartés, ` +
    `${(fs.statSync(OUT).size / 1024).toFixed(0)} Ko.`
);
