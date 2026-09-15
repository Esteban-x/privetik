/**
 * Contrôles des modules d'exercices récents — `npm run check:exercises`.
 *
 * Ces trois modules (Lire et écrire, Conjugaison, Nombres) tirent leurs
 * exercices au hasard : une erreur n'y apparaît pas au chargement d'une
 * page mais une fois sur cinquante, sur un mot précis. Un contrôle à l'œil
 * ne peut pas les attraper. Ce script joue donc des milliers de tirages
 * avec un générateur reproductible et vérifie, pour chacun :
 *
 * 1. ALLER-RETOUR : la réponse annoncée juste par le générateur est bien
 *    validée par le correcteur du serveur — ce sont deux chemins de code
 *    distincts, et c'est celui du serveur qui compte les points.
 * 2. LEURRES : aucune autre option n'est acceptée. Un QCM avec deux bonnes
 *    réponses est insoluble, et cela arrive dès qu'un leurre coïncide avec
 *    la forme correcte.
 * 3. FORME : quatre options distinctes (trois au minimum), une consigne, un
 *    énoncé, une explication.
 * 4. TÉMOINS : des formes recopiées à la main — l'heure russe, l'accord
 *    après un nombre, des conjugaisons. Elles ne testent pas le tirage mais
 *    MES hypothèses sur ce que le module enseigne.
 * 5. BANQUE : intégrité des verbes (six personnes, accents, terminaisons
 *    conformes à la classe déclarée).
 * 6. LIENS : chaque module pointe vers une route servie et vers une leçon
 *    du cours qui existe, et la liste de routes recopiée dans la barre de
 *    navigation correspond au catalogue.
 */
import { createJiti } from "jiti";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pageFileFor, servesAPage } from "./lib/routes.mjs";
import { practiceInvariants } from "./lib/practice-invariants.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });

const numbers = await jiti.import("../lib/numbers/exercises.ts");
const conjugation = await jiti.import("../lib/conjugation/exercises.ts");
const alphabet = await jiti.import("../lib/alphabet/exercises.ts");
const { VERBS } = await jiti.import("../lib/conjugation/verbs.ts");
const { normalizeTyped, typedMatches } = await jiti.import("../lib/exercises/types.ts");
const retry = await jiti.import("../lib/practice/retry.ts");
const { EXERCISE_MODULES, moduleLevels } = await jiti.import("../lib/exercises/catalog.ts");
const { EXERCISE_ROUTES } = await jiti.import("../lib/exercises/routes.ts");
const { findLesson } = await jiti.import("../lib/courses/catalog.ts");
const { CEFR_LEVELS } = await jiti.import("../lib/supabase/types.ts");

const failures = [];
let checks = 0;
function require_(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}
function expect(label, got, want) {
  checks += 1;
  if (got !== want) failures.push(`${label} : « ${got} » au lieu de « ${want} »`);
}

/** Générateur reproductible : un échec doit pouvoir se rejouer à l'identique. */
function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ACCENT = "́";
const VOWELS = "аеёиоуыэюя";
const strip = (word) => word.split(ACCENT).join("");
const vowelCount = (word) => [...strip(word)].filter((c) => VOWELS.includes(c)).length;

// ─── 1 à 3. Tirage, correction, forme ────────────────────────────
const MODULES = [
  {
    id: "numbers",
    skills: numbers.NUMBER_SKILLS,
    generate: numbers.generateNumberExercise,
    check: numbers.checkNumberAnswer,
    rebuild: numbers.rebuildNumberExercise,
    typable: numbers.TYPABLE_NUMBER_SKILLS,
  },
  {
    id: "conjugation",
    skills: conjugation.CONJUGATION_SKILLS,
    generate: conjugation.generateConjugationExercise,
    check: conjugation.checkConjugationAnswer,
    rebuild: conjugation.rebuildConjugationExercise,
    typable: conjugation.TYPABLE_CONJUGATION_SKILLS,
  },
  {
    id: "alphabet",
    skills: alphabet.ALPHABET_SKILLS,
    generate: alphabet.generateAlphabetExercise,
    check: alphabet.checkAlphabetAnswer,
    rebuild: alphabet.rebuildAlphabetExercise,
    typable: alphabet.TYPABLE_ALPHABET_SKILLS,
  },
];

