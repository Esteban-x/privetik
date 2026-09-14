/**
 * Contrôles de l'adaptation au niveau et de l'estimation continue —
 * `npm run check:progression`.
 *
 * Ces deux mécanismes n'ont aucune sortie visible qui casserait franchement
 * s'ils dérivaient : un tirage mal pondéré sert juste du vocabulaire trop
 * dur, une estimation mal seuillée affiche juste un niveau trop flatteur.
 * Exactement le genre de panne silencieuse qui a produit les C1 imméritées
 * du test de placement. D'où des seuils explicites, vérifiés ici.
 */
import { createJiti } from "jiti";
import path from "node:path";
import { fileURLToPath } from "node:url";

// L'alias "@" du projet (tsconfig) n'est pas connu de jiti : on le lui donne.
// `fileURLToPath` et pas `.pathname` — ce dernier laisse le chemin encodé
// (%20 pour les espaces) et la résolution échoue.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });
const N = await jiti.import("../lib/grammar/nouns-data.ts");
const S = await jiti.import("../lib/grammar/exercise-selector.ts");
const T = await jiti.import("../lib/grammar/triggers.ts");
const C = await jiti.import("../lib/grammar/cases.ts");
const E = await jiti.import("../lib/progress/level-estimate.ts");
const MOTION = await jiti.import("../lib/motion/exercises.ts");
const ASPECT = await jiti.import("../lib/aspect/exercises.ts");
const PART = await jiti.import("../lib/participles/exercises.ts");
const CONJ = await jiti.import("../lib/conjugation/exercises.ts");
const ALPHA = await jiti.import("../lib/alphabet/exercises.ts");
const NUM = await jiti.import("../lib/numbers/exercises.ts");
const ADJ = await jiti.import("../lib/adjectives/exercises.ts");

/** Progression fictive : toutes les compétences d'un module maîtrisées. */
function solidModule(skills) {
  return skills.map((s) => ({ skill_id: s.id, attempts: 6, correct: 6 }));
}
const ALL_MODULES_SOLID = {
  alphabet: solidModule(ALPHA.ALPHABET_SKILLS),
  conjugation: solidModule(CONJ.CONJUGATION_SKILLS),
  adjectives: solidModule(ADJ.ADJECTIVE_SKILLS),
  motion: solidModule(MOTION.MOTION_SKILLS),
  aspect: solidModule(ASPECT.ASPECT_SKILLS),
  numbers: solidModule(NUM.NUMBER_SKILLS),
  participles: solidModule(PART.PARTICIPLE_SKILLS),
};
const NO_MODULES = {
  alphabet: [],
  conjugation: [],
  adjectives: [],
  motion: [],
  aspect: [],
  numbers: [],
  participles: [],
};

/**
 * Lire le cyrillique et manier les nombres ne plafonnent rien : leur
 * maîtrise se démontre dans tous les autres modules, qui affichent du russe.
 * Ce scénario le vérifie — un apprenant solide partout SAUF là ne doit pas
 * être rabattu.
 */
const WITHOUT_UNGATED = { ...ALL_MODULES_SOLID, alphabet: [], numbers: [] };

