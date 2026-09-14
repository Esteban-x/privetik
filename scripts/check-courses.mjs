/**
 * Contrôles du module « Cours » — `npm run check:courses`.
 *
 * Une centaine de leçons rédigées à la main, c'est une centaine d'occasions
 * de laisser un tableau bancal, un slug en double ou un lien d'exercice vers
 * une route qui n'existe plus. Rien de tout cela ne casse la compilation :
 * TypeScript vérifie la forme des objets, pas leur cohérence. Ce script
 * vérifie ce que le typage ne peut pas voir :
 *
 * 1. INTÉGRITÉ : slugs uniques et bien formés, titres non vides, niveaux
 *    connus, durées plausibles.
 * 2. STRUCTURE DES BLOCS : autant de cellules que d'en-têtes dans chaque
 *    ligne de tableau, pas de bloc vide, pas d'exemple sans traduction.
 * 3. LANGUES : le champ `ru` d'un exemple contient bien du cyrillique, le
 *    champ `fr` n'en contient pas — une inversion se voit sinon seulement à
 *    la lecture de la page.
 * 4. LIENS : chaque lien « pratique » pointe vers une route réellement
 *    servie par app/, identifiant de module compris.
 * 5. ÉDITORIAL : chaque leçon a ses mots-clés et son bloc « à retenir »,
 *    chaque résumé tient sur une ligne de résultat de recherche.
 */
import { createJiti } from "jiti";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });

const { UNITS, LESSONS, TOTAL_LESSONS, TOTAL_MINUTES } = await jiti.import(
  "../lib/courses/catalog.ts"
);
const { CEFR_LEVELS } = await jiti.import("../lib/supabase/types.ts");
const { CASES } = await jiti.import("../lib/grammar/cases.ts");
const { MOTION_SKILLS } = await jiti.import("../lib/motion/exercises.ts");
const { ASPECT_SKILLS } = await jiti.import("../lib/aspect/exercises.ts");
const { PARTICIPLE_SKILLS } = await jiti.import("../lib/participles/exercises.ts");
const { ADJECTIVE_SKILLS } = await jiti.import("../lib/adjectives/exercises.ts");
const { ALPHABET_SKILLS } = await jiti.import("../lib/alphabet/exercises.ts");
const { CONJUGATION_SKILLS } = await jiti.import("../lib/conjugation/exercises.ts");
const { NUMBER_SKILLS } = await jiti.import("../lib/numbers/exercises.ts");

const failures = [];
let checks = 0;
function require_(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

// ── Les routes réellement servies ───────────────────────────────
// Balayage de app/ : tout dossier contenant page.tsx est une route. Les
// segments dynamiques deviennent une liste d'identifiants connus, pour que
// /cases/genitif (au lieu de /cases/genitive) soit refusé.
//
// CETTE TABLE DÉCIDE DE CE QU'UNE LEÇON A LE DROIT DE VISER, et il y
// manquait trois modules entiers. /alphabet, /conjugation et /numbers ont
// chacun leurs compétences et leurs pages, mais aucun identifiant ici : la
// route /numbers/time n'entrait donc jamais dans `routes`, un lien pratique
// vers elle faisait échouer `npm run check`, et le catalogue s'est écrit
// sans jamais y mener. Quarante-deux liens pratiques, tous vers les cinq
// modules que la table connaissait — l'omission avait fini par façonner le
// contenu.
const DYNAMIC_IDS = {
  "/cases": CASES.map((c) => c.id),
  "/motion": MOTION_SKILLS.map((s) => s.id),
  "/aspect": ASPECT_SKILLS.map((s) => s.id),
  "/participles": PARTICIPLE_SKILLS.map((s) => s.id),
  "/adjectives": ADJECTIVE_SKILLS.map((s) => s.id),
  "/alphabet": ALPHABET_SKILLS.map((s) => s.id),
  "/conjugation": CONJUGATION_SKILLS.map((s) => s.id),
  "/numbers": NUMBER_SKILLS.map((s) => s.id),
};

function collectRoutes(dir, prefix, out) {
  // La page d'un groupe sert le préfixe COURANT : app/cases/(index)/page.tsx
  // répond sur /cases. Sans cette ligne, seuls les sous-dossiers seraient vus.
  if (prefix && fs.existsSync(path.join(dir, "page.tsx"))) out.add(prefix);

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    // Dossiers hors routage : api et dossiers privés.
    if (name === "api" || name.startsWith("_")) continue;
    // UN GROUPE DE ROUTES SE TRAVERSE, IL NE SE SAUTE PAS. `(index)`
    // n'ajoute aucun segment à l'URL — c'est tout son intérêt — mais la page
    // qu'il contient est bien servie. En l'ignorant, ce balayage a cessé de
    // voir /cases, /cours et /guides à la seconde où leurs index sont entrés
    // dans un groupe, et trois liens pratiques du catalogue sont devenus
    // « une route absente » alors qu'ils marchaient parfaitement.
    if (name.startsWith("(")) {
      collectRoutes(path.join(dir, name), prefix, out);
      continue;
    }
    const full = path.join(dir, name);
    const isDynamic = name.startsWith("[");
    if (isDynamic) {
      const ids = DYNAMIC_IDS[prefix] ?? [];
      if (fs.existsSync(path.join(full, "page.tsx"))) {
        for (const id of ids) out.add(`${prefix}/${id}`);
      }
      collectRoutes(full, `${prefix}/:id`, out);
      continue;
    }
    const route = `${prefix}/${name}`;
    if (fs.existsSync(path.join(full, "page.tsx"))) out.add(route);
    collectRoutes(full, route, out);
  }
}