/**
 * Les compétences dont les leurres ne disent rien de précis : une position
 * d'accent fausse, une orthographe fautive écrite à la main. Partout
 * ailleurs, un exercice sans aucune note signale un générateur qui a perdu
 * les siennes.
 */
const WITHOUT_NOTES = new Set(["alphabet:stress", "alphabet:spelling", "alphabet:sounds"]);

const DRAWS = 600;
for (const bank of MODULES) {
  for (const skill of bank.skills) {
    require_(
      CEFR_LEVELS.includes(skill.level),
      `${bank.id} › ${skill.id} : niveau inconnu (${skill.level})`
    );
    require_(
      skill.summary.length >= 60,
      `${bank.id} › ${skill.id} : résumé trop court pour situer la difficulté`
    );

    const random = mulberry32(1234);
    const seen = new Set();
    let noted = 0;
    for (let draw = 0; draw < DRAWS; draw += 1) {
      const exercise = bank.generate(skill.id, random);
      const where = `${bank.id} › ${skill.id} › ${exercise.itemId}`;
      seen.add(exercise.itemId);
      if (exercise.whyNot) noted += 1;

      // Un second générateur pour la reconstruction : puiser dans `random`
      // décalerait tous les tirages suivants.
      for (const problem of practiceInvariants(exercise, bank.rebuild, mulberry32(draw))) {
        failures.push(`${where} : ${problem}`);
      }
      checks += 1;

      const correct = exercise.options[exercise.correctIndex];
      if (bank.check(exercise.itemId, correct) !== true) {
        failures.push(`${where} : le correcteur refuse la réponse du générateur (${correct})`);
        checks += 1;
        break;
      }
      checks += 1;

      for (const option of exercise.options) {
        if (option !== correct && bank.check(exercise.itemId, option) === true) {
          failures.push(`${where} : le leurre « ${option} » est accepté comme juste`);
        }
      }
      checks += 1;

      // UNE COMPÉTENCE TAPABLE DOIT RESTER DÉCIDABLE SANS ACCENT. Si un leurre
      // ne diffère de la réponse que par l'accent ou le ё, la saisie ne peut
      // pas les séparer — c'est pourquoi le passé n'est pas tapable.
      if (bank.typable?.includes(skill.id)) {
        for (const option of exercise.options) {
          if (option !== correct && normalizeTyped(option) === normalizeTyped(correct)) {
            failures.push(
              `${where} : compétence tapable, mais « ${option} » et « ${correct} » ne diffèrent que par l'accent`
            );
          }
        }
        if (!typedMatches(strip(correct).replace(/ё/g, "е").toUpperCase(), correct)) {
          failures.push(`${where} : la réponse tapée sans accent ni ё n'est pas reconnue`);
        }
        checks += 1;
      }

      if (new Set(exercise.options).size !== exercise.options.length) {
        failures.push(`${where} : options en double`);
      }
      if (exercise.options.length < 3) {
        failures.push(`${where} : seulement ${exercise.options.length} options`);
      }
      if (!exercise.prompt || !exercise.question || !exercise.explain) {
        failures.push(`${where} : consigne, énoncé ou explication vide`);
      }
      // UN EXERCICE À L'OREILLE NE MONTRE PAS CE QU'IL FAIT ENTENDRE : la
      // réponse ne doit apparaître ni dans l'énoncé ni dans l'indice.
      if (exercise.audio !== undefined) {
        if (!/[а-яё]/i.test(exercise.audio)) failures.push(`${where} : audio sans russe (${exercise.audio})`);
        const shown = `${exercise.question} ${exercise.hint ?? ""} ${exercise.prompt}`;
        if (shown.includes(correct) || shown.includes(exercise.audio) || shown.includes(strip(exercise.audio))) {
          failures.push(`${where} : l'énoncé écrit ce qu'il fallait entendre`);
        }
      }
      checks += 1;
    }

    // Un onglet qui ne tire que deux ou trois items devient une devinette
    // au bout d'une minute.
    require_(seen.size >= 5, `${bank.id} › ${skill.id} : seulement ${seen.size} items distincts`);
    if (!WITHOUT_NOTES.has(`${bank.id}:${skill.id}`)) {
      require_(
        noted >= DRAWS * 0.9,
        `${bank.id} › ${skill.id} : ${DRAWS - noted} exercices sur ${DRAWS} sans aucune note sur leurs leurres`
      );
    }
  }
  require_(bank.rebuild("inexistant:x:y", Math.random) === null, `${bank.id} : un identifiant inventé est reconstruit`);
  require_(bank.rebuild("", Math.random) === null, `${bank.id} : un identifiant vide est reconstruit`);
}

