/**
 * Contrôles du module « verbes de mouvement » — `npm run check:motion`.
 *
 * Deux natures de risque, toutes deux silencieuses :
 *
 * 1. LA DONNÉE. Les formes sont écrites à la main parce qu'elles ne se
 *    dérivent pas (идти → шёл, вы- toujours accentué → вы́шел). Une faute de
 *    frappe y enseigne une conjugaison fausse sans rien casser.
 * 2. LA SÉMANTIQUE. Un exercice dont la phrase française dit « je vais » ne
 *    doit jamais attendre « бегу » (je cours). Ce genre d'incohérence est
 *    apparu au premier essai : la génération tirait un verbe de manière là
 *    où le contexte demandait un verbe d'aller.
 * 3. L'ACCORD. Un contexte nomme son sujet (« Куда ты … ? », « Мы до́лго
 *    … ») et déclare la forme attendue. Rien ne vérifiait que les deux
 *    parlaient de la même personne : « Куда ты ___ ? » demandait la 1re du
 *    singulier, donc « Куда ты иду́ ? », donné pour juste. La donnée était
 *    correcte, les distracteurs étaient corrects, et la phrase était
 *    fausse — c'est le trou que le contrôle §4 ferme.
 */
import { createJiti } from "jiti";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "./lib/cyrillic.mjs";
import { practiceInvariants } from "./lib/practice-invariants.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });
const V = await jiti.import("../lib/motion/verbs.ts");
const X = await jiti.import("../lib/motion/exercises.ts");