const routes = new Set(["/"]);
collectRoutes(path.join(ROOT, "app"), "", routes);

// ── Vérifications ───────────────────────────────────────────────
const CYRILLIC = /[Ѐ-ӿ]/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

const seenUnitSlugs = new Set();
const seenLessonSlugs = new Set();
const seenTitles = new Map();

for (const unit of UNITS) {
  const where = `unité « ${unit.title} »`;
  require_(SLUG.test(unit.slug), `${where} : slug mal formé (${unit.slug})`);
  require_(!seenUnitSlugs.has(unit.slug), `${where} : slug d'unité en double (${unit.slug})`);
  seenUnitSlugs.add(unit.slug);
  require_(unit.titleRu.trim().length > 0, `${where} : titre russe vide`);
  require_(CYRILLIC.test(unit.titleRu), `${where} : titre russe sans cyrillique`);
  require_(unit.subtitle.trim().length > 20, `${where} : sous-titre trop court`);
  require_(HEX.test(unit.color), `${where} : couleur invalide (${unit.color})`);
  require_(unit.lessons.length > 0, `${where} : unité sans leçon`);

  for (const lesson of unit.lessons) {
    const l = `${unit.title} › ${lesson.title}`;
    require_(SLUG.test(lesson.slug), `${l} : slug mal formé (${lesson.slug})`);
    require_(!seenLessonSlugs.has(lesson.slug), `${l} : slug de leçon en double (${lesson.slug})`);
    seenLessonSlugs.add(lesson.slug);

    const clash = seenTitles.get(lesson.title);
    require_(clash === undefined, `${l} : titre déjà utilisé par ${clash ?? ""}`);
    seenTitles.set(lesson.title, l);

    require_(CEFR_LEVELS.includes(lesson.level), `${l} : niveau inconnu (${lesson.level})`);
    require_(
      Number.isInteger(lesson.minutes) && lesson.minutes >= 3 && lesson.minutes <= 45,
      `${l} : durée implausible (${lesson.minutes})`
    );
    require_(CYRILLIC.test(lesson.titleRu), `${l} : titre russe sans cyrillique`);
    require_(
      lesson.summary.length >= 40 && lesson.summary.length <= 220,
      `${l} : résumé de ${lesson.summary.length} caractères (attendu 40–220)`
    );
    require_(lesson.keywords.length >= 3, `${l} : moins de 3 mots-clés`);
    require_(
      new Set(lesson.keywords).size === lesson.keywords.length,
      `${l} : mots-clés en double`
    );
    require_(lesson.sections.length >= 3, `${l} : moins de 3 blocs`);
    require_(
      lesson.sections.some((s) => s.kind === "keypoints"),
      `${l} : pas de bloc « à retenir »`
    );

    for (const [i, section] of lesson.sections.entries()) {
      const b = `${l} › bloc ${i + 1} (${section.kind})`;
      switch (section.kind) {
        case "prose":
        case "pitfall":
          require_(section.body.length > 0, `${b} : aucun paragraphe`);
          require_(
            section.body.every((p) => p.trim().length > 30),
            `${b} : paragraphe trop court`
          );
          break;
        case "table":
          require_(section.head.length >= 2, `${b} : moins de deux colonnes`);
          require_(section.rows.length > 0, `${b} : tableau vide`);
          for (const [r, row] of section.rows.entries()) {
            require_(
              row.length === section.head.length,
              `${b} : ligne ${r + 1} a ${row.length} cellules pour ${section.head.length} colonnes`
            );
          }
          break;
        case "examples":
          require_(section.items.length > 0, `${b} : aucun exemple`);
          for (const item of section.items) {
            require_(CYRILLIC.test(item.ru), `${b} : « ${item.ru} » sans cyrillique côté russe`);
            require_(item.fr.trim().length > 0, `${b} : « ${item.ru} » sans traduction`);
            require_(
              !CYRILLIC.test(item.fr),
              `${b} : traduction en cyrillique — champs ru/fr inversés ? (${item.fr})`
            );
          }
          break;
        case "keypoints":
          require_(section.items.length >= 2, `${b} : moins de deux points`);
          break;
        default:
          failures.push(`${b} : type de bloc inconnu`);
      }
    }

    for (const link of lesson.practice ?? []) {
      require_(routes.has(link.href), `${l} : lien pratique vers une route absente (${link.href})`);
      require_(link.label.trim().length > 0, `${l} : lien pratique sans libellé`);
    }
  }
}