// ─── 3 bis. Le rattrapage des erreurs ────────────────────────────
//
// Une erreur revient RETRY_GAP exercices plus tard, pas avant, et une seule
// fois par exercice en attente ; remélangée, elle garde sa bonne réponse.
{
  const { scheduleRetry, takeDueRetry, takeAnyRetry, reshuffleChoice, spokenSentence, RETRY_GAP } = retry;
  let queue = scheduleRetry([], "a", { n: 1 }, 2);
  require_(takeDueRetry(queue, 2 + RETRY_GAP - 1) === null, "rattrapage : une erreur revient trop tôt");
  const due = takeDueRetry(queue, 2 + RETRY_GAP);
  require_(due?.entry.id === "a" && due.rest.length === 0, "rattrapage : une erreur échue n'est pas servie");
  queue = scheduleRetry(scheduleRetry(queue, "b", { n: 2 }, 3), "a", { n: 1 }, 7);
  require_(queue.length === 2, "rattrapage : un exercice raté deux fois figure deux fois en file");
  require_(takeAnyRetry(queue)?.entry.id === "b", "rattrapage : « refaire » ne sert pas le plus ancien");
  // Le plafond qui empêche quelques erreurs de monopoliser la séance.
  require_(
    retry.retriesLeft(0) && retry.retriesLeft(retry.MAX_RETRIES - 1) && !retry.retriesLeft(retry.MAX_RETRIES),
    "rattrapage : un exercice raté revient sans limite"
  );

  const exercise = { options: ["один", "два", "три", "четыре"], correctIndex: 2 };
  for (let i = 0; i < 20; i += 1) {
    const shuffled = reshuffleChoice(exercise, mulberry32(i));
    require_(
      shuffled.options[shuffled.correctIndex] === "три",
      "rattrapage : remélanger les options perd la bonne réponse"
    );
  }

  expect("phrase à écouter", spokenSentence("Я ___ в шко́лу.", "иду́"), "Я иду́ в шко́лу.");
  expect("réponse seule à écouter", spokenSentence("4:30", "полови́на пя́того"), "полови́на пя́того");
  expect("rien de russe à écouter", spokenSentence("ma phrase ___", "moloko"), null);
  expect("mot à écouter quand la réponse est une lecture", spokenSentence("молоко́", "malako"), "молоко́");
}

