/**
 * Contrôles du module « Accord de l'adjectif » — `npm run check:adjectives`.
 *
 * Ce module a été extrait du module Cas parce que celui-ci tirait le couple
 * adjectif + nom au hasard dans deux banques, ce qui produisait une phrase
 * sur trois que personne ne dirait. Ici le couple est ÉCRIT. Ce fichier
 * vérifie donc surtout que les contextes écrits tiennent :
 *
 * 1. INTÉGRITÉ : chaque contexte pointe vers un adjectif et un nom qui
 *    existent, les identifiants sont uniques, le gabarit a bien ses deux
 *    marques (`___` pour l'adjectif, `{N}` pour le nom).
 * 2. COHÉRENCE PÉDAGOGIQUE : chaque compétence ne contient que des contextes
 *    qui l'illustrent (l'onglet « accusatif » ne contient que des
 *    accusatifs, « pluriel » que des pluriels…).
 * 3. EXERCICE JOUABLE : quatre options distinctes, toutes du même paradigme,
 *    une seule juste.
 * 4. TÉMOINS : des formes attendues recopiées à la main. Elles ne testent pas
 *    le moteur (check:grammar le fait contre une table complète) mais MES
 *    hypothèses sur ce que chaque contexte enseigne — si un contexte annonce
 *    la règle des 5 lettres, la forme produite doit vraiment la montrer.
 */
import { createJiti } from "jiti";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });
const {
  ADJECTIVE_SKILLS,
  ADJECTIVE_CONTEXTS,
  generateAdjectiveExercise,
  checkAdjectiveAnswer,
  rebuildAdjectiveExercise,
} = await jiti.import("../lib/adjectives/exercises.ts");
const { practiceInvariants } = await import("./lib/practice-invariants.mjs");
const { getAdjective } = await jiti.import("../lib/grammar/adjectives-data.ts");
const { getNoun } = await jiti.import("../lib/grammar/nouns-data.ts");
const { declineAdjective } = await jiti.import("../lib/grammar/decline-adjective.ts");
const { declineNoun } = await jiti.import("../lib/grammar/decline.ts");
const { validateSentence, findGovernor } = await jiti.import(
  "../lib/grammar/sentence-guard.ts"
);