const LEVELS = ["A0", "A1", "A2", "B1", "B2", "C1", "C2"];
const failures = [];
let checks = 0;
function require_(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

// ─── 1. Vocabulaire adapté au niveau ───────────────────────────────
let previousSize = 0;
for (const level of LEVELS) {
  const pool = N.nounsForLevel(level);
  require_(pool.length >= 40, `${level} : pool de ${pool.length} mots, trop petit pour varier`);
  require_(
    pool.length >= previousSize,
    `${level} : le pool rétrécit par rapport au niveau précédent (${pool.length} < ${previousSize})`
  );
  previousSize = pool.length;
  const ids = new Set(N.NOUNS.map((n) => n.id));
  require_(
    pool.every((n) => ids.has(n.id)),
    `${level} : le pool contient un mot hors de la banque`
  );
}
require_(
  N.nounsForLevel("C1").length === N.NOUNS.length,
  "un avancé doit avoir accès à toute la banque"
);
require_(
  N.nounsForLevel(undefined).length === N.NOUNS.length,
  "sans niveau connu, toute la banque doit rester disponible"
);
// Le pool d'un débutant doit être réellement plus courant que celui d'un avancé.
const avg = (pool) => pool.reduce((s, n) => s + n.rank, 0) / pool.length;
require_(
  avg(N.nounsForLevel("A0")) < avg(N.nounsForLevel("B2")) / 2,
  "le vocabulaire d'un débutant n'est pas nettement plus courant que celui d'un avancé"
);
require_(
  N.NOUNS.every((n) => Number.isInteger(n.rank) && n.rank > 0),
  "un mot de la banque n'a pas de rang de fréquence exploitable"
);

// ─── 2. Tirage des déclencheurs selon le niveau ────────────────────
function tierShares(caseId, level, runs = 3000) {
  const triggers = T.triggersForCase(caseId);
  const counts = { basic: 0, intermediate: 0, advanced: 0 };
  for (let i = 0; i < runs; i++) counts[S.pickWeightedTrigger(triggers, {}, level).tier] += 1;
  return {
    basic: counts.basic / runs,
    intermediate: counts.intermediate / runs,
    advanced: counts.advanced / runs,
  };
}

for (const caseId of ["genitive", "dative", "instrumental", "prepositional"]) {
  const a0 = tierShares(caseId, "A0");
  const c1 = tierShares(caseId, "C1");
  require_(
    a0.basic >= 0.7,
    `${caseId} : un grand débutant ne reçoit que ${(a0.basic * 100).toFixed(0)}% de déclencheurs essentiels`
  );
  require_(
    a0.advanced <= 0.08,
    `${caseId} : un grand débutant reçoit ${(a0.advanced * 100).toFixed(0)}% de déclencheurs avancés`
  );
  require_(
    c1.advanced >= 0.2,
    `${caseId} : un avancé ne reçoit que ${(c1.advanced * 100).toFixed(0)}% de déclencheurs avancés`
  );
  // La part d'essentiels doit décroître à mesure que le niveau monte.
  const shares = LEVELS.map((l) => tierShares(caseId, l).basic);
  require_(
    shares[0] > shares[shares.length - 1],
    `${caseId} : la part d'essentiels ne diminue pas avec le niveau`
  );
}
// Sans niveau connu, aucun biais ne doit s'appliquer.
const noLevel = tierShares("genitive", undefined);
require_(
  noLevel.advanced > 0.1,
  "sans niveau connu, le tirage ne doit pas écarter les déclencheurs avancés"
);

// ─── 3. Ordre d'apprentissage des cas ──────────────────────────────
require_(
  C.CASES_BY_LEARNING_ORDER.length === C.CASES.length,
  "l'ordre d'apprentissage ne couvre pas les six cas"
);
require_(
  new Set(C.CASES_BY_LEARNING_ORDER.map((c) => c.id)).size === C.CASES.length,
  "un cas apparaît deux fois dans l'ordre d'apprentissage"
);
require_(
  C.CASES_BY_LEARNING_ORDER[0].id === "nominative",
  "l'ordre d'apprentissage doit commencer par le nominatif"
);
// Les niveaux d'entrée ne peuvent que monter le long de la progression.
let previousIndex = -1;
for (const c of C.CASES_BY_LEARNING_ORDER) {
  const index = LEVELS.indexOf(c.introducedAt);
  require_(index >= 0, `${c.id} : niveau d'entrée "${c.introducedAt}" inconnu`);
  require_(
    index >= previousIndex,
    `${c.id} : niveau d'entrée en recul par rapport au cas précédent de la progression`
  );
  previousIndex = index;
}

// ─── 4. Estimation continue du niveau ──────────────────────────────
function progressRows(shareByTier) {
  const rows = [];
  for (const tier of ["basic", "intermediate", "advanced"]) {
    const list = T.TRIGGERS.filter((t) => t.tier === tier);
    const mastered = Math.round(list.length * shareByTier[tier]);
    list.forEach((t, i) => {
      rows.push({ trigger_id: t.id, attempts: 5, correct: i < mastered ? 5 : 1 });
    });
  }
  return rows;
}
const solidCases = C.CASES.map((c) => ({ case_id: c.id, attempts: 40, correct: 34 }));

require_(
  E.computeLevelEstimate([], [], NO_MODULES, 0).level === "A0",
  "sans aucune pratique, l'estimation doit valoir A0"
);
require_(
  E.computeLevelEstimate([], [], NO_MODULES, 0).meaningful === false,
  "sans pratique, l'estimation ne doit pas être présentée comme significative"
);

// ─── 4bis. Couverture du programme ─────────────────────────────────
// Les cas ne sont pas toute la grammaire : une maîtrise parfaite des seuls
// déclencheurs ne peut pas justifier un niveau avancé.
const casesOnly = E.computeLevelEstimate(
  progressRows({ basic: 1, intermediate: 1, advanced: 1 }),
  solidCases,
  NO_MODULES,
  0
);
require_(
  casesOnly.depthLevel === "C1",
  `maîtrise totale des cas : profondeur estimée ${casesOnly.depthLevel} au lieu de C1`
);
require_(
  LEVELS.indexOf(casesOnly.level) < LEVELS.indexOf(casesOnly.depthLevel),
  "sans aucun module travaillé, l'estimation ne doit pas atteindre le niveau que les cas justifieraient"
);
require_(
  casesOnly.blockedBy !== null,
  "un plafond appliqué doit nommer le module qui le provoque, sinon l'apprenant ne sait pas quoi faire"
);

const everything = E.computeLevelEstimate(
  progressRows({ basic: 1, intermediate: 1, advanced: 1 }),
  solidCases,
  ALL_MODULES_SOLID,
  0
);
require_(
  everything.level === everything.depthLevel,
  `tous les modules solides : le plafond ne doit plus s'appliquer (niveau ${everything.level}, profondeur ${everything.depthLevel})`
);
require_(everything.blockedBy === null, "aucun module ne doit être signalé comme bloquant");
require_(
  everything.modules.every((m) => m.state === "solid"),
  "tous les modules devraient être solides dans ce scénario"
);
require_(
  everything.modules.length === 7,
  `${everything.modules.length} modules dans l'estimation, 7 attendus (l'accord de l'adjectif compris)`
);
require_(
  casesOnly.modules.some((m) => m.id === "adjectives"),
  "l'accord de l'adjectif doit entrer dans la couverture du programme"
);

// Une maîtrise s'use : sans pratique depuis STALE_AFTER_DAYS, ce qui était
// maîtrisé ne compte plus — et le reprendre suffit à le rendre.
{
  const longAgo = new Date(Date.now() - (E.STALE_AFTER_DAYS + 5) * 864e5).toISOString();
  const recently = new Date(Date.now() - 3 * 864e5).toISOString();
  const full = progressRows({ basic: 1, intermediate: 1, advanced: 1 });
  const stale = E.computeLevelEstimate(
    full.map((r) => ({ ...r, last_seen: longAgo })),
    solidCases,
    ALL_MODULES_SOLID,
    0
  );
  const fresh = E.computeLevelEstimate(
    full.map((r) => ({ ...r, last_seen: recently })),
    solidCases,
    ALL_MODULES_SOLID,
    0
  );
  require_(stale.masteredTriggers === 0, `maîtrise ancienne : ${stale.masteredTriggers} déclencheurs encore comptés`);
  require_(
    LEVELS.indexOf(stale.depthLevel) < LEVELS.indexOf(fresh.depthLevel),
    `une maîtrise vieille de ${E.STALE_AFTER_DAYS + 5} jours garde le niveau ${stale.depthLevel}`
  );
  require_(fresh.depthLevel === "C1", `une maîtrise récente devrait valoir C1 (${fresh.depthLevel})`);
}

// Le choix inverse, verrouillé : « Lire et écrire » et « Nombres » comptent
// dans l'affichage mais ne rabattent jamais le niveau. Sans cette
// assertion, leur donner un plafond un jour passerait inaperçu — et ferait
// retomber à A1 des apprenants solides sur toute la grammaire.
const withoutUngated = E.computeLevelEstimate(
  progressRows({ basic: 1, intermediate: 1, advanced: 1 }),
  solidCases,
  WITHOUT_UNGATED,
  0
);
require_(
  withoutUngated.level === withoutUngated.depthLevel,
  `alphabet et nombres non travaillés : le niveau ne doit pas être plafonné (niveau ${withoutUngated.level}, profondeur ${withoutUngated.depthLevel})`
);
require_(
  withoutUngated.blockedBy === null,
  "aucun module sans plafond ne doit être signalé comme bloquant"
);
require_(
  withoutUngated.modules.filter((m) => m.state === "untouched").length === 2,
  "les deux modules non travaillés doivent rester visibles dans l'estimation"
);

// Travailler les modules sans travailler les cas ne fait pas monter non plus.
const modulesOnly = E.computeLevelEstimate([], [], ALL_MODULES_SOLID, 0);
require_(
  modulesOnly.level === "A0",
  `modules seuls, sans maîtrise des cas : estimé ${modulesOnly.level} au lieu de A0`
);

// Monotonie : maîtriser davantage ne peut jamais faire baisser le niveau.
const steps = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
let previousLevel = -1;
for (const share of steps) {
  const est = E.computeLevelEstimate(
    progressRows({ basic: share, intermediate: share * 0.8, advanced: share * 0.6 }),
    solidCases,
    ALL_MODULES_SOLID,
    0
  );
  const index = LEVELS.indexOf(est.level);
  require_(
    index >= previousLevel,
    `estimation non monotone : à ${(share * 100).toFixed(0)}% de maîtrise, le niveau retombe à ${est.level}`
  );
  previousLevel = index;
}
require_(previousLevel >= LEVELS.indexOf("B2"), "une maîtrise quasi totale doit atteindre au moins B2");

// Une pratique large mais superficielle ne doit pas décrocher un niveau élevé :
// beaucoup de tentatives, précision au niveau du hasard.
const shaky = T.TRIGGERS.map((t) => ({ trigger_id: t.id, attempts: 10, correct: 4 }));
const shakyEstimate = E.computeLevelEstimate(
  shaky,
  C.CASES.map((c) => ({ case_id: c.id, attempts: 100, correct: 40 })),
  ALL_MODULES_SOLID,
  0
);
require_(
  shakyEstimate.level === "A0",
  `une pratique à 40% de réussite est estimée ${shakyEstimate.level} au lieu de A0`
);
require_(
  shakyEstimate.cases.every((c) => c.state !== "solid"),
  "un cas à 40% de réussite ne doit jamais être présenté comme solide"
);

// La maîtrise affichée doit dire la même chose que le tirage des exercices.
const partial = progressRows({ basic: 1, intermediate: 0, advanced: 0 });
const estimate = E.computeLevelEstimate(partial, solidCases, ALL_MODULES_SOLID, 0);
const basicTier = estimate.tiers.find((t) => t.tier === "basic");
require_(
  basicTier.mastered === basicTier.total,
  "tous les déclencheurs essentiels réussis devraient être comptés comme maîtrisés"
);
const progressMap = Object.fromEntries(
  partial.map((r) => [r.trigger_id, { attempts: r.attempts, correct: r.correct }])
);
require_(
  S.tierMastered("basic", T.triggersForCase("genitive"), progressMap),
  "le sélecteur et l'estimation ne s'accordent pas sur ce qu'est un palier maîtrisé"
);

// ─── Rapport ───────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\n✗ ${failures.length} problème(s) sur ${checks} contrôles :\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error("");
  process.exit(1);
}

const a0 = tierShares("genitive", "A0");
const c1 = tierShares("genitive", "C1");
console.log(`✓ ${checks} contrôles passés.`);
console.log(
  `  vocabulaire : ${N.nounsForLevel("A0").length} mots à A0 → ${N.NOUNS.length} à B2 ` +
    `(rang moyen ${Math.round(avg(N.nounsForLevel("A0")))} → ${Math.round(avg(N.NOUNS))})`
);
console.log(
  `  tirage (génitif) : A0 ${(a0.basic * 100).toFixed(0)}% essentiels / ${(a0.advanced * 100).toFixed(0)}% avancés · ` +
    `C1 ${(c1.basic * 100).toFixed(0)}% / ${(c1.advanced * 100).toFixed(0)}%`
);
console.log(
  `  cas dans l'ordre d'apprentissage : ${C.CASES_BY_LEARNING_ORDER.map((c) => c.nameFr).join(" → ")}`
);
console.log(
  `  couverture : maîtrise totale des cas seule → ${casesOnly.level} ` +
    `(plafonné depuis ${casesOnly.depthLevel} par « ${casesOnly.blockedBy.label} »)`
);