// ─── 3 ter. « Mes erreurs » : ce qui reste raté ───────────────────
//
// Une erreur est en attente tant que la DERNIÈRE réponse enregistrée à cet
// exercice est fausse. Relu dans le journal, sans table : chaque cas limite
// ci-dessous a une conséquence visible — une erreur levée à tort ne revient
// jamais, une erreur jamais levée revient pour toujours.
{
  const E = await jiti.import("../lib/practice/errors.ts");
  const at = (minutes) => new Date(Date.UTC(2026, 8, 1, 10, minutes)).toISOString();
  const aspect = (itemId, correct, minutes) => ({ kind: "aspect", correct, created_at: at(minutes), meta: { skill: "past", itemId } });
  const keys = (list) => list.map((e) => e.key).join(",");

  expect("erreur puis réussite : levée", keys(E.pendingErrors([aspect("past:a:b", false, 1), aspect("past:a:b", true, 2)])), "");
  expect("réussite puis erreur : en attente", keys(E.pendingErrors([aspect("past:a:b", true, 1), aspect("past:a:b", false, 2)])), "aspect:past:a:b");
  expect("ordre du journal ignoré, ordre du temps respecté", keys(E.pendingErrors([aspect("past:a:b", false, 5), aspect("past:a:b", true, 2)])), "aspect:past:a:b");
  const twice = E.pendingErrors([aspect("past:a:b", false, 1), aspect("past:a:b", false, 3)]);
  expect("deux échecs : compte des ratés", twice[0]?.misses, 2);
  expect("kind inconnu ignoré", E.pendingErrors([{ kind: "vocab", correct: false, created_at: at(1), meta: { cardId: "x" } }]).length, 0);
  expect("sans itemId : ignoré", E.pendingErrors([{ kind: "motion", correct: false, created_at: at(1), meta: {} }]).length, 0);

  // Les cas : l'exercice exact, et le déclencheur des réponses anciennes.
  const caseMeta = (extra) => ({ caseId: "genitive", triggerId: "prep-bez", ...extra });
  const oldStyle = { kind: "case", correct: false, created_at: at(1), meta: caseMeta({}) };
  const exact = { kind: "case", correct: false, created_at: at(2), meta: caseMeta({ nounId: "stol", plural: false, sentence: "Я пью чай без ___." }) };
  expect("cas : deux erreurs distinctes", E.pendingErrors([oldStyle, exact]).length, 2);
  const solved = { kind: "case", correct: true, created_at: at(3), meta: caseMeta({ nounId: "dom", plural: false, sentence: "Я пью чай без ___." }) };
  expect(
    "cas : une réussite sur le déclencheur lève l'erreur ancienne, pas l'exercice exact",
    keys(E.pendingErrors([oldStyle, exact, solved])),
    E.pendingErrors([exact])[0].key
  );

  // Échue : d'avant aujourd'hui.
  const now = Date.UTC(2026, 8, 2, 9, 0);
  require_(E.isDueError({ lastWrongAt: at(1) }, now), "erreur de la veille : doit être échue");
  require_(!E.isDueError({ lastWrongAt: new Date(now - 60000).toISOString() }, now), "erreur du jour : ne doit pas être échue");
  expect("plafond d'une séance d'erreurs", E.pendingErrors(Array.from({ length: 50 }, (_, i) => aspect(`past:c${i}:p`, false, i))).length, E.MAX_ERRORS);
}