// ── Quiz de fin de leçon ────────────────────────────────────────
// Rejoue exactement ce que la page sert (tirage semé par le slug) : une
// question dont la bonne réponse manque, ou deux options identiques, serait
// une question fausse posée à tous les lecteurs.
const Q = await jiti.import("../lib/courses/quiz.ts");
let quizzes = 0;
let quizQuestions = 0;
let bankQuestions = 0;
// Distinctes à la lettre près : un exercice d'accent tonique n'oppose que
// des accents, c'est voulu.
const plain = (s) => s.trim();
for (const { lesson, unit } of LESSONS) {
  const l = `${unit.slug}/${lesson.slug}`;
  const quiz = Q.buildLessonQuiz(lesson, unit);
  require_(
    JSON.stringify(quiz) === JSON.stringify(Q.buildLessonQuiz(lesson, unit)),
    `${l} : le quiz n'est pas déterministe`
  );
  // Une phrase répétée (même russe, autre intonation) ne fait pas une question.
  const ruList = lesson.sections.filter((s) => s.kind === "examples").flatMap((s) => s.items.map((i) => i.ru.replace(/́/g, "")));
  const examples = ruList.filter((ru) => ruList.indexOf(ru) === ruList.lastIndexOf(ru)).length;
  if (examples >= 3 || (lesson.practice ?? []).some((p) => Q.skillsForLink(p.href, lesson.level).length > 0)) {
    require_(quiz.length >= Q.QUIZ_MIN, `${l} : pas de quiz (${quiz.length} question(s)) alors que la leçon a de quoi en faire un`);
  }
  if (quiz.length > 0) quizzes += 1;
  const ids = new Set();
  for (const q of quiz) {
    quizQuestions += 1;
    if (!q.id.startsWith("example:")) bankQuestions += 1;
    const where = `${l} · ${q.id}`;
    require_(!ids.has(q.question), `${where} : question en double`);
    ids.add(q.question);
    require_(q.question.trim().length > 0 && q.prompt.trim().length > 0, `${where} : question ou consigne vide`);
    // Deux options existent dans les banques : forme courte ou longue, actif ou passif.
    require_(q.options.length >= 2 && q.options.length <= 4, `${where} : ${q.options.length} options`);
    require_(q.correctIndex >= 0 && q.correctIndex < q.options.length, `${where} : bonne réponse hors des options`);
    require_(new Set(q.options.map(plain)).size === q.options.length, `${where} : options identiques (${q.options.join(" / ")})`);
    for (const form of Object.keys(q.whyNot ?? {})) {
      require_(q.options.includes(form) && form !== q.options[q.correctIndex], `${where} : note sur « ${form} », qui n'est pas un leurre affiché`);
    }
  }
}
require_(quizzes >= 110, `seulement ${quizzes} leçons ont un quiz`);
require_(bankQuestions >= 100, `seulement ${bankQuestions} questions tirées des banques d'exercices`);

require_(LESSONS.length === TOTAL_LESSONS, "TOTAL_LESSONS ne correspond pas au catalogue");
require_(TOTAL_MINUTES > 0, "durée totale nulle");

// ── Rapport ─────────────────────────────────────────────────────
const levelCount = {};
for (const { lesson } of LESSONS) levelCount[lesson.level] = (levelCount[lesson.level] ?? 0) + 1;

console.log(
  `Cours : ${UNITS.length} unités, ${LESSONS.length} leçons, ${Math.round(TOTAL_MINUTES / 60)} h de lecture`
);
console.log(
  `Par niveau : ${CEFR_LEVELS.map((l) => `${l} ${levelCount[l] ?? 0}`).join("  ")}`
);
console.log(`Quiz : ${quizzes} leçons, ${quizQuestions} questions (${bankQuestions} tirées des banques)`);

if (failures.length > 0) {
  console.error(`\n${failures.length} problème(s) sur ${checks} contrôles :`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`${checks} contrôles passés.`);