const failures = [];
let checks = 0;
function require_(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

// L'accent tonique combinant (U+0301) fait partie des formes depuis que la
// banque est accentuée : la classe doit l'accepter, sans quoi toute forme
// accentuée « sort de l'alphabet cyrillique ».
const CYRILLIC = /^[а-яёА-ЯЁ ́-]+$/;
const stripAccent = (f) => f.replace(/́/g, "");

// ─── 1. Paires de base ─────────────────────────────────────────────
// Table de référence recopiée à la main : c'est elle qui attrape une
// coquille dans une forme irrégulière.
const EXPECTED_PAIRS = {
  идти: { multi: "ходить", uni: ["иду", "идёт", "шёл", "шла"], mult: ["хожу", "ходит", "ходил", "ходила"] },
  ехать: { multi: "ездить", uni: ["еду", "едет", "ехал", "ехала"], mult: ["езжу", "ездит", "ездил", "ездила"] },
  лететь: { multi: "летать", uni: ["лечу", "летит", "летел", "летела"], mult: ["летаю", "летает", "летал", "летала"] },
  плыть: { multi: "плавать", uni: ["плыву", "плывёт", "плыл", "плыла"], mult: ["плаваю", "плавает", "плавал", "плавала"] },
  бежать: { multi: "бегать", uni: ["бегу", "бежит", "бежал", "бежала"], mult: ["бегаю", "бегает", "бегал", "бегала"] },
  нести: { multi: "носить", uni: ["несу", "несёт", "нёс", "несла"], mult: ["ношу", "носит", "носил", "носила"] },
};

const ids = new Set();
for (const pair of V.MOTION_PAIRS) {
  require_(!ids.has(pair.id), `identifiant en double : ${pair.id}`);
  ids.add(pair.id);
  const expected = EXPECTED_PAIRS[stripAccent(pair.uni)];
  if (!expected) {
    failures.push(`${pair.uni} absent de la table de référence de check-motion.mjs`);
    continue;
  }
  require_(stripAccent(pair.multi) === expected.multi, `${pair.uni} : multidirectionnel "${pair.multi}" au lieu de "${expected.multi}"`);
  const uni = [pair.uniForms.present1, pair.uniForms.present3, pair.uniForms.pastM, pair.uniForms.pastF];
  const mult = [pair.multiForms.present1, pair.multiForms.present3, pair.multiForms.pastM, pair.multiForms.pastF];
  // La table témoin est écrite sans accent : c'est l'ORTHOGRAPHE qu'elle
  // garde, la position de l'accent étant vérifiée contre le dictionnaire au
  // §5. Recopier les accents ici les figerait deux fois, à deux endroits.
  uni.forEach((form, i) =>
    require_(
      stripAccent(form) === expected.uni[i],
      `${pair.uni} : forme "${form}" au lieu de "${expected.uni[i]}"`
    )
  );
  mult.forEach((form, i) =>
    require_(
      stripAccent(form) === expected.mult[i],
      `${pair.multi} : forme "${form}" au lieu de "${expected.mult[i]}"`
    )
  );
  require_(
    [...uni, ...mult].every((f) => CYRILLIC.test(f)),
    `${pair.uni} : une forme sort de l'alphabet cyrillique`
  );
}
require_(
  V.MOTION_PAIRS.filter((p) => p.isGoing).length >= 4,
  "il faut au moins quatre verbes d'« aller » pour varier les exercices de mode"
);

// ─── 2. Préfixes ───────────────────────────────────────────────────
const EXPECTED_PREFIXES = {
  прийти: { imp: "приходить", pastM: "пришёл", pastF: "пришла", governs: "accusative" },
  уйти: { imp: "уходить", pastM: "ушёл", pastF: "ушла", governs: "genitive" },
  войти: { imp: "входить", pastM: "вошёл", pastF: "вошла", governs: "accusative" },
  // вы- porte l'accent : вы́шел, et surtout pas « вышёл »
  выйти: { imp: "выходить", pastM: "вышел", pastF: "вышла", governs: "genitive" },
  подойти: { imp: "подходить", pastM: "подошёл", pastF: "подошла", governs: "dative" },
  отойти: { imp: "отходить", pastM: "отошёл", pastF: "отошла", governs: "genitive" },
  перейти: { imp: "переходить", pastM: "перешёл", pastF: "перешла", governs: "accusative" },
  дойти: { imp: "доходить", pastM: "дошёл", pastF: "дошла", governs: "genitive" },
  зайти: { imp: "заходить", pastM: "зашёл", pastF: "зашла", governs: "dative" },
  обойти: { imp: "обходить", pastM: "обошёл", pastF: "обошла", governs: "accusative" },
  сойти: { imp: "сходить", pastM: "сошёл", pastF: "сошла", governs: "genitive" },
  // La série en véhicule. Elle est ici pour la même raison que l'autre :
  // l'imperfectif n'est PAS dérivable du perfectif — приехать donne
  // приезжать et non « приездить » —, donc la table le dit une seconde fois,
  // à la main, et un jour où quelqu'un « régularisera » la banque, ce
  // fichier refusera.
  приехать: { imp: "приезжать", pastM: "приехал", pastF: "приехала", governs: "accusative" },
  уехать: { imp: "уезжать", pastM: "уехал", pastF: "уехала", governs: "genitive" },
  въехать: { imp: "въезжать", pastM: "въехал", pastF: "въехала", governs: "accusative" },
  выехать: { imp: "выезжать", pastM: "выехал", pastF: "выехала", governs: "genitive" },
  подъехать: { imp: "подъезжать", pastM: "подъехал", pastF: "подъехала", governs: "dative" },
  отъехать: { imp: "отъезжать", pastM: "отъехал", pastF: "отъехала", governs: "genitive" },
  переехать: { imp: "переезжать", pastM: "переехал", pastF: "переехала", governs: "accusative" },
  доехать: { imp: "доезжать", pastM: "доехал", pastF: "доехала", governs: "genitive" },
  заехать: { imp: "заезжать", pastM: "заехал", pastF: "заехала", governs: "dative" },
  объехать: { imp: "объезжать", pastM: "объехал", pastF: "объехала", governs: "accusative" },
  съехать: { imp: "съезжать", pastM: "съехал", pastF: "съехала", governs: "genitive" },
};

for (const p of V.MOTION_PREFIXES) {
  // Les tables témoins gardent l'ORTHOGRAPHE, pas l'accent : la position de
  // l'accent est vérifiée contre le dictionnaire (§5) et par l'hygiène plus
  // bas. La recopier ici la figerait à deux endroits.
  const expected = EXPECTED_PREFIXES[stripAccent(p.perfective)];
  if (!expected) {
    failures.push(`${p.perfective} absent de la table de référence`);
    continue;
  }
  require_(stripAccent(p.imperfective) === expected.imp, `${p.perfective} : imperfectif "${p.imperfective}" au lieu de "${expected.imp}"`);
  require_(stripAccent(p.pastM) === expected.pastM, `${p.perfective} : passé masculin "${p.pastM}" au lieu de "${expected.pastM}"`);
  require_(stripAccent(p.pastF) === expected.pastF, `${p.perfective} : passé féminin "${p.pastF}" au lieu de "${expected.pastF}"`);
  require_(p.governs === expected.governs, `${p.perfective} : régit "${p.governs}" au lieu de "${expected.governs}"`);
}

// La table témoin sert dans les DEUX sens. Vérifier que chaque entrée de la
// banque y figure attrape un ajout fautif ; vérifier que chaque entrée de la
// table figure dans la banque attrape une SUPPRESSION, qui passait jusqu'ici
// sans un mot — la boucle ci-dessus ne parle que de ce qu'elle voit.
{
  const inBank = new Set(V.MOTION_PREFIXES.map((p) => stripAccent(p.perfective)));
  for (const perfective of Object.keys(EXPECTED_PREFIXES)) {
    require_(inBank.has(perfective), `${perfective} est attendu mais ne figure plus dans la banque`);
  }
  const ids = V.MOTION_PREFIXES.map((p) => p.id);
  require_(
    new Set(ids).size === ids.length,
    "deux préfixes portent le même identifiant : la correction serveur en trouverait un seul"
  );
}

// LA PAGE NE SAIT LÉGENDER QUE DEUX SÉRIES. app/motion/page.tsx groupe les
// préfixes par mode et écrit au-dessus de chaque groupe sa règle de
// formation — celle de идти, celle de е́хать. Un préfixe dans un troisième
// mode ne tomberait dans aucun groupe : il disparaîtrait de la table sans
// rien casser, et l'exercice continuerait de le tirer. On le refuse ici,
// là où la donnée vit, plutôt que d'attendre qu'un œil remarque un trou.
{
  const CAPTIONED = new Set(["foot", "vehicle"]);
  for (const p of V.MOTION_PREFIXES) {
    require_(
      CAPTIONED.has(p.mode),
      `${p.perfective} : mode « ${p.mode} » sans légende — la page groupe par mode ` +
        `et n'affiche que ${[...CAPTIONED].join(" et ")} ; le préfixe serait invisible`
    );
  }
}

// Le signe dur, qui ne s'entend pas et ne se devine pas. Un préfixe qui finit
// par une consonne le prend devant е- : въе́хать, подъе́хать, съе́хать. Sans
// lui, « вехать » se lirait avec un е mouillé — un autre mot, s'il existait.
// La règle est mécanique, donc vérifiable ; c'est pour ça qu'elle est ici et
// pas seulement dans la table.
for (const p of V.MOTION_PREFIXES) {
  if (p.mode !== "vehicle") continue;
  const prefix = stripAccent(p.prefix).replace(/-$/, "");
  if (!/[бвгджзклмнпрстфхцчшщ]$/.test(prefix)) continue;
  require_(
    stripAccent(p.perfective).startsWith(prefix + "ъе"),
    `${p.perfective} : le préfixe « ${p.prefix} » finit par une consonne, il faut le signe dur devant е-`
  );
  require_(
    stripAccent(p.imperfective).startsWith(prefix + "ъе"),
    `${p.imperfective} : signe dur manquant devant е-`
  );
}

// ─── 3. Génération des exercices ───────────────────────────────────
// Les phrases françaises des exercices « mode » et « direction » disent
// « aller » : la réponse ne peut pas être un verbe de manière.
const MANNER_FORMS = new Set(
  V.MOTION_PAIRS.filter((p) => !p.isGoing).flatMap((p) => [
    p.uniForms.present1, p.uniForms.present3, p.uniForms.pastM, p.uniForms.pastF,
    p.multiForms.present1, p.multiForms.present3, p.multiForms.pastM, p.multiForms.pastF,
  ])
);

/** Le mode auquel appartient un perfectif servi comme option. */
const PREFIX_FORM_MODE = new Map(V.MOTION_PREFIXES.map((p) => [p.perfective, p.mode]));
const modeOfPrefixForm = (form) => PREFIX_FORM_MODE.get(form) ?? "?";

for (const skill of X.MOTION_SKILLS) {
  let semanticMismatch = 0;
  let unverifiable = 0;
  let malformed = 0;
  let mixedModes = 0;
  const seenItems = new Set();

  for (let i = 0; i < 800; i++) {
    const ex = X.generateMotionExercise(skill.id);
    seenItems.add(ex.itemId);
    const answer = ex.options[ex.correctIndex];

    if (
      ex.options.length < 2 ||
      new Set(ex.options).size !== ex.options.length ||
      ex.correctIndex < 0
    ) {
      malformed += 1;
    }
    // Le serveur doit rejuger la bonne réponse comme juste, et une mauvaise
    // comme fausse : sans ça, la progression enregistrée serait décorrélée
    // de ce que voit l'apprenant.
    if (X.checkMotionAnswer(ex.itemId, answer) !== true) unverifiable += 1;
    const wrong = ex.options.find((o) => o !== answer);
    if (wrong && X.checkMotionAnswer(ex.itemId, wrong) !== false) unverifiable += 1;
    // Les leurres de la compétence « préposition et cas » sont écrits à la
    // main sans étiquette : c'est la seule qui peut s'en passer.
    if (skill.id !== "government" && wrong && !ex.whyNot?.[wrong]) malformed += 1;
    for (const problem of practiceInvariants(ex, X.rebuildMotionExercise, Math.random)) {
      failures.push(`${skill.id} › ${ex.itemId} : ${problem}`);
    }

    if ((skill.id === "mode" || skill.id === "direction") && MANNER_FORMS.has(answer)) {
      semanticMismatch += 1;
    }
    // Un exercice de préfixe montre un pictogramme de mode et demande le
    // TRAJET. Si les options mélangent les deux séries, le pictogramme donne
    // la réponse et le schéma ne sert plus à rien.
    if (skill.id === "prefix" && new Set(ex.options.map(modeOfPrefixForm)).size !== 1) {
      mixedModes += 1;
    }
    require_(ex.sentenceFr.trim().length > 0, `${skill.id} : exercice sans phrase française`);
    require_(ex.explain.trim().length > 0, `${skill.id} : exercice sans explication`);
    checks -= 2; // ces deux-là sont comptés une fois par tirage, on n'en garde qu'un
  }
  checks += 2;

  require_(malformed === 0, `${skill.id} : ${malformed} exercices malformés (options en double ou insuffisantes)`);
  require_(unverifiable === 0, `${skill.id} : ${unverifiable} exercices que le serveur ne rejuge pas correctement`);
  require_(
    semanticMismatch === 0,
    `${skill.id} : ${semanticMismatch} exercices dont la phrase dit « aller » mais attendent un verbe de manière`
  );
  require_(
    mixedModes === 0,
    `${skill.id} : ${mixedModes} exercices mélangent la série à pied et la série en véhicule — le pictogramme donnerait la réponse`
  );
  require_(seenItems.size >= 3, `${skill.id} : seulement ${seenItems.size} items distincts, la pratique tournerait en rond`);
}

// Un identifiant inventé ne doit jamais être accepté.
require_(
  X.checkMotionAnswer("prefix:inexistant", "прийти") === null,
  "un item inconnu doit être rejeté, pas jugé"
);
require_(
  X.checkMotionAnswer("", "") === null,
  "un identifiant vide doit être rejeté"
);
require_(
  X.rebuildMotionExercise("prefix:inexistant") === null &&
    X.rebuildMotionExercise("mode:idti:на Луну́") === null,
  "un identifiant qu'aucun tirage ne produit ne doit pas être reconstruit"
);

// ─── 4. Le sujet de la phrase et la forme attendue ────────────────
//
// Chaque contexte porte une phrase à trou dont le SUJET est écrit, et
// déclare séparément quelle forme du verbe il attend. Les deux doivent
// parler de la même personne. Rien ne le vérifiait, et deux contextes sur
// douze ne s'accordaient pas :
//
//   « Куда ты ___ ? »          demandait present1  -> « Куда ты иду́ ? »
//   « Мы до́лго ___ по го́роду » demandait pastM     -> « Мы до́лго ходи́л »
//
// Les deux formes étaient justes, les distracteurs aussi ; seule la phrase
// était fausse, et c'est elle que l'apprenant lit.
{
  // Le pronom sujet -> les formes qui s'accordent avec lui.
  const SUBJECT_FORMS = {
    я: ["present1"],
    ты: ["present2"],
    он: ["present3", "pastM"],
    она: ["present3", "pastF"],
    оно: ["present3"],
    мы: ["pastPl"],
    вы: ["pastPl"],
    они: ["pastPl"],
    ребёнок: ["present3", "pastM"],
    автобус: ["present3", "pastM"],
  };

  for (const context of X.DIRECTION_CONTEXTS) {
    // L'infinitif ne s'accorde avec personne : rien à vérifier.
    if (context.form === "infinitive") continue;
    const words = context.marker.toLowerCase().replace(/[^а-яё ]/g, " ").split(/\s+/);
    const subject = words.find((w) => SUBJECT_FORMS[w]);
    if (!subject) continue;
    const allowed = SUBJECT_FORMS[subject];
    require_(
      allowed.includes(context.form),
      `contexte « ${context.id} » : sujet « ${subject} » mais forme « ${context.form} » — ` +
        `la phrase « ${context.marker} » donnerait un accord faux ` +
        `(attendu : ${allowed.join(" ou ")})`
    );
  }
}

// ─── Rapport ───────────────────────────────────────────────────────
// Les formes des PRÉFIXES entrent dans l'hygiène. Elles en étaient absentes
// tant que la table en comptait onze, écrites d'un coup et relues d'un coup ;
// la série en véhicule en ajoute onze, et « приезжать » sans accent ou
// « вы́ехáть » avec deux ne se voient pas à la relecture.
const ACCENTED_FORMS = [
  ...V.MOTION_PAIRS.flatMap((p) =>
    [...Object.values(p.uniForms), ...Object.values(p.multiForms)].filter(Boolean)
  ),
  ...V.MOTION_PREFIXES.flatMap((p) => [p.perfective, p.imperfective, p.pastM, p.pastF]),
];

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

const items = X.MOTION_SKILLS.map((s) => {
  const seen = new Set();
  for (let i = 0; i < 600; i++) seen.add(X.generateMotionExercise(s.id).itemId);
  return `${s.id} ${seen.size}`;
});
console.log(`✓ ${checks} contrôles passés.`);
console.log(
  `  banque : ${V.MOTION_PAIRS.length} paires, ${V.MOTION_PREFIXES.length} préfixes, ${X.MOTION_SKILLS.length} compétences`
);
console.log(`  items distincts par compétence : ${items.join(", ")}`);