// ─── 3 quater. Traduire des phrases ────────────────────────────────
//
// Chaque phrase vient du cours ou de la bibliothèque. Une phrase au russe
// mêlé de latin, un identifiant en double ou une référence qui ne se
// reconnaîtrait pas elle-même noteraient faux la bonne réponse.
{
  const TR = await jiti.import("../lib/translation/items.ts");
  const J = await jiti.import("../lib/translation/judge.ts");
  const items = TR.translationItems();
  const ids = new Set();
  for (const item of items) {
    const where = `traduction ${item.id}`;
    require_(!ids.has(item.id), `${where} : identifiant en double`);
    ids.add(item.id);
    require_(/[а-яё]/i.test(item.ru) && !/[a-z]/i.test(item.ru), `${where} : russe invalide (${item.ru})`);
    require_(item.fr.trim().length > 0 && !/[а-яё]/i.test(item.fr), `${where} : français invalide (${item.fr})`);
    require_(TR.TRANSLATION_LEVELS.includes(item.level), `${where} : niveau inconnu (${item.level})`);
    require_(TR.findTranslationItem(item.id) === item, `${where} : introuvable par son identifiant`);
    require_(J.matchesTranslation(item.ru, item.ru), `${where} : la référence ne se reconnaît pas elle-même`);
    require_(routeExists(item.source.href.replace(/\/[^/]+$/, item.source.href.startsWith("/cours/") ? "/[slug]" : "/[textId]")), `${where} : source sans page (${item.source.href})`);
  }
  for (const level of TR.TRANSLATION_LEVELS) {
    require_(TR.itemsForLevel(level).length >= 25, `traduction ${level} : seulement ${TR.itemsForLevel(level).length} phrases`);
  }
  expect("traduction : accent, ё, casse et ponctuation ignorés", J.matchesTranslation("я иду в школу", "Я иду́ в шко́лу."), true);
  expect("traduction : tiret de la phrase nominale ignoré", J.matchesTranslation("Мой брат врач", "Мой брат — врач."), true);
  expect("traduction : trait d'union d'un mot gardé", J.matchesTranslation("кто то пришёл", "Кто-то пришёл."), false);
  expect("traduction : autre cas refusé à la lettre", J.matchesTranslation("Я иду в школе.", "Я иду́ в шко́лу."), false);
  expect("traduction : réponse vide", J.matchesTranslation("   ", "Да."), false);
  expect("traduction : graine stable", TR.seededShuffle([1, 2, 3, 4, 5, 6], "x").join(), TR.seededShuffle([1, 2, 3, 4, 5, 6], "x").join());
  expect("traduction : A0 rejoint A1", TR.translationLevelFor("A0"), "A1");
  expect("traduction : C1 rejoint B2", TR.translationLevelFor("C1"), "B2");
  console.log(`Traduction : ${items.length} phrases (${TR.TRANSLATION_LEVELS.map((l) => `${l} ${TR.itemsForLevel(l).length}`).join(", ")})`);
}

// ─── 4. Témoins ──────────────────────────────────────────────────
expect("heure 3:00", numbers.tellTime(3, 0), "три часа́");
expect("heure 1:00", numbers.tellTime(1, 0), "час");
expect("heure 5:00", numbers.tellTime(5, 0), "пять часо́в");
expect("heure 4:15", numbers.tellTime(4, 15), "че́тверть пя́того");
expect("heure 4:30", numbers.tellTime(4, 30), "полови́на пя́того");
expect("heure 4:45", numbers.tellTime(4, 45), "без че́тверти пять");
expect("heure 3:20", numbers.tellTime(3, 20), "два́дцать мину́т четвёртого");
expect("heure 3:40", numbers.tellTime(3, 40), "без двадцати́ четы́ре");
expect("heure 12:55", numbers.tellTime(12, 55), "без пяти́ час");
expect("heure 12:30", numbers.tellTime(12, 30), "полови́на пе́рвого");

expect("âge 1", numbers.yearWord(1), "год");
expect("âge 2", numbers.yearWord(2), "го́да");
expect("âge 5", numbers.yearWord(5), "лет");
expect("âge 11", numbers.yearWord(11), "лет");
expect("âge 21", numbers.yearWord(21), "год");
expect("âge 22", numbers.yearWord(22), "го́да");

expect("cardinal 15", numbers.cardinalWords(15), "пятна́дцать");
expect("cardinal 50", numbers.cardinalWords(50), "пятьдеся́т");
expect("cardinal 57", numbers.cardinalWords(57), "пятьдеся́т семь");
expect("cardinal 40", numbers.cardinalWords(40), "со́рок");
expect("cardinal 200", numbers.cardinalWords(200), "две́сти");
expect("cardinal 507", numbers.cardinalWords(507), "пятьсо́т семь");
expect("cardinal 999", numbers.cardinalWords(999), "девятьсо́т девяно́сто де́вять");
expect("cardinal 111", numbers.cardinalWords(111), "сто оди́ннадцать");