const failures = [];
let checks = 0;
function expect(label, got, want) {
  checks += 1;
  if (got !== want) failures.push(`${label} : ${JSON.stringify(got)} au lieu de ${JSON.stringify(want)}`);
}
function require_(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

// ─── 1. Intégrité des contextes ────────────────────────────────────
const seenIds = new Set();
let contextCount = 0;
for (const skill of ADJECTIVE_SKILLS) {
  const contexts = ADJECTIVE_CONTEXTS[skill.id];
  require_(Array.isArray(contexts) && contexts.length > 0, `compétence « ${skill.id} » sans contexte`);
  // En dessous, le tirage se répète trop vite pour qu'une session ait du sens.
  require_(
    contexts.length >= 8,
    `compétence « ${skill.id} » : ${contexts.length} contextes, minimum 8`
  );
  for (const c of contexts) {
    contextCount += 1;
    expect(`identifiant « ${c.id} » en double`, seenIds.has(c.id), false);
    seenIds.add(c.id);
    require_(getAdjective(c.adjective) !== undefined, `contexte « ${c.id} » : adjectif « ${c.adjective} » inconnu`);
    require_(getNoun(c.noun) !== undefined, `contexte « ${c.id} » : nom « ${c.noun} » inconnu`);
    expect(`contexte « ${c.id} » : une seule marque ___`, c.ru.split("___").length, 2);
    expect(`contexte « ${c.id} » : une seule marque {N}`, c.ru.split("{N}").length, 2);
    // Les deux marques reçoivent une forme COMPLÈTE, calculée. Une désinence
    // recollée derrière — « {N}ом » — donnait « языко́мом », et le contrôle
    // de longueur ci-dessus n'y voyait rien.
    for (const mark of ["___", "{N}"]) {
      const at = c.ru.indexOf(mark);
      require_(
        !/[а-яёa-ź]/i.test(c.ru[at - 1] ?? " "),
        `contexte « ${c.id} » : « ${mark} » est collé au mot qui précède`
      );
      require_(
        !/[а-яёa-ź]/i.test(c.ru[at + mark.length] ?? " "),
        `contexte « ${c.id} » : « ${mark} » est collé au mot qui suit`
      );
    }
    require_(c.fr.trim().length > 0, `contexte « ${c.id} » : traduction vide`);
    require_(c.why.trim().length > 0, `contexte « ${c.id} » : explication vide`);
    // La traduction française ne doit pas porter le trou : elle est ce qui
    // identifie l'adjectif à produire, un trou des deux côtés rendrait
    // l'exercice indevinable (même règle que dans le module Cas).
    require_(!c.fr.includes("___"), `contexte « ${c.id} » : la traduction française contient un trou`);
  }
}

// ─── 1 bis. La phrase montée tient-elle debout ? ───────────────────
// Le module n'avait aucun contrôle sur ce qui GOUVERNE le trou : un
// contexte annoncé au prépositionnel pouvait être bâti sur un verbe
// transitif (« На ры́нке продаю́т ___ я́блоках »), et l'exercice demandait
// alors une forme que la phrase ne peut pas recevoir. On réutilise le
// garde-fou du module Cas, sur la phrase une fois le nom inséré.
for (const skill of ADJECTIVE_SKILLS) {
  for (const c of ADJECTIVE_CONTEXTS[skill.id]) {
    const noun = getNoun(c.noun);
    if (!noun) continue;
    const plural = c.plural ?? false;
    const assembled = c.ru.replace("{N}", declineNoun(noun, c.case, plural).accented);
    const verdict = validateSentence({ sentence: assembled, targetCase: c.case, plural });
    require_(
      verdict.ok,
      `contexte « ${c.id} » : ${verdict.reason} — « ${assembled} »`
    );
    // Le prépositionnel ne s'emploie jamais sans préposition : c'est le seul
    // cas russe dans ce cas, et c'est ce que le garde-fou ne peut pas voir
    // seul (un verbe devant le trou ne gouverne rien de repérable).
    if (c.case === "prepositional") {
      require_(
        findGovernor(assembled) !== undefined,
        `contexte « ${c.id} » : prépositionnel sans préposition — « ${assembled} »`
      );
    }
    // Typographie : la traduction commence par une majuscule, la phrase
    // russe n'a ni espace avant la ponctuation ni espace double.
    require_(
      c.fr[0] === c.fr[0].toUpperCase(),
      `contexte « ${c.id} » : la traduction ne commence pas par une majuscule`
    );
    require_(
      !/\s[.!?]/.test(c.ru) && !/\s\s/.test(c.ru),
      `contexte « ${c.id} » : espace avant la ponctuation, ou espace double`
    );
  }
}

// ─── 2. Cohérence pédagogique de chaque compétence ─────────────────
const OBLIQUE = ["genitive", "dative", "instrumental", "prepositional"];
for (const c of ADJECTIVE_CONTEXTS.accusative) {
  expect(`« ${c.id} » dans « accusatif » mais au cas`, c.case, "accusative");
  expect(`« ${c.id} » : l'accusatif animé se joue au singulier`, c.plural ?? false, false);
}
for (const c of ADJECTIVE_CONTEXTS.plural) {
  expect(`« ${c.id} » dans « pluriel » mais au singulier`, c.plural ?? false, true);
}
for (const c of ADJECTIVE_CONTEXTS.oblique) {
  require_(OBLIQUE.includes(c.case), `« ${c.id} » dans « obliques » mais au cas ${c.case}`);
  expect(`« ${c.id} » : les obliques se jouent au singulier`, c.plural ?? false, false);
}
for (const c of ADJECTIVE_CONTEXTS.nominative) {
  expect(`« ${c.id} » dans « accord de base » mais au cas`, c.case, "nominative");
  expect(`« ${c.id} » : l'accord de base se joue au singulier`, c.plural ?? false, false);
  // Un radical mou ou mixte y ferait apparaître une règle d'orthographe que
  // la compétence suivante est justement chargée d'introduire.
  expect(
    `« ${c.id} » : l'accord de base ne prend que des radicaux durs`,
    getAdjective(c.adjective).stemType,
    "hard"
  );
}
for (const c of ADJECTIVE_CONTEXTS.spelling) {
  const stem = getAdjective(c.adjective).stemType;
  require_(
    stem === "mixed" || stem === "soft",
    `« ${c.id} » dans « orthographe » mais radical ${stem} — rien à y montrer`
  );
}

// ─── 3. L'exercice produit est jouable ─────────────────────────────
// Générateur déterministe : on rejoue chaque contexte avec un tirage figé
// plutôt que d'espérer tomber dessus au hasard.
for (const skill of ADJECTIVE_SKILLS) {
  const contexts = ADJECTIVE_CONTEXTS[skill.id];
  for (let i = 0; i < contexts.length; i += 1) {
    // random() qui sélectionne le i-ème contexte puis reste neutre.
    let first = true;
    const random = () => {
      if (first) {
        first = false;
        return i / contexts.length;
      }
      return 0;
    };
    const ex = generateAdjectiveExercise(skill.id, random);
    const context = contexts[i];
    expect(`tirage figé sur « ${context.id} »`, ex.itemId, `${skill.id}:${context.id}`);
    expect(`« ${context.id} » : nombre d'options`, ex.options.length, 4);
    expect(`« ${context.id} » : options distinctes`, new Set(ex.options).size, 4);
    require_(
      ex.correctIndex >= 0 && ex.correctIndex < ex.options.length,
      `« ${context.id} » : bonne réponse absente des options`
    );
    // Le nom doit avoir été inséré, et le trou rester.
    require_(!ex.sentence.includes("{N}"), `« ${context.id} » : nom non substitué`);
    expect(`« ${context.id} » : trou conservé`, ex.sentence.split("___").length, 2);

    // Toutes les options viennent du MÊME adjectif : un distracteur d'un
    // autre mot se rejetterait sur le sens et pas sur l'accord.
    const adjective = getAdjective(context.adjective);
    const paradigm = new Set();
    for (const c of ["nominative", "genitive", "dative", "accusative", "instrumental", "prepositional"]) {
      for (const g of ["masculine", "feminine", "neuter"]) {
        for (const pl of [false, true]) {
          for (const an of ["animate", "inanimate"]) {
            paradigm.add(declineAdjective(adjective, c, g, pl, an).accented);
          }
        }
      }
    }
    for (const option of ex.options) {
      require_(
        paradigm.has(option),
        `« ${context.id} » : option « ${option} » hors du paradigme de ${adjective.lemmaM}`
      );
    }

    // Le serveur rejuge à partir du seul itemId : il doit dire la même chose.
    expect(
      `« ${context.id} » : le serveur valide la bonne réponse`,
      checkAdjectiveAnswer(ex.itemId, ex.options[ex.correctIndex]),
      true
    );
    for (const option of ex.options) {
      if (option === ex.options[ex.correctIndex]) continue;
      expect(
        `« ${context.id} » : le serveur refuse « ${option} »`,
        checkAdjectiveAnswer(ex.itemId, option),
        false
      );
    }
  }
}
// Notes et reconstruction, sur chaque contexte : chaque leurre doit dire
// quelle case du tableau il occupe.
for (const skill of ADJECTIVE_SKILLS) {
  for (const context of ADJECTIVE_CONTEXTS[skill.id]) {
    const ex = rebuildAdjectiveExercise(`${skill.id}:${context.id}`, Math.random);
    if (!ex) {
      failures.push(`« ${context.id} » : non reconstruit depuis son identifiant`);
      continue;
    }
    for (const problem of practiceInvariants(ex, rebuildAdjectiveExercise, Math.random)) {
      failures.push(`« ${context.id} » : ${problem}`);
    }
    const correct = ex.options[ex.correctIndex];
    for (const option of ex.options) {
      if (option !== correct && !/^forme (du |de l')/.test(ex.whyNot?.[option] ?? "")) {
        failures.push(`« ${context.id} » : le leurre « ${option} » ne dit pas quelle forme il est`);
      }
    }
    checks += 1;
  }
}
expect("identifiant inventé non reconstruit", rebuildAdjectiveExercise("nominative:inexistant"), null);

expect("identifiant d'item inconnu rejeté", checkAdjectiveAnswer("nominative:inexistant", "x"), null);
expect("compétence inconnue rejetée", checkAdjectiveAnswer("inexistante:x", "x"), null);

// ─── 4. Témoins : ce que chaque règle doit produire ────────────────
// Recopiés à la main. Ils fixent ce que le module PRÉTEND enseigner : si le
// moteur changeait d'avis sur « хоро́шее », l'explication du contexte
// deviendrait fausse sans que rien d'autre ne le signale.
const WITNESSES = [
  ["novyy", "nominative", "masculine", false, "inanimate", "новый"],
  ["novyy", "nominative", "feminine", false, "inanimate", "новая"],
  ["staryy", "nominative", "neuter", false, "inanimate", "старое"],
  ["molodoy", "nominative", "masculine", false, "animate", "молодой"],
  // Règle des 7 lettres : ы interdit après к.
  ["russkiy", "nominative", "masculine", false, "inanimate", "русский"],
  ["russkiy", "instrumental", "masculine", false, "inanimate", "русским"],
  ["malenkiy", "nominative", "masculine", false, "inanimate", "маленький"],
  // Règle des 5 lettres : о -> е après ш non accentué…
  ["khoroshiy", "nominative", "neuter", false, "inanimate", "хорошее"],
  ["khoroshiy", "dative", "masculine", false, "animate", "хорошему"],
  // …neutralisée quand l'accent tombe sur la désinence.
  ["bolshoy", "nominative", "neuter", false, "inanimate", "большое"],
  ["bolshoy", "nominative", "masculine", false, "inanimate", "большой"],
  // Radical mou : table à part, pas une correction orthographique.
  ["siniy", "nominative", "neuter", false, "inanimate", "синее"],
  ["siniy", "nominative", "feminine", false, "inanimate", "синяя"],
  ["domashniy", "nominative", "feminine", false, "inanimate", "домашняя"],
  // Accusatif : animé = génitif, inanimé = nominatif, féminin = -ую.
  ["novyy", "accusative", "masculine", false, "animate", "нового"],
  ["novyy", "accusative", "masculine", false, "inanimate", "новый"],
  ["krasivyy", "accusative", "feminine", false, "animate", "красивую"],
  ["bolshoy", "accusative", "neuter", false, "inanimate", "большое"],
  // Obliques.
  ["novyy", "genitive", "masculine", false, "inanimate", "нового"],
  ["staryy", "genitive", "feminine", false, "inanimate", "старой"],
  ["tyoplyy", "prepositional", "feminine", false, "inanimate", "тёплой"],
  ["bolshoy", "prepositional", "masculine", false, "inanimate", "большом"],
  ["dorogoy", "genitive", "masculine", false, "inanimate", "дорогого"],
  // Pluriel : une seule série pour les trois genres.
  ["novyy", "nominative", "masculine", true, "inanimate", "новые"],
  ["novyy", "nominative", "feminine", true, "inanimate", "новые"],
  ["novyy", "nominative", "neuter", true, "inanimate", "новые"],
  ["malenkiy", "nominative", "feminine", true, "animate", "маленькие"],
  ["staryy", "accusative", "masculine", true, "animate", "старых"],
  ["staryy", "accusative", "masculine", true, "inanimate", "старые"],
  ["krasivyy", "instrumental", "masculine", true, "inanimate", "красивыми"],
  ["khoroshiy", "dative", "masculine", true, "animate", "хорошим"],
];
for (const [id, kase, gender, plural, animacy, want] of WITNESSES) {
  const adjective = getAdjective(id);
  expect(
    `témoin ${adjective.lemmaM} · ${kase} ${gender}${plural ? " pluriel" : ""} ${animacy}`,
    declineAdjective(adjective, kase, gender, plural, animacy).form,
    want
  );
}

// ─── Rapport ───────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} problème(s) sur ${checks} contrôles :\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error("");
  process.exit(1);
}

console.log(`✓ ${checks} contrôles passés.`);
console.log(
  `  banque : ${contextCount} contextes écrits sur ${ADJECTIVE_SKILLS.length} compétences ` +
    `(${ADJECTIVE_SKILLS.map((s) => `${s.id} ${ADJECTIVE_CONTEXTS[s.id].length}`).join(", ")})`
);
console.log(
  `  couples adjectif + nom tirés au hasard : 0 — c'est la raison d'être de ce module`
);
