/**
 * Contrôles du module "Cas" — `npm run check:grammar`.
 *
 * Le module affiche la forme qu'il calcule comme LA bonne réponse : une
 * terminaison fausse n'y est pas un bug d'affichage, c'est une faute
 * enseignée. Quatre contrôles, du plus structurel au plus fin :
 *
 * 1. INVARIANTS de la banque importée : 12 formes par mot, identifiants et
 *    traductions uniques, nominatif cohérent avec le lemme, accents présents.
 * 2. TÉMOINS : un échantillon de paradigmes recopiés à la main. Ils ne
 *    testent pas la langue russe (le dictionnaire fait foi) mais la CHAÎNE
 *    d'import : si build-nouns.mjs se casse ou si la source change de
 *    format, ces mots-là le montrent immédiatement.
 * 3. PRÉNOMS : paradigmes écrits à la main (absents du dictionnaire), donc
 *    vérifiés en entier.
 * 4. ADJECTIFS : eux restent calculés par règle (système fermé et régulier),
 *    donc entièrement testés contre une table de référence. Les PHRASES
 *    d'accord, elles, ont leur propre module et leur propre suite
 *    (`npm run check:adjectives`).
 *
 * Il affiche aussi le taux d'accord entre le moteur de règles et le
 * dictionnaire — la mesure qui justifie l'architecture (le moteur explique,
 * il ne décide pas).
 */
import { createJiti } from "jiti";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });
const { declineNoun, stripAccent } = await jiti.import("../lib/grammar/decline.ts");
const { declineAdjective } = await jiti.import("../lib/grammar/decline-adjective.ts");
const { NOUNS, nounsForLevel } = await jiti.import("../lib/grammar/nouns-data.ts");
const { RUSSIAN_NAMES } = await jiti.import("../lib/grammar/names-data.ts");
const { ADJECTIVES } = await jiti.import("../lib/grammar/adjectives-data.ts");
const { CASE_ORDER } = await jiti.import("../lib/grammar/types.ts");
const {
  acceptableForms,
  generateMcqExercise,
  generateSentenceExercise,
  generateNumeralExercise,
  normalizeAnswer,
  poolFor,
} = await jiti.import("../lib/grammar/exercise-generator.ts");
import { mixedScript, accentOnConsonant } from "./lib/cyrillic.mjs";
import { accentuate, canonicalForms, loadDictionary } from "./lib/dictionary.mjs";

const adjectiveDictionary = await loadDictionary(["adjectives"]);

const { TRIGGERS, PROPER_NOUN_TRIGGER_ID, triggerNumber, templatesFor } = await jiti.import(
  "../lib/grammar/triggers.ts"
);
const { validateSentence, validateFrenchSentence, validateFrenchTemplate } = await jiti.import(
  "../lib/grammar/sentence-guard.ts"
);
const { H_REVIEWED } = await jiti.import("../lib/grammar/french-article.ts");
const { fillFrenchBlank, frenchNounPhrase } = await jiti.import(
  "../lib/grammar/french-article.ts"
);
const { categoryOf, DECLARED_CATEGORIES, DECLARED_UNCOUNTABLE, isCountable, countableNouns } =
  await jiti.import("../lib/grammar/noun-categories.ts");
const { TRIGGER_NOUNS } = await jiti.import("../lib/grammar/trigger-nouns.generated.ts");

