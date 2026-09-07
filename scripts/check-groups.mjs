/**
 * Le groupe nominal du module Cas — `npm run check:groups`.
 *
 * CE QU'IL GARDE. Demander « но́вой доро́ги » plutôt que « доро́ги » ajoute
 * trois façons de se tromper, et aucune ne se voit depuis les contrôles
 * existants : ils portent sur `declineNoun` et `declineAdjective` pris
 * séparément, or c'est leur ASSEMBLAGE qui est neuf.
 *
 *   1. Un couple qui n'a jamais été relu. C'est le défaut qui avait fait
 *      sortir l'accord de ce module — « une règle brillante », une phrase
 *      sur trois — et la seule protection est que chaque paire vienne des
 *      contextes écrits à la main. Le contrôle 1 le vérifie paire par paire.
 *   2. Un accord faux DANS L'ÉNONCÉ. La forme de dictionnaire d'un adjectif
 *      est son masculin : affichée telle quelle devant « письмо́ », elle
 *      donnerait « ста́рый письмо́ » à copier — une faute dans l'énoncé de
 *      l'exercice qui apprend à ne pas la faire.
 *   3. Un français qui ne s'accorde pas au nom FRANÇAIS. « кни́га » est
 *      féminin en russe et sa traduction « livre » masculine : le groupe
 *      s'écrit « ce vieux livre ». Se tromper de langue de référence est
 *      l'erreur naturelle ici.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });

const { NOUN_ADJECTIVES } = await jiti.import("../lib/grammar/noun-adjectives.generated.ts");
const { ADJECTIVES, getAdjective } = await jiti.import("../lib/grammar/adjectives-data.ts");
const { getNoun } = await jiti.import("../lib/grammar/nouns-data.ts");
const { declineAdjective } = await jiti.import("../lib/grammar/decline-adjective.ts");
const { declineNoun } = await jiti.import("../lib/grammar/decline.ts");
const { frenchNounPhrase } = await jiti.import("../lib/grammar/french-article.ts");
const { ADJECTIVE_CONTEXTS } = await jiti.import("../lib/adjectives/exercises.ts");
const { ADJECTIVE_CONTEXTS_EXTRA } = await jiti.import("../lib/adjectives/contexts.generated.ts");
const G = await jiti.import("../lib/grammar/exercise-generator.ts");

const CASES = ["nominative", "genitive", "dative", "accusative", "instrumental", "prepositional"];

const failures = [];
let checks = 0;
function expect(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

// ─── 1. Chaque couple vient d'un contexte relu, et rien d'autre ────
//
// L'index est REPLIÉ, jamais écrit : le recalculer ici et le comparer au
// fichier généré est la seule façon de savoir qu'il n'a pas dérivé — un
// couple ajouté à la main y passerait sinon inaperçu, avec exactement le
// statut d'une paire relue qu'il n'a pas.
const fromContexts = new Map();
const contexts = [];
for (const list of Object.values(ADJECTIVE_CONTEXTS)) contexts.push(...list);
for (const list of Object.values(ADJECTIVE_CONTEXTS_EXTRA)) contexts.push(...list);
for (const c of contexts) {
  if (!fromContexts.has(c.noun)) fromContexts.set(c.noun, new Set());
  fromContexts.get(c.noun).add(c.adjective);
}

expect(
  Object.keys(NOUN_ADJECTIVES).length === fromContexts.size,
  `l'index porte ${Object.keys(NOUN_ADJECTIVES).length} noms, les contextes en attestent ` +
    `${fromContexts.size} — relancer npm run build:noun-adjectives`
);
for (const [nounId, adjIds] of Object.entries(NOUN_ADJECTIVES)) {
  const attested = fromContexts.get(nounId);
  expect(attested !== undefined, `« ${nounId} » est dans l'index sans qu'aucun contexte ne l'atteste`);
  expect(getNoun(nounId) !== undefined, `« ${nounId} » n'est pas dans la banque de noms`);
  for (const adjId of adjIds) {
    expect(getAdjective(adjId) !== undefined, `« ${adjId} » n'est pas dans la banque d'adjectifs`);
    expect(
      attested !== undefined && attested.has(adjId),
      `couple « ${adjId} + ${nounId} » : aucun contexte écrit ne l'atteste`
    );
  }
}

// ─── 2. Les formes françaises sont complètes ───────────────────────
const HAS_VOWEL_FORM = new Set(["krasivyy", "novyy", "staryy"]);
for (const adj of ADJECTIVES) {
  const fr = adj.fr ?? {};
  for (const key of ["m", "f", "mp", "fp"]) {
    expect(
      typeof fr[key] === "string" && fr[key].length > 0,
      `${adj.lemmaM} : forme française « ${key} » manquante`
    );
  }
  expect(typeof fr.before === "boolean", `${adj.lemmaM} : place française non décidée`);
  // « bel », « nouvel », « vieil » : trois, pas deux, pas quatre. Un
  // quatrième ajouté par distraction produirait « un jolil hôtel ».
  expect(
    HAS_VOWEL_FORM.has(adj.id) === (fr.mVowel !== undefined),
    `${adj.lemmaM} : forme devant voyelle ${fr.mVowel ? "en trop" : "manquante"}`
  );
}

// ─── 3. Les deux moitiés du groupe tiennent debout ─────────────────
//
// 127 couples × 6 cas × 2 nombres. Ce que ça attrape : une moitié vide, ou
// une forme qui contient déjà un espace — auquel cas le groupe cesserait
// d'avoir exactement deux mots et la correction ne comparerait plus la
// même chose que l'affichage.
for (const [nounId, adjIds] of Object.entries(NOUN_ADJECTIVES)) {
  const noun = getNoun(nounId);
  if (!noun) continue;
  for (const adjId of adjIds) {
    const adj = getAdjective(adjId);
    if (!adj) continue;
    for (const kase of CASES) {
      for (const plural of [false, true]) {
        const a = declineAdjective(adj, kase, noun.gender, plural, noun.animacy);
        const n = declineNoun(noun, kase, plural);
        expect(
          a.form.length > 0 && n.form.length > 0 && !a.form.includes(" ") && !n.form.includes(" "),
          `${adjId}+${nounId} ${kase} : moitié vide ou déjà espacée`
        );
      }
    }
  }
}

// ─── 4. L'énoncé montre un groupe ACCORDÉ ──────────────────────────
//
// Le défaut visé : « ста́рый письмо́ » au lieu de « ста́рое письмо́ ». Il ne
// se voit que sur les noms dont le genre n'est pas masculin, d'où le
// décompte par genre : un tirage qui ne sortirait que du masculin
// laisserait ce contrôle passer sans rien prouver.
const byGender = { masculine: 0, feminine: 0, neuter: 0 };
for (let i = 0; i < 400; i += 1) {
  const kase = CASES[i % CASES.length];
  const ex = G.generateIsolatedExercise(kase, i % 2 === 0, undefined, true);
  if (!ex.adjective) continue;
  byGender[ex.noun.gender] += 1;
  const nom = declineAdjective(ex.adjective, "nominative", ex.noun.gender, false, ex.noun.animacy);
  expect(
    ex.promptRu === `${nom.accented} ${ex.noun.forms.singular[0]}`,
    `énoncé non accordé : « ${ex.promptRu} » (attendu « ${nom.accented} ${ex.noun.forms.singular[0]} »)`
  );
  const a = declineAdjective(ex.adjective, ex.targetCase, ex.noun.gender, ex.plural, ex.noun.animacy);
  const n = declineNoun(ex.noun, ex.targetCase, ex.plural);
  expect(
    ex.correctForm === `${a.form} ${n.form}`,
    `réponse attendue incohérente : « ${ex.correctForm} »`
  );
}
for (const gender of ["masculine", "feminine", "neuter"]) {
  expect(byGender[gender] > 0, `aucun groupe tiré au genre ${gender} — le contrôle 4 ne prouve rien`);
}

// ─── 5. Le QCM reste jouable ───────────────────────────────────────
//
// Quatre boutons DISTINCTS dont la bonne réponse. Sur un groupe, la bonne
// réponse fait deux mots : si les distracteurs n'en faisaient qu'un, elle
// se reconnaîtrait à sa longueur sans lire le russe.
for (let i = 0; i < 200; i += 1) {
  const kase = CASES[i % CASES.length];
  const ex = G.generateMcqExercise(kase, undefined, undefined, i % 2 === 0, true);
  expect(ex.options.length === 4, `QCM ${kase} : ${ex.options.length} options au lieu de 4`);
  expect(new Set(ex.options).size === 4, `QCM ${kase} : options en double — ${ex.options.join(" / ")}`);
  expect(ex.options.includes(ex.correctForm), `QCM ${kase} : la bonne réponse n'est pas proposée`);
  if (!ex.adjective) continue;
  expect(
    ex.options.every((o) => o.split(" ").length === 2),
    `QCM ${kase} : la bonne réponse se repère à sa longueur — ${ex.options.join(" / ")}`
  );
}

// ─── 6. Le français s'accorde au nom FRANÇAIS, et se place ─────────
//
// Cas écrits, pas tirés : chacun porte un piège nommé.
const FRENCH = [
  // « книга » féminin russe, « livre » masculin français : « ce vieux livre ».
  ["kniga", "staryy", "demonstrative", false, "ce vieux livre"],
  // « город » masculin russe, « ville » féminin français.
  ["gorod", "bolshoy", "demonstrative", false, "cette grande ville"],
  // Adjectif postposé.
  ["yazyk", "russkiy", "demonstrative", false, "cette langue russe"],
  // Voyelle : « vieil » — et l'article qui recule devant l'adjectif
  // antéposé (« ce vieil arbre », jamais « cet »).
  ["derevo", "staryy", "demonstrative", false, "ce vieil arbre"],
  // Pluriel, des deux côtés.
  ["dom", "novyy", "demonstrative", true, "ces nouvelles maisons"],
  // Article indéfini.
  ["kniga", "novyy", "indefinite", false, "un nouveau livre"],
  // Sans article : le groupe nu, tel qu'il apparaît dans l'énoncé isolé.
  ["doroga", "novyy", "none", false, "nouvelle route"],
];
for (const [nounId, adjId, article, plural, expected] of FRENCH) {
  const noun = getNoun(nounId);
  const adj = getAdjective(adjId);
  if (!noun || !adj) {
    expect(false, `contrôle français : ${nounId} ou ${adjId} absent de sa banque`);
    continue;
  }
  const got = frenchNounPhrase(noun.translation, noun.frenchGender, article, plural, adj);
  expect(got === expected, `français : « ${got} » (attendu « ${expected} »)`);
}

// ─── 7. Le nom nu n'a pas changé ───────────────────────────────────
//
// La régression la plus coûteuse serait silencieuse : un exercice SANS
// adjectif qui se mettrait à en porter un, ou qui perdrait sa forme.
for (let i = 0; i < 200; i += 1) {
  const kase = CASES[i % CASES.length];
  const ex = G.generateIsolatedExercise(kase, i % 2 === 0, undefined, false);
  expect(ex.adjective === undefined, `nom nu demandé, adjectif reçu : ${ex.promptRu}`);
  expect(
    ex.correctForm === declineNoun(ex.noun, ex.targetCase, ex.plural).form,
    `nom nu : forme inattendue « ${ex.correctForm} »`
  );
}

if (failures.length) {
  console.error(`✗ ${failures.length} échec(s) sur ${checks} contrôles :`);
  for (const f of failures.slice(0, 25)) console.error("  " + f);
  if (failures.length > 25) console.error(`  … et ${failures.length - 25} autres`);
  process.exit(1);
}
const pairs = Object.values(NOUN_ADJECTIVES).reduce((n, l) => n + l.length, 0);
console.log(`✓ ${checks} contrôles passés.`);
console.log(`  ${pairs} couples adjectif + nom, tous attestés par un contexte écrit à la main.`);
