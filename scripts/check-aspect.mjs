/**
 * Contrôles du module « aspect verbal » — `npm run check:aspect`.
 *
 * Trois risques, tous silencieux :
 *
 * 1. LES FORMES. Les paires ne se dérivent pas (говори́ть → сказа́ть,
 *    брать → взять) : une coquille y enseigne un verbe qui n'existe pas.
 * 2. L'ACCORD PHRASE / RÉPONSE. La phrase française nomme le verbe, la
 *    réponse attendue doit donc être une forme de CE verbe. Un contexte
 *    relié à plusieurs paires produisait « J'ai lu ce livre » → « решил ».
 * 3. L'AMBIGUÏTÉ. Le module ne doit contenir que des contextes où l'aspect
 *    est forcé. On vérifie au moins que chaque contexte porte une
 *    justification explicite, et que les marqueurs nommés existent.
 */
import { createJiti } from "jiti";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "./lib/cyrillic.mjs";
import { practiceInvariants } from "./lib/practice-invariants.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });
const V = await jiti.import("../lib/aspect/verbs.ts");
const X = await jiti.import("../lib/aspect/exercises.ts");

const failures = [];
let checks = 0;
function require_(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

// L'accent tonique combinant fait partie des formes depuis que la banque
// est accentuée.
const CYRILLIC = /^[а-яёА-ЯЁ ́-]+$/;
const stripAccent = (f) => f.replace(/́/g, "");

// ─── 1. Paires : table de référence relue à la main ────────────────
const EXPECTED = {
  делать: ["сделать", "делал", "сделал", "делаю", "сделаю"],
  писать: ["написать", "писал", "написал", "пишу", "напишу"],
  читать: ["прочитать", "читал", "прочитал", "читаю", "прочитаю"],
  смотреть: ["посмотреть", "смотрел", "посмотрел", "смотрю", "посмотрю"],
  готовить: ["приготовить", "готовил", "приготовил", "готовлю", "приготовлю"],
  строить: ["построить", "строил", "построил", "строю", "построю"],
  учить: ["выучить", "учил", "выучил", "учу", "выучу"],
  пить: ["выпить", "пил", "выпил", "пью", "выпью"],
  есть: ["съесть", "ел", "съел", "ем", "съем"],
  звонить: ["позвонить", "звонил", "позвонил", "звоню", "позвоню"],
  видеть: ["увидеть", "видел", "увидел", "вижу", "увижу"],
  завтракать: ["позавтракать", "завтракал", "позавтракал", "завтракаю", "позавтракаю"],
  решать: ["решить", "решал", "решил", "решаю", "решу"],
  получать: ["получить", "получал", "получил", "получаю", "получу"],
  забывать: ["забыть", "забывал", "забыл", "забываю", "забуду"],
  объяснять: ["объяснить", "объяснял", "объяснил", "объясняю", "объясню"],
  повторять: ["повторить", "повторял", "повторил", "повторяю", "повторю"],
  отвечать: ["ответить", "отвечал", "ответил", "отвечаю", "отвечу"],
  встречать: ["встретить", "встречал", "встретил", "встречаю", "встречу"],
  покупать: ["купить", "покупал", "купил", "покупаю", "куплю"],
  открывать: ["открыть", "открывал", "открыл", "открываю", "открою"],
  закрывать: ["закрыть", "закрывал", "закрыл", "закрываю", "закрою"],
  начинать: ["начать", "начинал", "начал", "начинаю", "начну"],
  заканчивать: ["закончить", "заканчивал", "закончил", "заканчиваю", "закончу"],
  вставать: ["встать", "вставал", "встал", "встаю", "встану"],
  давать: ["дать", "давал", "дал", "даю", "дам"],
  изучать: ["изучить", "изучал", "изучил", "изучаю", "изучу"],
  говорить: ["сказать", "говорил", "сказал", "говорю", "скажу"],
  брать: ["взять", "брал", "взял", "беру", "возьму"],
  класть: ["положить", "клал", "положил", "кладу", "положу"],
  садиться: ["сесть", "садился", "сел", "сажусь", "сяду"],
  ложиться: ["лечь", "ложился", "лёг", "ложусь", "лягу"],
};

const ids = new Set();
for (const pair of V.ASPECT_PAIRS) {
  require_(!ids.has(pair.id), `identifiant en double : ${pair.id}`);
  ids.add(pair.id);
  const expected = EXPECTED[stripAccent(pair.imperfective)];
  if (!expected) {
    failures.push(`${pair.imperfective} absent de la table de référence de check-aspect.mjs`);
    continue;
  }
  const got = [pair.perfective, pair.impPast, pair.perfPast, pair.impPresent1, pair.perfFuture1];
  const labels = ["perfectif", "passé imp.", "passé perf.", "présent 1sg", "futur perf. 1sg"];
  // La table témoin garde l'ORTHOGRAPHE ; la position de l'accent est
  // vérifiée contre le dictionnaire au §5.
  got.forEach((form, i) => {
    require_(
      stripAccent(form) === expected[i],
      `${pair.imperfective} : ${labels[i]} "${form}" au lieu de "${expected[i]}"`
    );
  });
  const imperatives = [
    pair.impImperative,
    pair.perfImperative,
    pair.impImperativeTy,
    pair.perfImperativeTy,
  ].filter(Boolean);
  for (const form of [...got, pair.impPastF, pair.perfPastF, ...imperatives]) {
    require_(CYRILLIC.test(form), `${pair.imperfective} : forme "${form}" hors alphabet cyrillique`);
  }
  // Les deux membres d'une paire doivent différer partout où l'exercice les
  // oppose : sinon le QCM n'a pas de bonne réponse.
  require_(
    pair.impPast !== pair.perfPast && pair.impPastF !== pair.perfPastF,
    `${pair.imperfective} : les deux passés sont identiques, l'exercice n'aurait pas de réponse`
  );
  // Un impératif absent est une décision (ви́деть n'en a pas d'usuel) : les
  // deux membres doivent alors l'être ensemble, sans quoi l'exercice
  // proposerait un seul bouton.
  require_(
    !pair.impImperative === !pair.perfImperative &&
      !pair.impImperativeTy === !pair.perfImperativeTy,
    `${pair.imperfective} : un seul des deux impératifs est renseigné`
  );
  require_(
    !pair.impImperative || pair.impImperative !== pair.perfImperative,
    `${pair.imperfective} : les deux impératifs (vous) sont identiques`
  );
  require_(
    !pair.impImperativeTy || pair.impImperativeTy !== pair.perfImperativeTy,
    `${pair.imperfective} : les deux impératifs (tu) sont identiques`
  );
  require_(
    ["prefixe", "suffixe", "suppletion"].includes(pair.formation),
    `${pair.imperfective} : procédé de formation inconnu "${pair.formation}"`
  );
}
require_(
  V.ASPECT_PAIRS.length >= 25,
  `seulement ${V.ASPECT_PAIRS.length} paires, la pratique tournerait en rond`
);
for (const formation of ["prefixe", "suffixe", "suppletion"]) {
  const n = V.ASPECT_PAIRS.filter((p) => p.formation === formation).length;
  require_(n >= 4, `seulement ${n} paires « ${formation} » : le procédé serait sous-représenté`);
}

// ─── 2. Contextes : une paire, une justification ───────────────────
for (const [label, contexts] of [
  ["passé", X.PAST_CONTEXTS],
  ["futur", X.FUTURE_CONTEXTS],
  ["impératif", X.IMPERATIVE_CONTEXTS],
]) {
  const seen = new Set();
  for (const c of contexts) {
    require_(!seen.has(c.id), `${label} : identifiant de contexte en double "${c.id}"`);
    seen.add(c.id);
    require_(
      typeof c.pair === "string" && V.getPair(c.pair) !== undefined,
      `${label} / ${c.id} : paire "${c.pair}" inconnue — un contexte doit être lié à UNE paire`
    );
    require_(
      ["imperfective", "perfective"].includes(c.answer),
      `${label} / ${c.id} : aspect attendu invalide`
    );
    require_(
      c.why.trim().length > 20,
      `${label} / ${c.id} : justification absente ou trop courte — l'item serait un piège, pas une leçon`
    );
    require_(c.fr.trim().length > 0, `${label} / ${c.id} : phrase française manquante`);
    require_(c.template.includes("___"), `${label} / ${c.id} : le gabarit russe n'a pas de trou`);
  }
  require_(contexts.length >= 5, `${label} : seulement ${contexts.length} contextes`);
}

// Le mode « marqueurs » ne tire que des contextes dont le mot déclencheur
// est nommé : sinon la consigne poserait une question sans objet.
for (const id of Object.keys(X.MARKER_OF)) {
  require_(
    X.PAST_CONTEXTS.some((c) => c.id === id),
    `MARKER_OF référence un contexte inexistant : "${id}"`
  );
}
require_(
  Object.keys(X.MARKER_OF).length >= 8,
  `seulement ${Object.keys(X.MARKER_OF).length} marqueurs nommés`
);

// ─── 3. Génération et correction ───────────────────────────────────
for (const skill of X.ASPECT_SKILLS) {
  let malformed = 0;
  let unverifiable = 0;
  let mismatchedPair = 0;
  const items = new Set();

  for (let i = 0; i < 800; i++) {
    const ex = X.generateAspectExercise(skill.id);
    items.add(ex.itemId);
    const answer = ex.options[ex.correctIndex];

    if (ex.options.length < 2 || new Set(ex.options).size !== ex.options.length) malformed += 1;
    if (X.checkAspectAnswer(ex.itemId, answer) !== true) unverifiable += 1;
    const wrong = ex.options.find((o) => o !== answer);
    if (wrong && X.checkAspectAnswer(ex.itemId, wrong) !== false) unverifiable += 1;
    // Deux options, deux aspects : la mauvaise doit toujours dire ce qu'elle aurait affirmé.
    if (wrong && !ex.whyNot?.[wrong]) malformed += 1;
    for (const problem of practiceInvariants(ex, X.rebuildAspectExercise, Math.random)) {
      failures.push(`${skill.id} › ${ex.itemId} : ${problem}`);
    }

    // La réponse doit être une forme de la paire du contexte : c'est le bug
    // « J'ai lu ce livre → решил » qu'on interdit ici par construction.
    if (skill.id !== "pairs") {
      const pair = V.getPair(ex.itemId.split(":")[2]);
      const forms = pair
        ? [
            pair.impPast,
            pair.perfPast,
            pair.impPastF,
            pair.perfPastF,
            pair.perfFuture1,
            `буду ${pair.imperfective}`,
            pair.impImperative,
            pair.perfImperative,
            pair.impImperativeTy,
            pair.perfImperativeTy,
          ].filter(Boolean)
        : [];
      if (!pair || !forms.includes(answer)) mismatchedPair += 1;
    }
  }

  require_(malformed === 0, `${skill.id} : ${malformed} exercices malformés`);
  require_(
    unverifiable === 0,
    `${skill.id} : ${unverifiable} exercices que le serveur ne rejuge pas correctement`
  );
  require_(
    mismatchedPair === 0,
    `${skill.id} : ${mismatchedPair} exercices dont la réponse n'appartient pas au verbe de la phrase`
  );
  require_(items.size >= 5, `${skill.id} : seulement ${items.size} items distincts`);
}

require_(
  X.checkAspectAnswer("past:inexistant:chitat", "читал") === null,
  "un contexte inconnu doit être rejeté"
);
require_(X.checkAspectAnswer("", "") === null, "un identifiant vide doit être rejeté");
require_(
  X.rebuildAspectExercise("past:inexistant:chitat") === null && X.rebuildAspectExercise("") === null,
  "un identifiant inventé ne doit pas être reconstruit"
);

// ─── Rapport ───────────────────────────────────────────────────────
/**
 * Un mot cyrillique entier. `\b` est inutilisable ici : JavaScript le
 * définit sur [A-Za-z0-9_], si bien que /\bона\b/ ne matche jamais « Она »
 * et qu'un contrôle écrit ainsi passe toujours, quoi qu'il vérifie.
 */
const CYRILLIC_WORD = (alternatives) =>
  // Deux pièges de l'accent combinant. Il faut l'exclure de la classe de
  // BORNE — sinon la limite tombe entre « вы » et « ́учишь », et
  // « вы́учишь » est lu comme un « вы » de politesse — et le retirer du
  // TEXTE cherché, sinon « Она́ » ne correspond plus à « она ». Les deux
  // se sont produits le jour où la banque a été accentuée.
  new RegExp(`(^|[^а-яёА-ЯЁ\u0301])(${alternatives})([^а-яёА-ЯЁ\u0301]|$)`, "i");

// ─── 6. La phrase et la forme attendue disent la même personne ────
//
// Un contexte écrit sa phrase ET déclare la forme du verbe qu'il attend.
// Rien ne vérifiait que les deux s'accordent, et deux familles de gabarits
// ne s'accordaient pas :
//
//   « Она́ сра́зу ___ на мой вопро́с » recevait le passé MASCULIN, faute
//   d'une forme féminine dans la banque. Trois contextes sur dix-huit.
//
//   « ___ по-ру́сски ка́ждый день — так ТЫ бы́стрее вы́учишь язы́к » recevait
//   l'impératif de politesse : « Чита́йте … так ты ». La phrase se
//   contredisait toute seule, huit fois sur douze.
//
// Ces deux contrôles lisent la phrase russe et refusent le désaccord.
{
  for (const context of X.PAST_CONTEXTS) {
    // ATTENTION : \b ne marche PAS sur du cyrillique en JavaScript — il est
    // défini sur [A-Za-z0-9_], donc /\bона\b/ ne matche jamais « Она ».
    // D'où des bornes écrites à la main.
    const feminine = CYRILLIC_WORD("она").test(stripAccent(context.template));
    const declared = context.subject === "f";
    require_(
      feminine === declared,
      `contexte « ${context.id} » : la phrase « ${context.template} » ` +
        `${feminine ? "a" : "n'a pas"} « она » pour sujet, mais subject ` +
        `${declared ? 'vaut "f"' : "n'est pas déclaré féminin"}`
    );
  }

  for (const context of X.IMPERATIVE_CONTEXTS) {
    // Le russe du gabarit tutoie-t-il ? « ты », « тебя », « тебе », « твой »
    // et le « пожалуйста » d'une phrase sans вы sont les indices sûrs.
    const tutoie = CYRILLIC_WORD("ты|тебя|тебе|твой|твоя|твоё|твои").test(stripAccent(context.template));
    const vouvoie = CYRILLIC_WORD("вы|вас|вам|ваш|ваша|ваше|ваши").test(stripAccent(context.template));
    if (tutoie) {
      require_(
        context.address === "ty",
        `contexte « ${context.id} » : la phrase tutoie (« ${context.template} ») ` +
          `mais address vaut "${context.address}"`
      );
    }
    if (vouvoie) {
      require_(
        context.address === "vy",
        `contexte « ${context.id} » : la phrase vouvoie (« ${context.template} ») ` +
          `mais address vaut "${context.address}"`
      );
    }
    // Et la traduction française doit dire la même chose que le russe.
    const frTutoie = /\b(te|toi|tes|ton|ta)\b/i.test(context.fr) || /s'il te plaît/i.test(context.fr);
    const frVouvoie = /\b(vous|votre|vos)\b/i.test(context.fr);
    if (frTutoie && !frVouvoie) {
      require_(
        context.address === "ty",
        `contexte « ${context.id} » : le français tutoie (« ${context.fr} ») ` +
          `mais address vaut "${context.address}"`
      );
    }
    if (frVouvoie && !frTutoie) {
      require_(
        context.address === "vy",
        `contexte « ${context.id} » : le français vouvoie (« ${context.fr} ») ` +
          `mais address vaut "${context.address}"`
      );
    }
  }
}

const ACCENTED_FORMS = V.ASPECT_PAIRS.flatMap((p) =>
  [
    p.imperfective,
    p.perfective,
    p.impPast,
    p.perfPast,
    p.impPastF,
    p.perfPastF,
    p.impPresent1,
    p.perfFuture1,
    p.impImperative,
    p.perfImperative,
    p.impImperativeTy,
    p.perfImperativeTy,
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

const items = X.ASPECT_SKILLS.map((s) => {
  const seen = new Set();
  for (let i = 0; i < 600; i++) seen.add(X.generateAspectExercise(s.id).itemId);
  return `${s.id} ${seen.size}`;
});
console.log(`✓ ${checks} contrôles passés.`);
console.log(
  `  banque : ${V.ASPECT_PAIRS.length} paires (` +
    ["prefixe", "suffixe", "suppletion"]
      .map((f) => `${f} ${V.ASPECT_PAIRS.filter((p) => p.formation === f).length}`)
      .join(", ") +
    ")"
);
console.log(
  `  contextes : ${X.PAST_CONTEXTS.length} passé, ${X.FUTURE_CONTEXTS.length} futur, ${X.IMPERATIVE_CONTEXTS.length} impératif`
);
console.log(`  items distincts par compétence : ${items.join(", ")}`);
