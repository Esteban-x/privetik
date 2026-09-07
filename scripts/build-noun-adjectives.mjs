/**
 * L'index « quel adjectif va avec quel nom » — `npm run build:noun-adjectives`.
 *
 * CE QU'IL REPLIE, ET POURQUOI IL EXISTE. La relation nom ↔ adjectif est la
 * seule chose qui manquait pour que le module Cas puisse demander un GROUPE
 * nominal — « но́вой доро́ги » — au lieu d'un nom nu. Elle avait été
 * approchée une fois, par l'animacité grammaticale, et laissait passer une
 * phrase sur trois (« une règle brillante », « un droit cher ») ; c'est ce
 * qui a fait sortir l'accord du module Cas.
 *
 * Elle n'est plus approchée : elle est ÉCRITE, couple par couple, dans les
 * 270 contextes de lib/adjectives. Ce script ne fait que la replier —
 * aucune paire n'est inventée ici, chacune vient d'une phrase qu'un humain
 * a relue.
 *
 * LE REPLI PLUTÔT QUE L'IMPORT DIRECT. Le module Cas pourrait lire les
 * contextes eux-mêmes ; il embarquerait alors 37 Ko de phrases, de
 * traductions et d'explications dont il n'a besoin d'aucune. L'index tient
 * en quelques kilo-octets.
 *
 * LA PAIRE EST INDÉPENDANTE DU CAS, et c'est ce qui la rend réutilisable :
 * un contexte écrit à l'accusatif atteste que « но́вый » qualifie « дом »,
 * ce qui reste vrai au génitif comme au datif. Seule la phrase qui
 * l'entoure était propre à un cas, et cette phrase-là reste là-bas.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });

const { ADJECTIVE_CONTEXTS } = await jiti.import("../lib/adjectives/exercises.ts");
const { ADJECTIVE_CONTEXTS_EXTRA } = await jiti.import("../lib/adjectives/contexts.generated.ts");
const { ADJECTIVES } = await jiti.import("../lib/grammar/adjectives-data.ts");
const { NOUNS } = await jiti.import("../lib/grammar/nouns-data.ts");

const contexts = [];
for (const list of Object.values(ADJECTIVE_CONTEXTS)) contexts.push(...list);
for (const list of Object.values(ADJECTIVE_CONTEXTS_EXTRA)) contexts.push(...list);

const knownAdjectives = new Set(ADJECTIVES.map((a) => a.id));
const knownNouns = new Set(NOUNS.map((n) => n.id));

// Un couple dont l'un des deux membres a quitté sa banque est une erreur
// SILENCIEUSE : l'index le porterait, le tirage le proposerait, et
// `getNoun` rendrait `undefined` au milieu d'un exercice.
const orphans = [];
const index = new Map();
for (const c of contexts) {
  if (!knownAdjectives.has(c.adjective) || !knownNouns.has(c.noun)) {
    orphans.push(`${c.id} : ${c.adjective} + ${c.noun}`);
    continue;
  }
  if (!index.has(c.noun)) index.set(c.noun, new Set());
  index.get(c.noun).add(c.adjective);
}
if (orphans.length) {
  console.error("Couples orphelins (adjectif ou nom absent de sa banque) :");
  for (const o of orphans) console.error("  " + o);
  process.exit(1);
}

const nounIds = [...index.keys()].sort();
const pairs = nounIds.reduce((n, id) => n + index.get(id).size, 0);
const body = nounIds
  .map((id) => `  ${JSON.stringify(id)}: [${[...index.get(id)].sort().map((a) => JSON.stringify(a)).join(", ")}],`)
  .join("\n");

const out = `// Généré par scripts/build-noun-adjectives.mjs — ne pas éditer à la main.
//
// « Quel adjectif peut qualifier ce nom », replié depuis les ${contexts.length} contextes
// écrits à la main de lib/adjectives. Aucune paire n'est inventée : chacune
// vient d'une phrase relue. C'est cette relation qui manquait au module Cas
// pour composer un groupe nominal sans retomber dans l'à-peu-près qui l'en
// avait fait sortir — voir l'en-tête du script.
//
// ${nounIds.length} noms, ${pairs} couples.

export const NOUN_ADJECTIVES: Record<string, string[]> = {
${body}
};
`;

const target = path.join(ROOT, "lib/grammar/noun-adjectives.generated.ts");
fs.writeFileSync(target, out, "utf8");
console.log(`noun-adjectives.generated.ts : ${nounIds.length} noms, ${pairs} couples.`);