const failures = [];
let checks = 0;
function expect(label, got, want) {
  checks += 1;
  if (got !== want) failures.push(`${label} : "${got}" au lieu de "${want}"`);
}
function require_(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

// ─── 1. Invariants de la banque ────────────────────────────────────
const VOWELS = "аеёиоуыэюя";
const ids = new Map();
const translations = new Map();
for (const n of NOUNS) {
  require_(!ids.has(n.id), `identifiant en double : "${n.id}" (${n.lemma} et ${ids.get(n.id)})`);
  ids.set(n.id, n.lemma);

  const key = n.translation.toLowerCase();
  require_(
    !translations.has(key),
    `traduction en double : "${n.translation}" partagée par ${n.lemma} et ${translations.get(key)} — indice ambigu dans l'exercice`
  );
  translations.set(key, n.lemma);

  require_(n.forms.singular.length === 6, `${n.lemma} : ${n.forms.singular.length} formes au singulier`);
  require_(n.forms.plural.length === 6, `${n.lemma} : ${n.forms.plural.length} formes au pluriel`);
  require_(
    stripAccent(n.forms.singular[0]) === n.lemma,
    `${n.lemma} : le nominatif du paradigme est "${stripAccent(n.forms.singular[0])}"`
  );
  for (const form of [...n.forms.singular, ...n.forms.plural]) {
    const bare = stripAccent(form);
    require_(/^[а-яёА-ЯЁ]+$/.test(bare), `${n.lemma} : forme "${form}" hors alphabet cyrillique`);
    // Le ё porte toujours l'accent en russe : le dictionnaire ne le marque
    // pas en plus, et c'est correct.
    const vowels = [...bare].filter((c) => VOWELS.includes(c.toLowerCase())).length;
    const carriesStress = form !== bare || bare.includes("ё") || bare.includes("Ё");
    require_(
      vowels <= 1 || carriesStress,
      `${n.lemma} : forme "${form}" polysyllabique sans accent tonique`
    );
    require_(
      !mixedScript(form),
      `${n.lemma} : forme "${form}" mêle cyrillique et latin`
    );
    require_(
      !accentOnConsonant(form),
      `${n.lemma} : forme "${form}" porte l'accent sur une consonne`
    );
  }

  // ─── L'accusatif pluriel dit l'animacité, et doit dire la même ─────
  //
  // C'est LA règle que le module enseigne : un animé copie son accusatif
  // sur le génitif, un inanimé sur le nominatif. Elle est donc vérifiable
  // dans l'autre sens — le paradigme importé doit s'accorder avec le
  // drapeau `animacy`, et quand les deux se contredisent, l'app enseigne
  // une chose et en montre une autre.
  //
  // Rien ne testait cette cohérence. L'import est pourtant fidèle au
  // dictionnaire au caractère près : ces trois-là étaient des erreurs de la
  // SOURCE, invisibles tant qu'on ne confrontait que la chaîne d'import.
  // Voir FORM_OVERRIDES dans scripts/build-nouns.mjs.
  {
    const [nomPl, genPl, accPl] = [0, 1, 3].map((i) => stripAccent(n.forms.plural[i]));
    if (accPl === genPl && accPl !== nomPl) {
      require_(
        n.animacy === "animate",
        `${n.lemma} : accusatif pluriel = génitif pluriel (${accPl}), donc animé — ` +
          `mais la banque le déclare inanimé`
      );
    }
    if (accPl === nomPl && accPl !== genPl) {
      require_(
        n.animacy === "inanimate",
        `${n.lemma} : accusatif pluriel = nominatif pluriel (${accPl}), donc inanimé — ` +
          `mais la banque le déclare animé`
      );
    }
  }
}

// ─── 1bis. Les variantes du dictionnaire ───────────────────────────
//
// 148 cases ont deux formes également correctes (« дочерьми́ » ou
// « дочеря́ми »). L'import n'en gardait qu'une, et taper l'autre comptait
// une faute. Trois choses à tenir maintenant qu'on les garde.
{
  let withVariant = 0;
  for (const n of NOUNS) {
    for (const [number, forms] of [
      ["singulier", n.forms.singular],
      ["pluriel", n.forms.plural],
    ]) {
      const variants =
        number === "singulier" ? n.forms.variants?.singular : n.forms.variants?.plural;
      if (!variants) continue;
      for (const [index, variant] of Object.entries(variants)) {
        withVariant += 1;
        const main = forms[Number(index)];
        // a) une variante n'est pas la forme principale déguisée.
        require_(
          stripAccent(variant) !== stripAccent(main),
          `${n.lemma} : variante "${variant}" identique à la forme principale au ${number}`
        );
        // b) elle reste du russe accentué comme le reste de la banque.
        const vowels = [...stripAccent(variant)].filter((c) =>
          VOWELS.includes(c.toLowerCase())
        ).length;
        require_(
          vowels <= 1 || variant !== stripAccent(variant) || variant.includes("ё"),
          `${n.lemma} : variante "${variant}" polysyllabique sans accent tonique`
        );
        // c) et surtout : elle est ACCEPTÉE. C'est la raison d'être du
        //    champ, et le seul contrôle qui casse si on oublie de brancher
        //    la variante dans le comparateur.
        const targetCase = CASE_ORDER[Number(index)];
        const exercise = {
          correctForm: stripAccent(main),
          variantForm: variant,
        };
        require_(
          acceptableForms(exercise).length === 2 &&
            normalizeAnswer(variant) ===
              normalizeAnswer(acceptableForms(exercise)[1]),
          `${n.lemma} ${targetCase} ${number} : la variante "${variant}" n'est pas acceptée`
        );
      }
    }
  }
  require_(
    withVariant > 100,
    `seulement ${withVariant} variantes importées — le dictionnaire en donne 148, ` +
      `l'import les a-t-il reperdues ?`
  );
}

// ─── 2. Paradigmes témoins ─────────────────────────────────────────
// Recopiés à la main, un par difficulté : voyelle mobile, supplétisme,
// pluriel en -ья, radical en ц, radical en -и, 3e déclinaison, masculin
// en -а, chuintante accentuée.
const WITNESSES = {
  "стол": [
    ["стол", "стола", "столу", "стол", "столом", "столе"],
    ["столы", "столов", "столам", "столы", "столами", "столах"],
  ],
  "отец": [
    ["отец", "отца", "отцу", "отца", "отцом", "отце"],
    ["отцы", "отцов", "отцам", "отцов", "отцами", "отцах"],
  ],
  "день": [
    ["день", "дня", "дню", "день", "днём", "дне"],
    ["дни", "дней", "дням", "дни", "днями", "днях"],
  ],
  "человек": [
    ["человек", "человека", "человеку", "человека", "человеком", "человеке"],
    ["люди", "людей", "людям", "людей", "людьми", "людях"],
  ],
  "ребёнок": [
    ["ребёнок", "ребёнка", "ребёнку", "ребёнка", "ребёнком", "ребёнке"],
    ["дети", "детей", "детям", "детей", "детьми", "детях"],
  ],
  "стул": [
    ["стул", "стула", "стулу", "стул", "стулом", "стуле"],
    ["стулья", "стульев", "стульям", "стулья", "стульями", "стульях"],
  ],
  "мальчик": [
    ["мальчик", "мальчика", "мальчику", "мальчика", "мальчиком", "мальчике"],
    ["мальчики", "мальчиков", "мальчикам", "мальчиков", "мальчиками", "мальчиках"],
  ],
  "папа": [
    ["папа", "папы", "папе", "папу", "папой", "папе"],
    ["папы", "пап", "папам", "пап", "папами", "папах"],
  ],
  "врач": [
    ["врач", "врача", "врачу", "врача", "врачом", "враче"],
    ["врачи", "врачей", "врачам", "врачей", "врачами", "врачах"],
  ],
  "сердце": [
    ["сердце", "сердца", "сердцу", "сердце", "сердцем", "сердце"],
    ["сердца", "сердец", "сердцам", "сердца", "сердцами", "сердцах"],
  ],
  "здание": [
    ["здание", "здания", "зданию", "здание", "зданием", "здании"],
    ["здания", "зданий", "зданиям", "здания", "зданиями", "зданиях"],
  ],
  "ночь": [
    ["ночь", "ночи", "ночи", "ночь", "ночью", "ночи"],
    ["ночи", "ночей", "ночам", "ночи", "ночами", "ночах"],
  ],
  "мать": [
    ["мать", "матери", "матери", "мать", "матерью", "матери"],
    ["матери", "матерей", "матерям", "матерей", "матерями", "матерях"],
  ],
  "время": [
    ["время", "времени", "времени", "время", "временем", "времени"],
    ["времена", "времён", "временам", "времена", "временами", "временах"],
  ],
  "окно": [
    ["окно", "окна", "окну", "окно", "окном", "окне"],
    ["окна", "окон", "окнам", "окна", "окнами", "окнах"],
  ],
  "книга": [
    ["книга", "книги", "книге", "книгу", "книгой", "книге"],
    ["книги", "книг", "книгам", "книги", "книгами", "книгах"],
  ],
  "земля": [
    ["земля", "земли", "земле", "землю", "землёй", "земле"],
    ["земли", "земель", "землям", "земли", "землями", "землях"],
  ],
  "сестра": [
    ["сестра", "сестры", "сестре", "сестру", "сестрой", "сестре"],
    ["сёстры", "сестёр", "сёстрам", "сестёр", "сёстрами", "сёстрах"],
  ],
};

const byLemma = new Map(NOUNS.map((n) => [n.lemma, n]));
for (const [lemma, table] of Object.entries(WITNESSES)) {
  const noun = byLemma.get(lemma);
  if (!noun) {
    failures.push(`témoin "${lemma}" absent de la banque — ajoute-le à scripts/data/nouns-fr.tsv ou retire-le d'ici`);
    continue;
  }
  [false, true].forEach((plural, i) => {
    CASE_ORDER.forEach((c, j) => {
      expect(`${lemma} ${plural ? "pl." : "sg."} ${c}`, declineNoun(noun, c, plural).form, table[i][j]);
    });
  });
}

// ─── 3. Prénoms (paradigmes écrits à la main) ──────────────────────
const NAMES = {
  "Анна": [
    ["Анна", "Анны", "Анне", "Анну", "Анной", "Анне"],
    ["Анны", "Анн", "Аннам", "Анн", "Аннами", "Аннах"],
  ],
  "Мария": [
    ["Мария", "Марии", "Марии", "Марию", "Марией", "Марии"],
    ["Марии", "Марий", "Мариям", "Марий", "Мариями", "Мариях"],
  ],
  "Ольга": [
    ["Ольга", "Ольги", "Ольге", "Ольгу", "Ольгой", "Ольге"],
    ["Ольги", "Ольг", "Ольгам", "Ольг", "Ольгами", "Ольгах"],
  ],
  "Екатерина": [
    ["Екатерина", "Екатерины", "Екатерине", "Екатерину", "Екатериной", "Екатерине"],
    ["Екатерины", "Екатерин", "Екатеринам", "Екатерин", "Екатеринами", "Екатеринах"],
  ],
  "Наталья": [
    ["Наталья", "Натальи", "Наталье", "Наталью", "Натальей", "Наталье"],
    ["Натальи", "Наталий", "Натальям", "Наталий", "Натальями", "Натальях"],
  ],
  "Иван": [
    ["Иван", "Ивана", "Ивану", "Ивана", "Иваном", "Иване"],
    ["Иваны", "Иванов", "Иванам", "Иванов", "Иванами", "Иванах"],
  ],
  "Дмитрий": [
    ["Дмитрий", "Дмитрия", "Дмитрию", "Дмитрия", "Дмитрием", "Дмитрии"],
    ["Дмитрии", "Дмитриев", "Дмитриям", "Дмитриев", "Дмитриями", "Дмитриях"],
  ],
  "Александр": [
    ["Александр", "Александра", "Александру", "Александра", "Александром", "Александре"],
    ["Александры", "Александров", "Александрам", "Александров", "Александрами", "Александрах"],
  ],
  "Сергей": [
    ["Сергей", "Сергея", "Сергею", "Сергея", "Сергеем", "Сергее"],
    ["Сергеи", "Сергеев", "Сергеям", "Сергеев", "Сергеями", "Сергеях"],
  ],
  "Николай": [
    ["Николай", "Николая", "Николаю", "Николая", "Николаем", "Николае"],
    ["Николаи", "Николаев", "Николаям", "Николаев", "Николаями", "Николаях"],
  ],
};
require_(
  RUSSIAN_NAMES.length === Object.keys(NAMES).length,
  `${RUSSIAN_NAMES.length} prénoms dans la banque mais ${Object.keys(NAMES).length} dans la table de référence`
);
for (const name of RUSSIAN_NAMES) {
  const table = NAMES[name.lemma];
  if (!table) {
    failures.push(`prénom "${name.lemma}" absent de la table de référence`);
    continue;
  }
  [false, true].forEach((plural, i) => {
    CASE_ORDER.forEach((c, j) => {
      expect(`${name.lemma} ${plural ? "pl." : "sg."} ${c}`, declineNoun(name, c, plural).form, table[i][j]);
    });
  });
}

// ─── 4. Adjectifs (calculés par règle, donc testés en entier) ──────
const ADJ_TABLE = {
  "красивый": {
    masculine: ["красивый", "красивого", "красивому", "красивый", "красивым", "красивом"],
    feminine: ["красивая", "красивой", "красивой", "красивую", "красивой", "красивой"],
    neuter: ["красивое", "красивого", "красивому", "красивое", "красивым", "красивом"],
    plural: ["красивые", "красивых", "красивым", "красивые", "красивыми", "красивых"],
  },
  "русский": {
    masculine: ["русский", "русского", "русскому", "русский", "русским", "русском"],
    feminine: ["русская", "русской", "русской", "русскую", "русской", "русской"],
    neuter: ["русское", "русского", "русскому", "русское", "русским", "русском"],
    plural: ["русские", "русских", "русским", "русские", "русскими", "русских"],
  },
  "хороший": {
    masculine: ["хороший", "хорошего", "хорошему", "хороший", "хорошим", "хорошем"],
    feminine: ["хорошая", "хорошей", "хорошей", "хорошую", "хорошей", "хорошей"],
    neuter: ["хорошее", "хорошего", "хорошему", "хорошее", "хорошим", "хорошем"],
    plural: ["хорошие", "хороших", "хорошим", "хорошие", "хорошими", "хороших"],
  },
  "большой": {
    masculine: ["большой", "большого", "большому", "большой", "большим", "большом"],
    feminine: ["большая", "большой", "большой", "большую", "большой", "большой"],
    neuter: ["большое", "большого", "большому", "большое", "большим", "большом"],
    plural: ["большие", "больших", "большим", "большие", "большими", "больших"],
  },
  "синий": {
    masculine: ["синий", "синего", "синему", "синий", "синим", "синем"],
    feminine: ["синяя", "синей", "синей", "синюю", "синей", "синей"],
    neuter: ["синее", "синего", "синему", "синее", "синим", "синем"],
    plural: ["синие", "синих", "синим", "синие", "синими", "синих"],
  },
};
const ADJ_ANIMATE_ACC = {
  "красивый": { masculine: "красивого", plural: "красивых" },
  "русский": { masculine: "русского", plural: "русских" },
  "хороший": { masculine: "хорошего", plural: "хороших" },
  "большой": { masculine: "большого", plural: "больших" },
  "синий": { masculine: "синего", plural: "синих" },
};
// LES 18 ADJECTIFS, CONTRE LE DICTIONNAIRE. Les tables témoins ci-dessus
// n'en couvraient que 5 : `if (!table) continue` laissait passer les treize
// autres sans une assertion, et ce sont eux qu'on ajoute quand on enrichit
// la banque. adjectives.csv donne les 24 formes déclinées de 11 942
// adjectifs, accentuées — on peut donc vérifier la totalité, accent
// compris, ce que les tables écrites à la main ne font pas.
{
  const A = adjectiveDictionary.of("adjectives");
  const COLUMN = { masculine: "m", feminine: "f", neuter: "n" };
  const SUFFIX = {
    nominative: "nom",
    genitive: "gen",
    dative: "dat",
    accusative: "acc",
    instrumental: "inst",
    prepositional: "prep",
  };
  let compared = 0;
  for (const adj of ADJECTIVES) {
    const row = A.get(stripAccent(adj.lemmaM));
    require_(row, `${adj.lemmaM} : absent du dictionnaire des adjectifs`);
    if (!row) continue;
    const cells = [];
    for (const [gender, code] of Object.entries(COLUMN)) {
      for (const c of CASE_ORDER) cells.push([`${gender} ${c}`, `decl_${code}_${SUFFIX[c]}`, gender, c, false]);
    }
    for (const c of CASE_ORDER) cells.push([`pluriel ${c}`, `decl_pl_${SUFFIX[c]}`, "masculine", c, true]);

    for (const [label, column, gender, c, plural] of cells) {
      const expected = canonicalForms(row[column]).map(accentuate);
      if (!expected.length) continue;
      compared += 1;
      const got = declineAdjective(adj, c, gender, plural, "inanimate").accented;
      require_(
        expected.includes(got),
        `${adj.lemmaM} ${label} : le moteur donne "${got}", le dictionnaire "${expected.join(" ou ")}"`
      );
    }
  }
  require_(
    compared > 400,
    `seulement ${compared} formes d'adjectif comparées au dictionnaire`
  );
}

for (const adj of ADJECTIVES) {
  const table = ADJ_TABLE[adj.lemmaM];
  if (!table) continue; // les témoins écrits à la main, en plus du dictionnaire
  for (const key of ["masculine", "feminine", "neuter", "plural"]) {
    const plural = key === "plural";
    const gender = plural ? "masculine" : key;
    CASE_ORDER.forEach((c, j) => {
      expect(
        `${adj.lemmaM} ${key} ${c}`,
        declineAdjective(adj, c, gender, plural, "inanimate").form,
        table[key][j]
      );
    });
  }
  const animate = ADJ_ANIMATE_ACC[adj.lemmaM];
  expect(`${adj.lemmaM} masc. animé acc.`, declineAdjective(adj, "accusative", "masculine", false, "animate").form, animate.masculine);
  expect(`${adj.lemmaM} pl. animé acc.`, declineAdjective(adj, "accusative", "masculine", true, "animate").form, animate.plural);
}

// ─── 5. Genre français des traductions ─────────────────────────────
// Le genre français est écrit à la main dans scripts/data/nouns-fr.tsv, et
// il est INDÉPENDANT du genre russe : гости́ница est féminin en russe, mais
// « hôtel » est masculin. La confusion est facile à faire en saisissant les
// données, et elle se voyait à peine — jusqu'à ce que le mode « accord
// adjectif » écrive la traduction complète et produise « d'hôtel chaude ».
//
// Ce contrôle ne connaît pas le français : il applique les terminaisons qui
// ne trompent pas, avec la liste explicite de leurs exceptions. Il ne
// prétend donc pas tout couvrir, seulement empêcher qu'une faute de ce type
// revienne sans qu'on s'en aperçoive.
{
  const RULES = [
    [/(?:tion|sion)$/i, "f"],
    [/té$/i, "f"],
    [/ette$/i, "f"],
    [/(?:ance|ence)$/i, "f"],
    [/ure$/i, "f"],
    [/esse$/i, "f"],
    [/ment$/i, "m"],
    [/eau$/i, "m"],
    [/oir$/i, "m"],
    [/el$/i, "m"],
    [/age$/i, "m"],
  ];
  // Mots qui contredisent leur terminaison — le français en est plein.
  // « invité » est un participe substantivé, pas un nom en -té comme
  // « liberté » : la terminaison ne dit rien de son genre.
  const EXCEPTIONS = new Set(["côté", "été", "eau", "peau", "image", "invité"]);

  for (const noun of NOUNS) {
    // Le premier mot seul : « ticket de caisse », « nom de famille ».
    const head = noun.translation.split(/[\s(]/)[0].toLowerCase();
    if (EXCEPTIONS.has(head)) continue;
    for (const [pattern, gender] of RULES) {
      if (!pattern.test(head)) continue;
      expect(
        `genre français de « ${noun.translation} » (${noun.lemma})`,
        noun.frenchGender,
        gender
      );
      break;
    }
  }
}

// ─── 6. Classes sémantiques et déclencheurs ────────────────────────
// Un exercice de phrase colle un déclencheur et un nom tirés séparément.
// Sans contrainte, « Я ем ___ » recevait « помо́щник » : « je mange cet
// assistant ». Trois choses doivent tenir.
let curatedTriggers = 0;
let demandingTriggers = 0;

/**
 * Vivier minimal d'un déclencheur, à chaque niveau. Doit valoir MIN_POOL de
 * lib/grammar/exercise-generator.ts — c'est ce nombre-là que l'élargissement
 * vise, et le contrôle n'a de sens que s'il vérifie la même chose.
 */
const MIN_NOUNS = 12;

/**
 * Déclencheurs que la langue ne laisse pas remplir, avec la raison.
 *
 * Ce n'est pas une dérogation de confort : chacun a été relu, et la liste
 * est vérifiée dans les deux sens — une entrée dont le vivier a grandi
 * devient une erreur (voir la fin de la section 7), pour qu'elle ne serve
 * pas d'échappatoire durable.
 */
const MIN_NARROW = 5;
const NARROW = {
  "expr-gen-stakan": "« Un verre de ___ » : la banque ne compte que six boissons.",
  "verb-gen-vypit": "« Boire un peu de ___ » : les six mêmes boissons.",
  "verb-acc-pit": "« Je bois ___ » : les six mêmes boissons.",
  "prep-gen-vmesto": "« Prends du thé au lieu de ___ » : ce qu'un thé remplace, boissons et repas.",
  "verb-gen-zhelat": "« Je te souhaite ___ » : les souhaits sont des formules figées.",
  "verb-gen-trebovat": "« J'exige ___ » : on exige un dû, pas un objet.",
  "verb-gen-dostigat": "« J'atteins ___ » : un but, un résultat — rien de concret.",
  "expr-gen-polnyy": "« Le verre est plein de ___ » : ce qui se verse.",
  "prep-acc-skvoz": "« Je vois la lumière à travers ___ » : ce qui laisse passer la lumière.",
  "verb-instr-vladet": "« Je maîtrise ___ » : une langue, un art, une méthode.",
  "prep-prep-na": "« Я работаю на ___ » : les lieux de travail qui prennent на et non в.",
};
{
  // a) La classification couvre la banque, une classe et une seule par nom.
  //    C'est ce qui rend le fichier relisable : une omission se voit ici,
  //    elle ne se dilue pas dans un tirage.
  const declared = new Map();
  for (const [category, words] of DECLARED_CATEGORIES) {
    for (const word of words) {
      expect(
        `« ${word} » classé deux fois (${declared.get(word)} et ${category})`,
        declared.has(word),
        false
      );
      declared.set(word, category);
    }
  }
  const known = new Set(NOUNS.map((n) => n.translation));
  for (const word of declared.keys()) {
    expect(`« ${word} » classé mais absent de la banque`, known.has(word), true);
  }
  for (const noun of NOUNS) {
    expect(`« ${noun.translation} » (${noun.lemma}) sans classe sémantique`, categoryOf(noun.id) !== undefined, true);
  }

  // b) Aucun déclencheur ne peut se retrouver sans nom à servir. Une classe
  //    trop étroite viderait son pool en silence, et l'exercice retomberait
  //    sur le repli — donc sur des phrases absurdes, sans que rien ne le dise.
  for (const trigger of TRIGGERS) {
    if (!trigger.accepts) continue;
    const accepted = new Set(trigger.accepts);
    const count = NOUNS.filter((n) => accepted.has(categoryOf(n.id))).length;
    const floor = NARROW[trigger.id] ? MIN_NARROW : MIN_NOUNS;
    expect(
      `déclencheur « ${trigger.id} » : ${count} nom(s) disponibles, minimum ${floor}`,
      count >= floor,
      true
    );
  }

  // c) La liste curée (trigger-nouns.generated.ts) est la source normale du
  //    tirage : elle doit être saine. C'est de la donnée écrite par un
  //    modèle, donc exactement le genre de chose qu'on ne croit pas sur
  //    parole.
  const NOUN_IDS = new Set(NOUNS.map((n) => n.id));
  for (const [triggerId, ids] of Object.entries(TRIGGER_NOUNS)) {
    const trigger = TRIGGERS.find((t) => t.id === triggerId);
    expect(`liste curée « ${triggerId} » : déclencheur inconnu`, trigger !== undefined, true);
    // La TAILLE ne se juge pas ici : une liste de quinze mots dont douze
    // sont hors du niveau de l'apprenant ne vaut pas mieux qu'une liste de
    // trois. Le plancher porte donc sur le vivier réellement servi, croisé
    // avec chaque niveau — voir la section 7.
    expect(`liste curée « ${triggerId} » : doublons`, new Set(ids).size, ids.length);
    for (const id of ids) {
      expect(`liste curée « ${triggerId} » : « ${id} » hors banque`, NOUN_IDS.has(id), true);
    }
  }

  // Un déclencheur sans liste curée n'est PAS une anomalie : il retombe sur
  // ses classes sémantiques, qui produisent des phrases correctes, juste un
  // peu moins fines. La curation est un raffinement progressif, pas un
  // prérequis — le compte est reporté en fin de contrôle, il ne fait pas
  // échouer la suite.
  curatedTriggers = TRIGGERS.filter(
    (t) => t.accepts && TRIGGER_NOUNS[t.id]?.length > 0
  ).length;
  demandingTriggers = TRIGGERS.filter((t) => t.accepts).length;

  // d) Sur un vrai tirage, le nom servi vient bien de la liste curée — ou,
  //    à défaut de liste, d'une classe acceptée.
  let outOfPool = 0;
  let draws = 0;
  for (const trigger of TRIGGERS) {
    if (!trigger.accepts) continue;
    const curated = TRIGGER_NOUNS[trigger.id];
    const allowed = curated?.length
      ? new Set(curated)
      : new Set(NOUNS.filter((n) => trigger.accepts.includes(categoryOf(n.id))).map((n) => n.id));
    for (let i = 0; i < 30; i += 1) {
      const ex = generateSentenceExercise(trigger.caseId, trigger);
      draws += 1;
      if (!allowed.has(ex.noun.id)) outOfPool += 1;
    }
  }
  expect(`nom servi hors du pool autorisé (${draws} tirages)`, outOfPool, 0);
}

// ─── 7. Pool servi à la génération IA ──────────────────────────────
// Le mode « Phrase » passe par l'IA (app/api/ai/exercise/route.ts) et ne
// retombe sur le gabarit fixe qu'en cas d'échec. Cette route compose son
// échantillon avec `poolFor` — le même filtre que le gabarit fixe. Elle
// tirait auparavant 40 mots au hasard dans toute la banque du niveau, si
// bien que la curation ne protégeait que le chemin de secours : « владеть »
// (maîtriser) recevait « рот » (bouche), « работать + » (métier) recevait
// « женщина ».
//
// Ce qui doit tenir : à TOUS les niveaux, le pool d'un déclencheur est ASSEZ
// LARGE et entièrement compris dans ce qu'il admet.
//
// « Assez large » et pas « non vide ». Un vivier d'un seul mot passait ce
// contrôle : « Я рабо́таю на ___ » ne trouvait que « компью́тер » au niveau
// A1 et rendait la même phrase, au caractère près, indéfiniment. Et le
// plancher se mesure APRÈS croisement avec le niveau, jamais sur la liste
// curée brute : c'est le croisement qui vidait les viviers, et lui seul
// disait la vérité sur ce qu'un apprenant reçoit.
{
  const NOUN_IDS = new Set(NOUNS.map((n) => n.id));
  for (const trigger of TRIGGERS) {
    if (trigger.id === PROPER_NOUN_TRIGGER_ID) continue;
    const curated = TRIGGER_NOUNS[trigger.id];
    const allowed = curated?.length
      ? new Set(curated)
      : trigger.accepts
        ? new Set(
            NOUNS.filter((n) => trigger.accepts.includes(categoryOf(n.id))).map((n) => n.id)
          )
        : NOUN_IDS;
    const floor = NARROW[trigger.id] ? MIN_NARROW : MIN_NOUNS;
    for (const level of ["A0", "A1", "A2", "B1", "B2"]) {
      const served = poolFor(trigger, nounsForLevel(level));
      expect(
        `pool « ${trigger.id} » (${level}) : ${served.length} mot(s), minimum ${floor}`,
        served.length >= floor,
        true
      );
      const outside = served.filter((n) => !allowed.has(n.id));
      expect(
        `pool IA « ${trigger.id} » (${level}) : ${outside.length} mot(s) non admis` +
          `${outside.length ? ` — ex. ${outside[0].lemma} (${outside[0].translation})` : ""}`,
        outside.length,
        0
      );
    }
  }

  // La liste des étroits ne doit pas devenir un tapis sous lequel balayer.
  // Un déclencheur qui atteint le plancher ordinaire n'a plus rien à y
  // faire : l'entrée est périmée, et la garder masquerait la prochaine
  // régression sur ce déclencheur-là.
  for (const [id, reason] of Object.entries(NARROW)) {
    const trigger = TRIGGERS.find((t) => t.id === id);
    expect(`déclencheur étroit « ${id} » : inconnu`, trigger !== undefined, true);
    expect(`déclencheur étroit « ${id} » : raison manquante`, Boolean(reason), true);
    if (!trigger) continue;
    const served = Math.min(
      ...["A0", "A1", "A2", "B1", "B2"].map((l) => poolFor(trigger, nounsForLevel(l)).length)
    );
    expect(
      `déclencheur étroit « ${id} » : il sert ${served} mots, il n'est plus étroit — retirer l'entrée`,
      served < MIN_NOUNS,
      true
    );
  }
}

// ─── 7 bis. Le h français, aspiré ou muet ──────────────────────────
// L'élision devant h n'est pas dérivable de l'orthographe : « cet homme »
// mais « ce héros ». Un commentaire affirmait qu'aucun h aspiré n'était dans
// la banque ; il y en avait un, et « J'admire cet héros » s'affichait. La
// liste doit donc rester complète : tout mot en h qui entre dans la banque
// est signalé ici tant que quelqu'un n'a pas tranché.
{
  for (const noun of [...NOUNS, ...RUSSIAN_NAMES]) {
    const first = noun.translation.toLowerCase().split(/[\s(]/)[0];
    if (!first.startsWith("h")) continue;
    require_(
      H_REVIEWED.has(first),
      `« ${first} » commence par h : décider s'il s'élide (« cet ») ou non ` +
        `(« ce »), et l'inscrire dans H_REVIEWED — et dans ASPIRATED_H s'il ` +
        `refuse l'élision (lib/grammar/french-article.ts)`
    );
  }
  expect("« héros » refuse l'élision", frenchNounPhrase("héros", "m", "demonstrative", false), "ce héros");
  expect("« homme » l'accepte", frenchNounPhrase("homme", "m", "demonstrative", false), "cet homme");
  expect("« hôtel » l'accepte", frenchNounPhrase("hôtel", "m", "demonstrative", false), "cet hôtel");
}

// ─── 8. Animacité des personnes ────────────────────────────────────
// Le drapeau `animacy` ne décide pas des formes du nom (le dictionnaire
// fait foi) mais il décide de la désinence de l'ADJECTIF à l'accusatif
// masculin, et de ce qu'un adjectif peut qualifier. Une personne marquée
// inanimée fait donc enseigner « синий менеджер » au lieu de « синего », en
// silence. Corrigé à la source (ANIMACY_OVERRIDES dans build-nouns.mjs) ;
// ceci empêche qu'une réimportation le ramène.
{
  // Personnes au sens grammatical russe : ces collectifs désignent des gens
  // mais se déclinent comme des inanimés (вижу семью, не вижу семьи).
  const GRAMMATICALLY_INANIMATE = new Set([
    "famille", "police", "armée", "équipe", "société", "entreprise", "firme",
    "gouvernement", "peuple",
  ]);
  for (const noun of NOUNS) {
    const category = categoryOf(noun.id);
    if (category !== "human" && category !== "animal") continue;
    if (GRAMMATICALLY_INANIMATE.has(noun.translation)) continue;
    expect(
      `« ${noun.translation} » (${noun.lemma}) est une personne/un animal mais marqué inanimé`,
      noun.animacy,
      "animate"
    );
  }
}

// ─── 9. Garde-fou des phrases à trou ───────────────────────────────
// Le mode « Phrase » calcule la bonne réponse depuis (cas de la page,
// nombre du déclencheur) sans jamais relire la phrase. Tant qu'elle venait
// d'un gabarit curé, l'accord était garanti ; depuis que l'IA la rédige, il
// ne l'est plus : elle a servi « Не́сколько ___ сиде́ли на дива́не » pour
// illustrer le NOMINATIF pluriel, alors que « несколько » impose le
// génitif — l'apprenant tapait « детей », juste dans cette phrase, et
// l'exercice comptait une faute en lui enseignant l'inverse.
// lib/grammar/sentence-guard.ts refuse ces phrases (route IA + client).
//
// Deux choses à tenir ici :
//   a) le garde-fou accepte TOUS les gabarits curés — sinon il ferait
//      retomber le mode « Phrase » sur des phrases qu'il refuse lui-même ;
//   b) il refuse bien les phrases fautives observées en production, et
//      accepte des phrases justes de même forme (pas un refus global).
{
  // CHAQUE NOMBRE QUE LE DÉCLENCHEUR DÉCLARE, pas seulement celui qu'il
  // servait hier. Le champ `number` dit ce que le gabarit accepte
  // ("singular", "plural" ou "both") et c'est le sélecteur de l'apprenant
  // qui choisit dans cet ensemble : un gabarit annoncé "both" doit donc
  // tenir dans les DEUX nombres, sinon le sélecteur produit une phrase
  // fausse dès qu'on bascule.
  //
  // C'est l'invariant qui manquait : l'ancien booléen ne pouvait dire que
  // « ce gabarit sert le pluriel », jamais « ce gabarit le supporte », et
  // rien ne vérifiait le nombre qu'on ne servait pas.
  //
  // TOUTES les phrases du déclencheur, pas seulement la référence : la
  // banque générée en ajoute cinq ou six par déclencheur, et elles sont
  // servies à l'apprenant exactement comme la référence.
  const seenTemplates = new Map();
  // Le plancher de phrases par déclencheur. Trois n'est pas un idéal, c'est
  // le seuil sous lequel la répétition redevient visible : le contrôle de
  // variété (check:variety) rejoue des sessions de cinquante exercices et
  // échoue en dessous. Le tenir ICI le dit à la construction, sur la donnée,
  // plutôt qu'au terme d'une simulation.
  const MIN_TEMPLATES = 4;
  for (const trigger of TRIGGERS) {
    const all = templatesFor(trigger);
    expect(
      `déclencheur « ${trigger.id} » : ${all.length} phrase(s), minimum ${MIN_TEMPLATES} ` +
        `— relancer npm run curate:templates --only=${trigger.id}`,
      all.length >= MIN_TEMPLATES,
      true
    );
    const declared = triggerNumber(trigger);
    const numbers = declared === "both" ? [false, true] : [declared === "plural"];
    for (const template of templatesFor(trigger)) {
      for (const plural of numbers) {
        const verdict = validateSentence({
          sentence: template.ru,
          targetCase: trigger.caseId,
          plural,
          trigger,
        });
        expect(
          `gabarit « ${trigger.id} » (${template.ru}) au ` +
            `${plural ? "pluriel" : "singulier"} refusé par le garde-fou` +
            `${verdict.reason ? ` : ${verdict.reason}` : ""}`,
          verdict.ok,
          true
        );
      }

      // Le versant français du gabarit. `validateFrenchSentence` se tait
      // devant un « ___ » — à raison, le trou est comblé par la banque —, si
      // bien que le gabarit lui-même n'était vérifié par personne.
      const french = validateFrenchTemplate({
        templateFr: template.fr,
        article: trigger.article,
      });
      expect(
        `gabarit français « ${trigger.id} » (${template.fr}) refusé` +
          `${french.reason ? ` : ${french.reason}` : ""}`,
        french.ok,
        true
      );

      // Deux fois la même phrase, c'est un gabarit de moins : l'apprenant
      // la reverrait deux fois plus souvent, et le tirage croirait varier.
      const key = template.ru.replace(/\u0301/g, "").toLowerCase();
      expect(
        `phrase en double : « ${template.ru} » (${trigger.id} et ${seenTemplates.get(key)})`,
        seenTemplates.has(key),
        false
      );
      seenTemplates.set(key, trigger.id);
    }
  }

  // Ce que le contrôle d'identité lexicale doit attraper, et ce qu'il ne
  // doit pas. Les 68 déclencheurs sans gouverneur n'avaient AUCUN contrôle
  // d'identité : une phrase au bon cas bâtie sur un autre verbe passait, et
  // l'écran annonçait « заниматься » au-dessus d'une phrase qui ne le
  // contient pas.
  const MARK_WITNESSES = [
    // [phrase, id du déclencheur, doit être acceptée]
    ["Я занима́юсь ___ ка́ждый день.", "verb-instr-zanimatsya", true],
    ["Он занима́ется ___ по вечера́м.", "verb-instr-zanimatsya", true],
    ["Я чита́ю ___ ка́ждый день.", "verb-instr-zanimatsya", false],
    ["Он рабо́тает ___ уже́ де́сять лет.", "expr-instr-rabotat", true],
    ["Он стал ___ в про́шлом году́.", "expr-instr-rabotat", false],
    ["Она́ хо́чет стать ___.", "expr-instr-stat", true],
    ["Она́ мечта́ет о ___.", "expr-instr-stat", false],
    // Alternance régulière du thème : требовать → требую.
    ["Я тре́бую ___ неме́дленно.", "verb-gen-trebovat", true],
    ["Я прошу́ ___ неме́дленно.", "verb-gen-trebovat", false],
    // Racine trop courte pour trancher (есть → ем) : le contrôle se tait
    // plutôt que de refuser une phrase juste.
    ["Я ем ___ на за́втрак.", "verb-acc-est", true],
  ];
  for (const [sentence, triggerId, shouldPass] of MARK_WITNESSES) {
    const trigger = TRIGGERS.find((t) => t.id === triggerId);
    require_(trigger !== undefined, `témoin d'identité : déclencheur « ${triggerId} » inconnu`);
    if (!trigger) continue;
    const verdict = validateSentence({
      sentence,
      targetCase: trigger.caseId,
      plural: false,
      trigger,
    });
    expect(
      `témoin d'identité « ${sentence} » (${triggerId})` +
        `${verdict.reason ? ` — ${verdict.reason}` : ""}`,
      verdict.ok,
      shouldPass
    );
  }

  // Et ce que le contrôle du gabarit français doit attraper. Les deux
  // premiers sont ce que `validateFrenchSentence` laissait passer.
  const FRENCH_TEMPLATE_WITNESSES = [
    // [gabarit, article, doit être accepté]
    ["Travail travail travail.", "demonstrative", false],
    ["Un morceau de ___.", "none", false], // groupe nominal, pas une phrase
    ["Je pratique ___.", "demonstrative", true],
    ["Il travaille comme ___.", "none", true],
    ["Il est considéré comme ___.", "indefinite", true],
    ["Il travaille comme ___.", "demonstrative", false], // « comme ce juge »
    ["Je veux un verre de ___.", "none", true],
    ["Je vois ___.", "none", false], // « je vois livre »
    ["Je vois ___ et ___.", "demonstrative", false], // deux trous
    ["Je vois ___", "demonstrative", false], // pas de ponctuation finale
    ["Я ви́жу ___.", "demonstrative", false], // du cyrillique
    ["Regarde, c'est un ___ !", "indefinite", false], // deux articles au remplissage
    ["Regarde, c'est ___ !", "indefinite", true],
    ["C'est la voiture de ___.", "demonstrative", true], // « de » est une préposition
  ];
  for (const [templateFr, article, shouldPass] of FRENCH_TEMPLATE_WITNESSES) {
    const verdict = validateFrenchTemplate({ templateFr, article });
    expect(
      `témoin de gabarit français « ${templateFr} » [${article}]` +
        `${verdict.reason ? ` — ${verdict.reason}` : ""}`,
      verdict.ok,
      shouldPass
    );
  }

  // Témoins. Les trois premiers sont les phrases réellement servies à
  // l'apprenant et signalées comme fautives ; les suivants vérifient que le
  // contrôle ne refuse pas tout ce qui lui ressemble.
  const WITNESSES = [
    // [phrase, cas, pluriel, id du déclencheur, doit être acceptée]
    ["Несколько ___ сидели на диване и читали журнал.", "nominative", true, "expr-nom-pluriel", false],
    ["Несколько ___ сидели в магазине и читали газету.", "nominative", true, "expr-nom-pluriel", false],
    ["Много ___ гуляют в парке.", "nominative", true, "expr-nom-pluriel", false],
    ["В парке гуляют ___.", "nominative", true, "expr-nom-pluriel", true],
    ["На столе лежат красивые ___.", "nominative", true, "expr-nom-pluriel", true],
    ["На столе лежит красивая ___.", "nominative", true, "expr-nom-pluriel", false],
    ["У меня есть несколько ___.", "genitive", true, "expr-gen-neskolko", true],
    ["Я думаю о моей новой большой ___.", "prepositional", false, "prep-prep-o", true],
    ["Я иду к ___.", "dative", false, "prep-dat-k", true],
    ["Я говорю с ___.", "dative", false, "prep-dat-k", false],
    ["Я помогаю моему ___.", "dative", false, "verb-dat-pomogat", true],
    ["Школа находится в ___.", "prepositional", false, "expr-prep-nakhoditsya", true],
    ["Здесь 21 ___.", "genitive", true, undefined, false],
    ["Здесь пять ___.", "genitive", true, undefined, true],
  ];
  for (const [sentence, targetCase, plural, triggerId, shouldPass] of WITNESSES) {
    const trigger = triggerId ? TRIGGERS.find((t) => t.id === triggerId) : undefined;
    require_(!triggerId || trigger, `témoin garde-fou : déclencheur inconnu « ${triggerId} »`);
    const verdict = validateSentence({ sentence, targetCase, plural, trigger });
    expect(
      `garde-fou sur « ${sentence} » (${targetCase}${plural ? " pluriel" : ""})` +
        `${verdict.reason ? ` — ${verdict.reason}` : ""}`,
      verdict.ok,
      shouldPass
    );
  }

  // c) Versant français. La traduction est la seule chose qui dise QUEL mot
  //    chercher : une phrase française parlant de « l'homme » pour un
  //    exercice dont la réponse est « герой » fait répondre мужчина, et
  //    compte une faute. Deux choses à tenir, symétriques du russe.
  //
  //    D'abord la banque entière : pour CHAQUE nom, la phrase française
  //    construite comme le fait le mode « Phrase » (gabarit + article
  //    accordé) doit être reconnue comme nommant ce mot-là. Un faux refus
  //    ici ferait retomber le mode IA sur le gabarit fixe en boucle.
  for (const trigger of TRIGGERS) {
    if (trigger.id === PROPER_NOUN_TRIGGER_ID) continue;
    for (const template of templatesFor(trigger)) {
      for (const noun of poolFor(trigger, NOUNS)) {
        for (const plural of [false, true]) {
          const sentenceFr = fillFrenchBlank(
            template.fr,
            frenchNounPhrase(noun.translation, noun.frenchGender, trigger.article, plural)
          );
          const verdict = validateFrenchSentence({ sentenceFr, translation: noun.translation });
          expect(
            `garde-fou français : « ${sentenceFr} » ne reconnaît pas « ${noun.translation} »`,
            verdict.ok,
            true
          );
        }
      }
    }
  }

  //    Puis le français lui-même. `article: "demonstrative"` est le mode par
  //    défaut de 120 déclencheurs, et il est inséré mécaniquement devant la
  //    traduction — ce qui donnait « Il travaille comme CE juge », « Il veut
  //    devenir CE médecin ». Le russe était juste, la phrase française qui
  //    l'explique ne l'était pas.
  //
  //    Ce qui est interdit après « comme » / « devenir » / « en tant que »,
  //    c'est le DÉFINI et le DÉMONSTRATIF : « comme ce juge », « comme le
  //    juge ». L'indéfini, lui, est correct — « il est considéré comme un
  //    spécialiste » — et c'est pour cela que la règle nomme les
  //    déterminants un par un au lieu d'interdire le déterminant en bloc.
  //
  //    Courte, mécanique, donc vérifiable : exactement le genre de faute
  //    qu'un relecteur humain cesse de voir au bout de vingt gabarits.
  const NO_DETERMINER_AFTER = /\b(comme|devenir|devient|deviens|en tant que)\s+(ce|cet|cette|ces|le|la|les)\b/i;
  for (const trigger of TRIGGERS) {
    if (trigger.id === PROPER_NOUN_TRIGGER_ID) continue;
    const sample = poolFor(trigger, NOUNS)[0];
    if (!sample) continue;
    // Seulement les nombres que le gabarit déclare : « Il est considéré
    // comme des personnes » n'a pas à être jugé sur un déclencheur qui a
    // dit ne servir que le singulier.
    const declared = triggerNumber(trigger);
    for (const template of templatesFor(trigger))
    for (const plural of declared === "both" ? [false, true] : [declared === "plural"]) {
      const sentenceFr = fillFrenchBlank(
        template.fr,
        frenchNounPhrase(sample.translation, sample.frenchGender, trigger.article, plural)
      );
      const offense = NO_DETERMINER_AFTER.exec(sentenceFr);
      require_(
        !offense,
        `déclencheur « ${trigger.id} » : « ${sentenceFr} » — « ${offense?.[1]} » ` +
          `ne prend pas de déterminant, mets article: "none" (ou "indefinite" ` +
          `si la tournure en demande un)`
      );
    }
  }

  //    Ensuite les vrais refus : une traduction qui parle d'autre chose.
  const FRENCH_WITNESSES = [
    ["L'homme lit un journal.", "héros", false],
    ["Le héros lit un journal.", "héros", true],
    ["Ces héros lisent un journal.", "héros", true],
    ["Je pense à cette jeune fille.", "jeune fille", true],
    ["Je pense à cette fille.", "jeune fille", false],
    ["Il travaille dans ce bureau.", "bureau (pièce)", true],
    ["Il aime son travail.", "travail", true],
    ["Il aime ses travaux.", "travail", true],
    ["Je bois de l'eau.", "eau", true],
    ["Je bois du lait.", "eau", false],
    ["Voici ___ .", "héros", true], // trou conservé : comblé depuis la banque
  ];
  for (const [sentenceFr, translation, shouldPass] of FRENCH_WITNESSES) {
    const verdict = validateFrenchSentence({ sentenceFr, translation });
    expect(
      `garde-fou français sur « ${sentenceFr} » / « ${translation} »` +
        `${verdict.reason ? ` — ${verdict.reason}` : ""}`,
      verdict.ok,
      shouldPass
    );
  }
}

// ─── 9bis. Le QCM a toujours quatre boutons distincts ──────────────
//
// Les distracteurs sont les AUTRES cas du même nom — c'est ce qui fait du
// QCM un exercice de discrimination casuelle et non de vocabulaire. Mais un
// nom très syncrétique (neutre inanimé : nominatif = accusatif, génitif =
// accusatif…) n'en fournit pas trois, et le filet de secours abandonnait
// après dix tirages au hasard : l'exercice sortait alors avec deux ou trois
// boutons, sans que rien ne le dise.
//
// Deux invariants, sur des tirages réels : quatre options, et quatre
// options DISTINCTES UNE FOIS NORMALISÉES — deux boutons que le serveur
// compterait tous deux justes seraient pires qu'un bouton manquant.
{
  const DRAWS = 400;
  let short = 0;
  let duplicated = 0;
  let missingAnswer = 0;
  for (const c of CASE_ORDER) {
    for (const plural of [false, true]) {
      for (let i = 0; i < DRAWS; i += 1) {
        const ex = generateMcqExercise(c, undefined, NOUNS, plural);
        if (ex.options.length !== 4) short += 1;
        if (new Set(ex.options.map(normalizeAnswer)).size !== 4) duplicated += 1;
        if (!ex.options.includes(ex.correctForm)) missingAnswer += 1;
      }
    }
  }
  const draws = CASE_ORDER.length * 2 * DRAWS;
  require_(short === 0, `${short}/${draws} QCM avec moins de quatre options`);
  require_(
    duplicated === 0,
    `${duplicated}/${draws} QCM dont deux options se confondent après normalisation`
  );
  require_(missingAnswer === 0, `${missingAnswer}/${draws} QCM sans leur bonne réponse`);
}

// ─── 10. Ce qu'on met derrière un chiffre ──────────────────────────
// L'onglet « Chiffres » colle un cardinal devant un nom tiré au hasard. Sans
// filtre, il servait « 10 + нача́ло » — dix débuts : désinence juste, énoncé
// sans aucun sens. La liste d'exclusion vit dans noun-categories.ts ; ici on
// vérifie qu'elle mord et qu'elle ne dérive pas.
{
  // a) Chaque mot exclu existe dans la banque. Une traduction retouchée à
  //    l'import (« début » -> « commencement ») désactiverait sinon
  //    l'exclusion sans un mot.
  const translations = new Set(NOUNS.map((n) => n.translation));
  for (const word of DECLARED_UNCOUNTABLE) {
    require_(
      translations.has(word),
      `exclusion « ${word} » : aucun nom de la banque n'a cette traduction`
    );
  }

  // b) Et elle mord vraiment, sur un vrai tirage.
  let counted = 0;
  const offenders = new Set();
  for (let i = 0; i < 3000; i += 1) {
    const ex = generateNumeralExercise();
    counted += 1;
    if (!isCountable(ex.noun.id)) offenders.add(ex.noun.translation);
  }
  expect(
    `noms non dénombrables servis avec un chiffre (${counted} tirages)` +
      `${offenders.size ? ` — ex. ${[...offenders][0]}` : ""}`,
    offenders.size,
    0
  );

  // c) Le filtre laisse de quoi jouer à tous les niveaux — sinon
  //    countableNouns rend le pool tel quel et l'exclusion ne sert plus.
  for (const level of ["A0", "A1", "A2", "B1", "B2"]) {
    const served = countableNouns(nounsForLevel(level));
    const leaked = served.filter((n) => !isCountable(n.id));
    expect(
      `pool des chiffres (${level}) : ${leaked.length} non dénombrable(s)` +
        `${leaked.length ? ` — ex. ${leaked[0].translation}` : ""}`,
      leaked.length,
      0
    );
  }
}

// ─── 11. Ce qu'une réponse fausse EST ──────────────────────────────
// Le diagnostic (lib/grammar/diagnose.ts) nomme la case du tableau qu'une
// réponse fausse occupe. Une explication fausse serait pire que pas
// d'explication : on vérifie, sur toute la banque, qu'il se tait devant une
// réponse juste, qu'il explique chaque autre forme du mot, et qu'il ne nomme
// jamais une case que la forme n'occupe pas.
{
  const { diagnoseCaseAnswer, cellsOf } = await jiti.import("../lib/grammar/diagnose.ts");
  const { ruleForm } = await jiti.import("../lib/grammar/decline.ts");
  const { generateIsolatedExercise } = await jiti.import("../lib/grammar/exercise-generator.ts");
  const CASE_FR = {
    nominative: "nominatif",
    genitive: "génitif",
    dative: "datif",
    accusative: "accusatif",
    instrumental: "instrumental",
    prepositional: "prépositionnel",
  };
  const exerciseFor = (noun, targetCase, plural) => {
    const d = declineNoun(noun, targetCase, plural);
    return {
      kind: "isolated",
      noun,
      targetCase,
      plural,
      correctForm: d.form,
      accentedForm: d.accented,
      variantForm: d.variant,
      ruleApplied: d.ruleApplied,
    };
  };

  // a) Toute la banque : juste → silence ; autre case → une case vraie nommée.
  const problems = [];
  let explained = 0;
  for (const noun of NOUNS) {
    for (const plural of [false, true]) {
      for (const target of CASE_ORDER) {
        const ex = exerciseFor(noun, target, plural);
        if (diagnoseCaseAnswer(ex, ex.accentedForm) !== null) {
          problems.push(`${noun.lemma} ${target} : une réponse juste reçoit un diagnostic`);
        }
        const accepted = [ex.correctForm, ex.variantForm].filter(Boolean).map(normalizeAnswer);
        for (const otherPlural of [false, true]) {
          (otherPlural ? noun.forms.plural : noun.forms.singular).forEach((form) => {
            if (!form || accepted.includes(normalizeAnswer(form))) return;
            const message = diagnoseCaseAnswer(ex, form);
            if (!message) {
              problems.push(`${noun.lemma} : « ${form} » pour ${target} ${plural ? "pl." : "sg."} reste sans explication`);
              return;
            }
            const cells = cellsOf(noun, form);
            const honest =
              message.includes("forme du dictionnaire") ||
              cells.some((cell) => message.includes(CASE_FR[cell.case]));
            if (!honest) problems.push(`${noun.lemma} : « ${message} » ne nomme aucune case de « ${form} »`);
            explained += 1;
          });
        }
      }
    }
  }
  require_(
    problems.length === 0,
    `diagnostic : ${problems.length} défaut(s) — ex. ${problems.slice(0, 3).join(" | ")}`
  );
  require_(explained > 50000, `diagnostic : seulement ${explained} réponses fausses expliquées`);

  // b) Témoins, écrits à la main.
  const stol = NOUNS.find((n) => n.lemma === "стол");
  if (stol) {
    const genSg = exerciseFor(stol, "genitive", false);
    const toDative = diagnoseCaseAnswer(genSg, "столу") ?? "";
    require_(
      toDative.includes("datif") && toDative.includes("génitif"),
      `diagnostic témoin : « столу » pour le génitif → « ${toDative} »`
    );
    require_(
      (diagnoseCaseAnswer(genSg, "стол") ?? "").includes("forme du dictionnaire"),
      "diagnostic témoin : « стол » pour le génitif devrait nommer la forme du dictionnaire"
    );
    const genPl = exerciseFor(stol, "genitive", true);
    require_(
      (diagnoseCaseAnswer(genPl, "стола") ?? "").includes("mais au singulier"),
      "diagnostic témoin : « стола » pour le génitif pluriel devrait dire « bon cas, autre nombre »"
    );
  } else {
    failures.push("diagnostic témoin : « стол » introuvable dans la banque");
  }

  // c) La règle appliquée à un mot qui y échappe.
  let ruleWitness = null;
  outer: for (const noun of NOUNS) {
    for (const plural of [false, true]) {
      for (const target of CASE_ORDER) {
        const ex = exerciseFor(noun, target, plural);
        const predicted = ruleForm(noun, target, plural);
        if (normalizeAnswer(predicted) === normalizeAnswer(ex.correctForm)) continue;
        if (cellsOf(noun, predicted).length > 0) continue;
        ruleWitness = { ex, predicted };
        break outer;
      }
    }
  }
  require_(ruleWitness !== null, "diagnostic : aucun mot où la règle se trompe — le témoin ne teste rien");
  if (ruleWitness) {
    require_(
      (diagnoseCaseAnswer(ruleWitness.ex, ruleWitness.predicted) ?? "").includes("règle générale"),
      `diagnostic : « ${ruleWitness.predicted} » (${ruleWitness.ex.noun.lemma}) devrait être reconnu comme la règle générale`
    );
  }

  // d) Le groupe nominal : l'adjectif OU le nom, et lequel.
  let group = null;
  for (let i = 0; i < 400 && !group; i += 1) {
    const ex = generateIsolatedExercise("dative", false, NOUNS, true);
    if (ex.adjective) group = ex;
  }
  require_(group !== null, "diagnostic : aucun groupe adjectif + nom tiré");
  if (group) {
    const [adjectiveForm, nounForm] = normalizeAnswer(group.correctForm).split(" ");
    const wrongAdjective = declineAdjective(group.adjective, "nominative", group.noun.gender, false, group.noun.animacy).form;
    const wrongNoun = normalizeAnswer(group.noun.forms.singular[0]);
    if (normalizeAnswer(wrongAdjective) !== adjectiveForm) {
      require_(
        (diagnoseCaseAnswer(group, `${wrongAdjective} ${nounForm}`) ?? "").startsWith("Le nom est juste"),
        "diagnostic : un groupe au nom juste et à l'adjectif faux n'est pas reconnu"
      );
    }
    if (wrongNoun !== nounForm) {
      require_(
        (diagnoseCaseAnswer(group, `${adjectiveForm} ${wrongNoun}`) ?? "").startsWith("L'adjectif est juste"),
        "diagnostic : un groupe à l'adjectif juste et au nom faux n'est pas reconnu"
      );
    }
  }
}

// ─── 12. Les cas mélangés ──────────────────────────────────────────
// Le mélange ne doit servir que des phrases dont le déclencheur appartient au
// cas demandé, parmi les cas ouverts au niveau — et les servir tous.
{
  const { mixableCases, drawMixedCaseCandidate } = await jiti.import("../lib/grammar/case-draw.ts");
  const levels = ["A0", "A1", "A2", "B1", "B2", "C1"];
  let previous = 0;
  for (const level of levels) {
    const open = mixableCases(level);
    require_(open.length >= 3, `mélange (${level}) : moins de trois cas ouverts`);
    require_(open.length >= previous, `mélange (${level}) : moins de cas ouverts qu'au niveau précédent`);
    previous = open.length;
  }
  expect("mélange sans niveau : les six cas", mixableCases(undefined).length, 6);

  const open = mixableCases("B1");
  const seen = new Map();
  for (let i = 0; i < 1500; i += 1) {
    const ex = drawMixedCaseCandidate(
      { triggerStats: {}, level: "B1", pool: nounsForLevel("B1"), numberMode: "mixed" },
      open
    );
    seen.set(ex.targetCase, (seen.get(ex.targetCase) ?? 0) + 1);
    if (!ex.sentenceTemplate || !ex.trigger || ex.trigger.caseId !== ex.targetCase || !open.includes(ex.targetCase)) {
      failures.push(`mélange : exercice incohérent (${ex.targetCase}, ${ex.trigger?.id ?? "sans déclencheur"})`);
      break;
    }
  }
  checks += 1;
  for (const caseId of open) {
    require_((seen.get(caseId) ?? 0) > 0, `mélange (B1) : le ${caseId} n'est jamais servi`);
  }
  if (open.includes("nominative")) {
    const others = open.filter((c) => c !== "nominative").map((c) => seen.get(c) ?? 0);
    const average = others.reduce((a, b) => a + b, 0) / others.length;
    require_(
      (seen.get("nominative") ?? 0) < average,
      "mélange : le nominatif, dont l'indice montre déjà la forme, sort aussi souvent que les autres"
    );
  }
}

// ─── Rapport ───────────────────────────────────────────────────────
let irregularForms = 0;
let irregularWords = 0;
for (const n of NOUNS) {
  let any = false;
  for (const plural of [false, true]) {
    for (const c of CASE_ORDER) {
      if (declineNoun(n, c, plural).isIrregular) {
        irregularForms++;
        any = true;
      }
    }
  }
  if (any) irregularWords++;
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} problème(s) sur ${checks} contrôles :\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error("");
  process.exit(1);
}

const total = NOUNS.length * 12;
console.log(`✓ ${checks} contrôles passés.`);
console.log(
  `  déclencheurs exigeants : ${curatedTriggers}/${demandingTriggers} avec liste curée, ` +
    `le reste sur ses classes sémantiques`
);
console.log(
  `  banque : ${NOUNS.length} noms (${total} formes), ${RUSSIAN_NAMES.length} prénoms, ${ADJECTIVES.length} adjectifs`
);
console.log(
  `  moteur de règles vs dictionnaire : ${(((total - irregularForms) / total) * 100).toFixed(1)}% des formes retrouvées ` +
    `(${irregularWords} mots ont au moins une forme que la règle ne prédit pas — c'est pourquoi le dictionnaire fait foi)`
);