// La dictée : chaque leurre est la transcription d'une prononciation réelle.
{
  const forms = (word) => alphabet.dictationDecoys(word).map((d) => d.form).sort().join(",");
  expect("dictée молоко́", forms("молоко́"), ["малоко", "молако", "малако"].sort().join(","));
  const gorod = alphabet.dictationDecoys("го́род").map((d) => d.form);
  require_(gorod.includes("горад") && gorod.includes("горот"), `dictée го́род : ${gorod.join(", ")}`);
  require_(!gorod.includes("гарод"), "dictée го́род : le о accentué ne doit jamais devenir а");
  const vokzal = alphabet.dictationDecoys("вокза́л").map((d) => d.form);
  require_(vokzal.includes("вогзал") && vokzal.includes("вакзал"), `dictée вокза́л : ${vokzal.join(", ")}`);
  require_(!alphabet.dictationDecoys("тётя").some((d) => d.form === "тёти"), "dictée тётя : un leurre est un vrai mot (тёти)");
  require_(!alphabet.dictationDecoys("де́ло").some((d) => d.form === "дела"), "dictée де́ло : la voyelle finale ne se réécrit pas");
  require_(alphabet.DICTATION_WORDS.length >= 40, `dictée : seulement ${alphabet.DICTATION_WORDS.length} mots`);
}

expect("lecture рестора́н", alphabet.transcribe("рестора́н", []), "restoran");
expect("lecture вход", alphabet.transcribe("вход", []), "vkhod");
expect("lecture хорошо́", alphabet.transcribe("хорошо́", []), "khorocho");

const witnesses = [
  ["chitat", 1, "чита́ешь"],
  ["govorit", 5, "говоря́т"],
  ["pisat", 0, "пишу́"],
  ["lyubit", 0, "люблю́"],
  ["khodit", 0, "хожу́"],
  ["khotet", 3, "хоти́м"],
];
for (const [id, person, form] of witnesses) {
  const verb = VERBS.find((v) => v.id === id);
  expect(`conjugaison ${id}[${person}]`, verb?.present[person], form);
}

// ─── 5. Banque de verbes ─────────────────────────────────────────
const ids = new Set();
for (const verb of VERBS) {
  const where = `verbe ${verb.infinitive}`;
  require_(!ids.has(verb.id), `${where} : identifiant en double (${verb.id})`);
  ids.add(verb.id);
  require_(verb.present.length === 6, `${where} : ${verb.present.length} formes de présent`);
  require_(verb.past.length === 2, `${where} : le passé doit avoir masculin et féminin`);
  require_(verb.translation.length > 0, `${where} : sans traduction`);

  for (const form of [...verb.present, ...verb.past, verb.infinitive]) {
    if (vowelCount(form) >= 2 && !form.includes(ACCENT) && !form.includes("ё")) {
      failures.push(`${where} : « ${form} » n'est pas accentué`);
    }
    checks += 1;
  }

  // La terminaison doit correspondre à la classe déclarée : c'est ce que
  // l'onglet enseigne, une erreur ici enseignerait le contraire.
  if (verb.conjugation === "first") {
    const plural = strip(verb.present[5]);
    require_(
      plural.endsWith("ют") || plural.endsWith("ут"),
      `${where} : 1ʳᵉ conjugaison mais они́ ${verb.present[5]}`
    );
    const you = strip(verb.present[1]);
    require_(
      you.endsWith("ешь") || you.endsWith("ёшь"),
      `${where} : 1ʳᵉ conjugaison mais ты ${verb.present[1]}`
    );
  } else if (verb.conjugation === "second") {
    const plural = strip(verb.present[5]);
    require_(
      plural.endsWith("ят") || plural.endsWith("ат"),
      `${where} : 2ᵉ conjugaison mais они́ ${verb.present[5]}`
    );
    const you = strip(verb.present[1]);
    require_(you.endsWith("ишь"), `${where} : 2ᵉ conjugaison mais ты ${verb.present[1]}`);
  }

  if (verb.mutation) {
    require_(
      !verb.present.includes(verb.mutation.naive),
      `${where} : la forme fautive « ${verb.mutation.naive} » est aussi une forme réelle`
    );
  }
}

