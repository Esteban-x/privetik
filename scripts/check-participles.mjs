/**
 * Contrôles du module « participes et gérondifs » — `npm run check:participles`.
 *
 * Trois risques, dont un propre à ce module :
 *
 * 1. LES FORMES. Elles suivent des règles… qui ont toutes leurs exceptions
 *    (шедший, живущий, придя). Table de référence relue à la main.
 * 2. LES TROUS RÉELS. Un intransitif n'a pas de participe passif, писа́ть
 *    n'a pas de gérondif imperfectif usuel. Ces trous sont déclarés, et un
 *    exercice ne doit JAMAIS demander une forme absente — sinon il exige
 *    une réponse qui n'existe pas.
 * 3. L'ACCORD. Le participe long s'accorde comme un adjectif : une erreur
 *    d'accord dans la donnée enseigne une forme fautive en silence.
 */
import { createJiti } from "jiti";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "./lib/cyrillic.mjs";
import { practiceInvariants } from "./lib/practice-invariants.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });
const V = await jiti.import("../lib/participles/verbs.ts");
const X = await jiti.import("../lib/participles/exercises.ts");

const failures = [];
let checks = 0;
function require_(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

// L'accent tonique combinant fait partie des formes depuis que la banque
// est accentuée.
const CYRILLIC = /^[а-яёА-ЯЁ\u0301]+$/;
const stripAccent = (f) => f.replace(/\u0301/g, "");

// ─── 1. Formes : table de référence ────────────────────────────────
// [actif présent, actif passé imp., actif passé perf., passif passé,
//  gérondif imp., gérondif perf.] — null = trou réel de la langue.
const EXPECTED = {
  читать: ["читающий", "читавший", "прочитавший", "прочитанный", "читая", "прочитав"],
  писать: ["пишущий", "писавший", "написавший", "написанный", null, "написав"],
  строить: ["строящий", "строивший", "построивший", "построенный", "строя", "построив"],
  открывать: ["открывающий", "открывавший", "открывший", "открытый", "открывая", "открыв"],
  закрывать: ["закрывающий", "закрывавший", "закрывший", "закрытый", "закрывая", "закрыв"],
  делать: ["делающий", "делавший", "сделавший", "сделанный", "делая", "сделав"],
  решать: ["решающий", "решавший", "решивший", "решённый", "решая", "решив"],
  получать: ["получающий", "получавший", "получивший", "полученный", "получая", "получив"],
  готовить: ["готовящий", "готовивший", "приготовивший", "приготовленный", "готовя", "приготовив"],
  изучать: ["изучающий", "изучавший", "изучивший", "изученный", "изучая", "изучив"],
  заканчивать: [
    "заканчивающий", "заканчивавший", "закончивший", "законченный", "заканчивая", "закончив",
  ],
  говорить: ["говорящий", "говоривший", "сказавший", "сказанный", "говоря", "сказав"],
  работать: ["работающий", "работавший", null, null, "работая", null],
  жить: ["живущий", "живший", null, null, "живя", null],
  возвращаться: [
    "возвращающийся", "возвращавшийся", "вернувшийся", null, "возвращаясь", "вернувшись",
  ],
  помогать: ["помогающий", "помогавший", "помогший", null, "помогая", null],
  идти: ["идущий", "шедший", "пришедший", null, null, "придя"],
};

const SHORT_ENDINGS = { m: "", f: "а", n: "о", pl: "ы" };

const ids = new Set();
for (const verb of V.PARTICIPLE_VERBS) {
  require_(!ids.has(verb.id), `identifiant en double : ${verb.id}`);
  ids.add(verb.id);
  const expected = EXPECTED[stripAccent(verb.imperfective)];
  if (!expected) {
    failures.push(`${verb.imperfective} absent de la table de référence de check-participles.mjs`);
    continue;
  }
  const got = [
    verb.activePresent,
    verb.activePastImp,
    verb.activePastPerf ?? null,
    verb.passivePast ?? null,
    verb.gerundImp ?? null,
    verb.gerundPerf ?? null,
  ];
  const labels = [
    "actif présent", "actif passé imp.", "actif passé perf.",
    "passif passé", "gérondif imp.", "gérondif perf.",
  ];
  // La table témoin garde l'ORTHOGRAPHE ; l'accent est vérifié à part
  // (présent, sur une voyelle, unique), parce que les participes ne
  // figurent pas dans le dictionnaire et qu'aucune source ne peut trancher
  // à notre place.
  got.forEach((form, i) => {
    require_(
      (form === null ? null : stripAccent(form)) === expected[i],
      `${verb.imperfective} : ${labels[i]} « ${form ?? "—"} » au lieu de « ${expected[i] ?? "—"} »`
    );
    if (form !== null) {
      require_(CYRILLIC.test(form), `${verb.imperfective} : « ${form} » hors alphabet cyrillique`);
    }
  });

  // Un intransitif ne peut pas avoir de participe passif : ce serait une
  // forme inventée, exactement le genre de chose que ce module refuse.
  require_(
    verb.transitive || verb.passivePast === undefined,
    `${verb.imperfective} est intransitif mais porte un participe passif « ${verb.passivePast} »`
  );
  require_(
    (verb.passivePast === undefined) === (verb.passiveShort === undefined),
    `${verb.imperfective} : forme longue et forme courte doivent être présentes ou absentes ensemble`
  );
  if (verb.passiveShort) {
    // La forme courte masculine sert de radical aux trois autres. Une seule
    // alternance est légitime : quand le masculin porte un ё accentué
    // (решён), l'accent passe à la désinence dans les autres formes et le ё
    // redevient е — решена́, решено́, решены́. Tout autre écart est une
    // coquille.
    const base = verb.passiveShort.m;
    const unstressed = base.replace(/ё(?=[^ё]*$)/, "е");
    for (const [key, ending] of Object.entries(SHORT_ENDINGS)) {
      const got = verb.passiveShort[key];
      // Comparaison sans accent : la place de l'accent bouge justement dans
      // cette alternance (решён -> решена́) et aucune source ne peut la
      // trancher ici. Elle est vérifiée à part : présente, sur une voyelle,
      // et unique.
      const bare = stripAccent(got);
      require_(
        bare === stripAccent(base) + ending || bare === stripAccent(unstressed) + ending,
        `${verb.imperfective} : forme courte « ${got} » incohérente avec « ${base} »`
      );
    }
  }
}
require_(
  V.PARTICIPLE_VERBS.length >= 12,
  `seulement ${V.PARTICIPLE_VERBS.length} verbes dans la banque`
);
require_(
  V.PARTICIPLE_VERBS.some((v) => !v.transitive),
  "aucun verbe intransitif : le trou du participe passif ne serait jamais illustré"
);

// ─── 2. Accord de la forme longue ──────────────────────────────────
const AGREE = [
  ["прочитанный", "f", "прочитанная"],
  ["прочитанный", "n", "прочитанное"],
  ["прочитанный", "pl", "прочитанные"],
  ["открытый", "f", "открытая"],
  ["решённый", "pl", "решённые"],
];
for (const [long, agreement, expected] of AGREE) {
  require_(
    X.agree(long, agreement) === expected,
    `accord : ${long} + ${agreement} donne « ${X.agree(long, agreement)} » au lieu de « ${expected} »`
  );
}

// ─── 3. Contextes : un verbe, une forme qui existe ─────────────────
const CONTEXT_SETS = [
  ["actif", X.ACTIVE_CONTEXTS, (c, v) => (c.tense === "present" ? v.activePresent : v.activePastImp)],
  ["passif", X.PASSIVE_CONTEXTS, (c, v) => v.passivePast],
  ["forme courte", X.SHORT_CONTEXTS, (c, v) => (v.passivePast && v.passiveShort ? "ok" : undefined)],
  ["gérondif", X.GERUND_CONTEXTS, (c, v) => (c.aspect === "imperfective" ? v.gerundImp : v.gerundPerf)],
];
for (const [label, contexts, required] of CONTEXT_SETS) {
  const seen = new Set();
  for (const c of contexts) {
    require_(!seen.has(c.id), `${label} : identifiant en double « ${c.id} »`);
    seen.add(c.id);
    const verb = V.getVerb(c.verb);
    require_(verb !== undefined, `${label} / ${c.id} : verbe « ${c.verb} » inconnu`);
    if (!verb) continue;
    // Le cœur du contrôle : ne jamais demander une forme que la langue n'a pas.
    require_(
      required(c, verb) !== undefined && required(c, verb) !== null,
      `${label} / ${c.id} : « ${verb.imperfective} » n'a pas la forme demandée`
    );
    require_(c.why.trim().length > 20, `${label} / ${c.id} : justification absente ou trop courte`);
    require_(c.fr.trim().length > 0, `${label} / ${c.id} : phrase française manquante`);
  }
  require_(contexts.length >= 5, `${label} : seulement ${contexts.length} contextes`);
}

// LE GÉRONDIF EST LE MÊME DANS LES TROIS PHRASES. C'est ce qui fait que la
// question porte sur la règle du sujet : les trois propositions s'ouvrent
// pareil, et seule la suite les sépare. Qu'une seule s'ouvre autrement, et on
// choisit sur les premiers mots sans avoir cherché le sujet de quoi que ce
// soit — l'exercice serait réussi et la règle jamais rencontrée.
const gerundClause = (sentence) => sentence.slice(0, sentence.indexOf(",") + 1);

const subjectIds = new Set();
for (const item of X.SUBJECT_ITEMS) {
  require_(item.wrong.length >= 2, `sujet unique / ${item.id} : il faut au moins deux distracteurs`);
  require_(
    !item.wrong.includes(item.correct),
    `sujet unique / ${item.id} : la bonne réponse figure aussi parmi les fautives`
  );
  require_(item.why.trim().length > 20, `sujet unique / ${item.id} : justification trop courte`);
  require_(item.fr.trim().length > 0, `sujet unique / ${item.id} : phrase française manquante`);
  require_(
    !subjectIds.has(item.id),
    `sujet unique / ${item.id} : identifiant en double — le correcteur n'en trouverait qu'un`
  );
  subjectIds.add(item.id);

  const opening = gerundClause(item.correct);
  require_(
    opening.length > 0,
    `sujet unique / ${item.id} : la bonne réponse n'a pas de proposition au gérondif (pas de virgule)`
  );
  for (const wrong of item.wrong) {
    require_(
      gerundClause(wrong) === opening,
      `sujet unique / ${item.id} : « ${wrong} » ne s'ouvre pas sur « ${opening} » — ` +
        `le gérondif doit être le même partout, sinon on répond sur les premiers mots`
    );
  }
}
require_(
  X.SUBJECT_ITEMS.length >= 12,
  `sujet unique : seulement ${X.SUBJECT_ITEMS.length} items, une séance en fait le tour`
);

// L'EXPLICATION NE PEUT PAS DÉSIGNER UNE PHRASE PAR SON RANG. Les options
// sont mélangées à chaque tirage : « dans la deuxième phrase, le sujet est
// друзья » désigne, une fois sur trois, la bonne réponse. L'explication
// s'affiche APRÈS le choix, au moment précis où l'apprenant cherche à
// comprendre, et elle le renvoie alors à une phrase au hasard.
//
// Le défaut ne se voyait sur aucun contrôle — le texte est présent, assez
// long, et l'exercice se corrige juste. Il ne se voit qu'à la lecture, et
// seulement si on pense au mélange. Une explication cite donc la phrase.
{
  // Le texte est plié en ASCII avant l'essai : « deuxieme ». Un accent peut
  // s'écrire précomposé (U+00E8) ou décomposé (e + U+0300) selon l'outil qui
  // a produit le fichier, et un motif qui nomme « è » en rate donc la moitié
  // — c'est exactement comme ça que ce contrôle est né muet.
  const fold = (text) =>
    text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const POSITIONAL = /\b(?:premiere?|deuxieme|seconde?|troisieme|quatrieme|derniere?)\b/;
  for (const item of X.SUBJECT_ITEMS) {
    const found = fold(item.why).match(POSITIONAL);
    require_(
      !found,
      `sujet unique / ${item.id} : l'explication désigne une phrase par son rang ` +
        `(« ${found?.[0]} ») alors que les options sont mélangées — cite la phrase`
    );
  }
}

// ─── 4. Génération et correction ───────────────────────────────────
for (const skill of X.PARTICIPLE_SKILLS) {
  let malformed = 0;
  let unverifiable = 0;
  const items = new Set();

  for (let i = 0; i < 800; i++) {
    const ex = X.generateParticipleExercise(skill.id);
    items.add(ex.itemId);
    const answer = ex.options[ex.correctIndex];

    if (
      ex.options.length < 2 ||
      new Set(ex.options).size !== ex.options.length ||
      ex.correctIndex < 0 ||
      ex.sentenceFr.trim().length === 0 ||
      ex.explain.trim().length === 0
    ) {
      malformed += 1;
    }
    if (X.checkParticipleAnswer(ex.itemId, answer) !== true) unverifiable += 1;
    const wrong = ex.options.find((o) => o !== answer);
    if (wrong && X.checkParticipleAnswer(ex.itemId, wrong) !== false) unverifiable += 1;
    for (const problem of practiceInvariants(ex, X.rebuildParticipleExercise, Math.random)) {
      failures.push(`${skill.id} › ${ex.itemId} : ${problem}`);
    }

    // Les exercices de transformation montrent la proposition dépliée : sans
    // elle, l'apprenant devrait deviner ce qu'il comprime.
    if (skill.id === "active" || skill.id === "passive" || skill.id === "gerund") {
      if (!ex.expanded || !ex.compressed.includes("___")) malformed += 1;
    }
  }

  require_(malformed === 0, `${skill.id} : ${malformed} exercices malformés`);
  require_(
    unverifiable === 0,
    `${skill.id} : ${unverifiable} exercices que le serveur ne rejuge pas correctement`
  );
  require_(items.size >= 5, `${skill.id} : seulement ${items.size} items distincts`);
}

require_(
  X.checkParticipleAnswer("active:inexistant", "читающий") === null,
  "un contexte inconnu doit être rejeté"
);
require_(X.checkParticipleAnswer("", "") === null, "un identifiant vide doit être rejeté");
require_(
  X.rebuildParticipleExercise("active:inexistant") === null && X.rebuildParticipleExercise("") === null,
  "un identifiant inventé ne doit pas être reconstruit"
);

// ─── Rapport ───────────────────────────────────────────────────────
const ACCENTED_FORMS = V.PARTICIPLE_VERBS.flatMap((v) =>
  [
    v.imperfective,
    v.perfective,
    v.activePresent,
    v.activePastImp,
    v.activePastPerf,
    v.passivePast,
    v.gerundImp,
    v.gerundPerf,
    ...(v.passiveShort ? Object.values(v.passiveShort) : []),
  ].filter(Boolean)
);

// ─── Hygiène de l'accent tonique ───────────────────────────────────
//
// Trois défauts qu'aucune table témoin ne voit, parce qu'elles comparent
// l'ORTHOGRAPHE et pas la typographie :
//
//   un polysyllabe sans accent      l'apprenant ne peut pas le prononcer
//   un accent posé sur une consonne invisible, et il fausse la lecture
//   deux accents dans un mot        « тёплы́й » — un mot n'en a qu'un
//
// Le ё porte l'accent par lui-même : il compte comme marque.
{
  for (const form of ACCENTED_FORMS) {
    for (const problem of inspect(form, form)) require_(false, problem);
    require_(
      (form.match(/́/g) ?? []).length <= 1,
      `« ${form} » porte plus d'un accent tonique`
    );
  }
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} problème(s) sur ${checks} contrôles :\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error("");
  process.exit(1);
}

const items = X.PARTICIPLE_SKILLS.map((s) => {
  const seen = new Set();
  for (let i = 0; i < 600; i++) seen.add(X.generateParticipleExercise(s.id).itemId);
  return `${s.id} ${seen.size}`;
});
console.log(`✓ ${checks} contrôles passés.`);
console.log(
  `  banque : ${V.PARTICIPLE_VERBS.length} verbes ` +
    `(${V.PARTICIPLE_VERBS.filter((v) => v.transitive).length} transitifs, ` +
    `${V.PARTICIPLE_VERBS.filter((v) => !v.transitive).length} intransitifs)`
);
console.log(
  `  contextes : ${X.ACTIVE_CONTEXTS.length} actif, ${X.PASSIVE_CONTEXTS.length} passif, ` +
    `${X.SHORT_CONTEXTS.length} forme courte, ${X.GERUND_CONTEXTS.length} gérondif, ` +
    `${X.SUBJECT_ITEMS.length} sujet unique`
);
console.log(`  items distincts par compétence : ${items.join(", ")}`);