// L'onglet « passé » a besoin d'assez de verbes à accent mobile.
require_(
  conjugation.SHIFTING_VERBS.length >= 8,
  `seulement ${conjugation.SHIFTING_VERBS.length} verbes à accent mobile au passé`
);

// ─── 6. Liens et routes ──────────────────────────────────────────
function routeExists(href) {
  const segments = href.split("/").filter(Boolean);
  // `servesAPage` et non `existsSync` : un index rangé dans un groupe de
  // routes — app/cases/(index)/page.tsx — sert bien /cases.
  return servesAPage(path.join(ROOT, "app", ...segments));
}

const catalogRoutes = new Set(["/exercices", ...EXERCISE_MODULES.map((m) => m.href)]);
for (const entry of EXERCISE_MODULES) {
  require_(routeExists(entry.href), `module ${entry.id} : route absente (${entry.href})`);
  require_(
    findLesson(entry.lesson.href.replace("/cours/", "")) !== undefined,
    `module ${entry.id} : leçon inexistante (${entry.lesson.href})`
  );
  require_(entry.skills.length >= 4, `module ${entry.id} : moins de 4 compétences`);
  require_(moduleLevels(entry).length > 0, `module ${entry.id} : aucun niveau`);
  for (const skill of entry.skills) {
    require_(
      routeExists(`${entry.href}/[skill]`) || routeExists(`${entry.href}/[caseSlug]`),
      `module ${entry.id} : pas de page de compétence`
    );
    require_(skill.title.length > 0, `module ${entry.id} › ${skill.id} : titre vide`);
  }
}

require_(
  EXERCISE_ROUTES.length === catalogRoutes.size &&
    EXERCISE_ROUTES.every((route) => catalogRoutes.has(route)),
  `lib/exercises/routes.ts ne correspond plus au catalogue : ${EXERCISE_ROUTES.join(", ")}`
);

// ─── Durée : les quatre options disent le MÊME temps ──────────────
//
// L'item porte sur la construction — accusatif nu, за, че́рез, на — et sur
// rien d'autre. Si les leurres ne reprennent pas l'expression de temps de la
// réponse, on ne demande plus « laquelle des quatre constructions ? » mais
// « laquelle des quatre parle de nuits ? », et l'apprenant répond juste sans
// rien savoir.
//
// Le défaut est invisible aux contrôles génériques : quatre options
// distinctes, un seul correcteur qui dit oui, tout passe. Il suffit pourtant
// d'un contexte dont la réponse manque à la table des leurres — le repli
// fournit alors « за час / че́рез час / на час », qui sont bien quatre
// options différentes et une question vide.
{
  const TIME_PREPOSITIONS = ["че́рез ", "за ", "на "];
  const bareTime = (option) => {
    for (const preposition of TIME_PREPOSITIONS) {
      if (option.startsWith(preposition)) return option.slice(preposition.length);
    }
    return option;
  };

  const random = mulberry32(99);
  const offenders = new Map();
  for (let draw = 0; draw < DRAWS; draw += 1) {
    const exercise = numbers.generateNumberExercise("duration", random);
    const times = new Set(exercise.options.map(bareTime));
    if (times.size !== 1) offenders.set(exercise.itemId, [...times].join(" / "));
  }
  for (const [itemId, times] of offenders) {
    failures.push(
      `numbers › duration › ${itemId} : les options ne parlent pas du même temps (${times}) — ` +
        `l'expression de temps désigne la réponse, la construction ne se juge plus`
    );
  }
  checks += 1;
}

// ─── L'alphabet est une liste CLOSE ────────────────────────────────
//
// Le résumé de la compétence promet « trente-trois lettres ». La banque en
// avait vingt-sept : А, Е, К, М, О, Т manquaient, parce que leur forme et
// leur son sont ceux du latin. Sauf que Е se lit « ye », et qu'un apprenant
// qui compte trouve six trous dans la seule liste du russe qui doive être
// close.
//
// Le contrôle compare la banque à l'alphabet, pas à un nombre : ajouter une
// lettre en double ou en oublier une se voit également.
{
  const RUSSIAN_ALPHABET = [
    ..."АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ",
  ];
  const inBank = new Set(alphabet.LETTERS.map((l) => l.letter));
  for (const letter of RUSSIAN_ALPHABET) {
    require_(inBank.has(letter), `alphabet : la lettre « ${letter} » manque à la banque`);
  }
  for (const letter of inBank) {
    require_(
      RUSSIAN_ALPHABET.includes(letter),
      `alphabet : « ${letter} » n'appartient pas à l'alphabet russe`
    );
  }
  require_(
    alphabet.LETTERS.length === RUSSIAN_ALPHABET.length,
    `alphabet : ${alphabet.LETTERS.length} entrées pour ${RUSSIAN_ALPHABET.length} lettres — doublon ?`
  );
}

// ─── Rapport ─────────────────────────────────────────────────────
//
// LES ÉCHECS D'ABORD. Le résumé s'imprimait avant eux, si bien qu'un run
// qui échoue commençait par deux lignes rassurantes — « 8 modules,
// 40 compétences » — avant d'annoncer ce qui n'allait pas. Sur un terminal
// qui défile, c'est la première ligne qu'on lit.
// ─── La phrase à trou écoutée avant de répondre, la leçon à revoir après ──
{
  require_(retry.spokenGap("Я ___ в Москву́.") === "Я … в Москву́.", "phrase à trou : le trou doit devenir une pause, sans aucun mot");
  require_(retry.spokenGap("у́жин") === null, "phrase à trou : un énoncé sans trou (la question elle-même) ne doit pas se prononcer");
  require_(retry.spokenGap("___!") === null, "phrase à trou : sans russe autour du trou, rien à prononcer");
  require_(retry.spokenGap(undefined) === null, "phrase à trou : sans énoncé, rien à prononcer");
  require_(retry.spokenGap(`Я ___ ${"о".repeat(130)}`) === null, "phrase à trou : au-delà de ce que la synthèse prononce");

  const PL = await jiti.import("../lib/courses/practice-lessons.ts");
  for (const [href, expected] of [
    ["/cases/dative", "/cours/datif"],
    ["/cases/genitive", "/cours/genitif"],
    ["/aspect/past", "/cours/aspect-au-passe"],
    ["/aspect/markers", "/cours/aspect-le-principe"],
    ["/conjugation/present2", "/cours/present-deuxieme-conjugaison"],
  ]) {
    const got = PL.lessonForPractice(href)?.href;
    require_(got === expected, `leçon à revoir : ${href} devrait mener à ${expected}, pas à ${got}`);
  }
  const all = PL.allPracticeLessons();
  for (const m of EXERCISE_MODULES) {
    for (const s of m.skills) {
      const link = all[`${m.href}/${s.id}`];
      require_(
        link && findLesson(link.href.replace("/cours/", "")),
        `leçon à revoir : ${m.href}/${s.id} ne mène à aucune leçon`
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problème(s) sur ${checks} contrôles :`);
  for (const failure of failures.slice(0, 40)) console.error(`  - ${failure}`);
  if (failures.length > 40) console.error(`  … et ${failures.length - 40} autres`);
  process.exit(1);
}

const skillTotal = EXERCISE_MODULES.reduce((sum, m) => sum + m.skills.length, 0);
console.log(
  `Exercices : ${EXERCISE_MODULES.length} modules, ${skillTotal} compétences, ${DRAWS} tirages par onglet`
);
console.log(
  `Banque de verbes : ${VERBS.length} verbes, ${conjugation.SHIFTING_VERBS.length} à accent mobile au passé`
);
console.log(`${checks} contrôles passés.`);
