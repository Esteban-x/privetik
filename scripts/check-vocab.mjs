/**
 * Contrôles du vocabulaire et de la lecture — `npm run check:vocab`.
 *
 * Deux endroits où l'app juge, et un où elle affiche ce que l'IA affirme :
 *
 * 1. LA COMPARAISON DE RÉPONSE (lib/vocabulary/answer-check.ts). Le serveur
 *    s'en sert pour noter une frappe ou un QCM. Trop stricte, elle punit
 *    quelqu'un qui connaît le mot ; trop laxiste, elle valide n'importe
 *    quoi et le SRS espace une carte non sue. Les deux dérives sont testées.
 * 2. LA VÉRIFICATION DES CAS EN LECTURE (lib/reading/verify-cases.ts). Elle
 *    ne doit JAMAIS retirer un tag juste (syncrétisme compris), et doit
 *    retirer un tag que la banque contredit.
 * 3. LES TEXTES ÉCRITS À LA MAIN. Ils ne passent pas par l'IA, donc pas par
 *    la validation : leurs tags sont contrôlés ici, contre le même
 *    dictionnaire.
 */
import { createJiti } from "jiti";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });

const A = await jiti.import("../lib/vocabulary/answer-check.ts");
const V = await jiti.import("../lib/reading/verify-cases.ts");
const T = await jiti.import("../lib/reading/texts.ts");
const E = await jiti.import("../lib/vocabulary/explanation.ts");
const { transliterate } = await jiti.import("../lib/vocabulary/transliterate.ts");
const { NOUNS } = await jiti.import("../lib/grammar/nouns-data.ts");
const { LEXICON } = await jiti.import("../lib/vocabulary/lexicon.generated.ts");
const { wordKey, sameWord } = await jiti.import("../lib/vocabulary/duplicate.ts");
const { nearMiss } = await jiti.import("../lib/vocabulary/autocomplete.ts");
const { accentRu, hasStress, stripStress } = await jiti.import("../lib/vocabulary/accent.ts");
const { isFrenchProse } = await jiti.import("../lib/ai/client.ts");
const P = await jiti.import("../lib/ai/prompts.ts");
const { ANSWER_LANG, PROMPT_LANG, RECOGNITION_ERRORS, MAX_LISTEN_MS, END_GRACE_MS, MAX_ALTERNATIVES } = await jiti.import("../lib/vocabulary/speech.ts");
const H = await jiti.import("../lib/reading/case-hints.ts");
const X = await jiti.import("../lib/reading/explanation.ts");
const M = await jiti.import("../lib/reading/manual.ts");
const READ_VALIDATE = await jiti.import("../lib/reading/validate.ts");
const READ_CLIENT = await jiti.import("../lib/reading/client.ts");
const { TRIGGERS } = await jiti.import("../lib/grammar/triggers.ts");

const failures = [];
let checks = 0;
function require_(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

// ─── 1. Comparaison de réponse ─────────────────────────────────────
// À accepter : la réponse est juste, sous une forme ou une autre.
const ACCEPT = [
  ["книга", "книга"],
  ["Книга", "книга"],
  ["  книга  ", "книга"],
  ["книга", "кни́га"],
  ["cafe", "café"],
  ["café", "cafe"],
  ["garcon", "garçon"],
  ["livre", "le livre"],
  ["le livre", "livre"],
  ["auto", "voiture, auto"],
  ["voiture", "voiture, auto"],
  ["dire", "parler / dire"],
  ["aller", "aller (à pied)"],
  ["aller à pied", "aller (à pied)"],
  ["ели", "ёли"],
  ["une maison", "maison"],
];
for (const [given, expected] of ACCEPT) {
  require_(
    A.matchesAnswer(given, expected) === true,
    `« ${given} » devrait être accepté pour « ${expected} »`
  );
}

// À refuser : un mot différent reste un mot différent. C'est le côté qui
// compte le plus — une comparaison trop généreuse fait espacer par le SRS
// une carte que l'apprenant ne sait pas.
const REJECT = [
  ["книгу", "книга"],
  ["стол", "книга"],
  ["", "книга"],
  ["   ", "книга"],
  ["voitur", "voiture"],
  ["livres", "livre"],
  ["chien", "chat"],
  ["le", "le livre"],
  ["a", "aller (à pied)"],
];
for (const [given, expected] of REJECT) {
  require_(
    A.matchesAnswer(given, expected) === false,
    `« ${given} » ne devrait PAS être accepté pour « ${expected} »`
  );
}

// ─── 2. Vérification des cas ───────────────────────────────────────
const w = (ru, caseId) => ({ ru, gloss: "x", case: caseId });

// Un tag juste survit, et ressort marqué comme confirmé.
const good = V.verifyCaseTags([[w("книгу", "accusative")]]);
require_(good.report.confirmed === 1, "« книгу » à l'accusatif devrait être confirmé");
require_(
  good.sentences[0][0].caseStatus === "confirmed",
  "un tag confirmé doit porter caseStatus « confirmed »"
);

// Un tag faux disparaît — mais la glose reste, elle n'est pas en cause.
const bad = V.verifyCaseTags([[w("книгу", "nominative")]]);
require_(bad.report.contradicted === 1, "« книгу » au nominatif devrait être contredit");
require_(bad.sentences[0][0].case === undefined, "un tag contredit doit être retiré");
require_(bad.sentences[0][0].gloss === "x", "la glose doit survivre au retrait du tag");

// Syncrétisme : « книги » est à la fois génitif singulier, nominatif et
// accusatif pluriel. Aucun des trois ne doit être retiré, sinon la
// vérification effacerait des analyses justes.
for (const caseId of ["genitive", "nominative", "accusative"]) {
  const r = V.verifyCaseTags([[w("книги", caseId)]]);
  require_(
    r.report.contradicted === 0,
    `« книги » au ${caseId} est une lecture possible : elle ne doit pas être retirée`
  );
}

// Mot hors banque : invérifiable, donc conservé mais signalé. Le retirer
// viderait la lecture de sa coloration, l'afficher comme confirmé serait
// mentir.
const unknown = V.verifyCaseTags([[w("абракадаброй", "instrumental")]]);
require_(unknown.report.unverified === 1, "un mot hors banque doit être compté comme invérifiable");
require_(
  unknown.sentences[0][0].case === "instrumental",
  "un tag invérifiable doit être conservé"
);
require_(
  unknown.sentences[0][0].caseStatus === "unverified",
  "un tag invérifiable doit porter caseStatus « unverified »"
);

// Ponctuation collée au mot dans le texte : elle ne doit pas faire échouer
// la reconnaissance, sinon la quasi-totalité des fins de phrase deviendrait
// « invérifiable » pour rien.
const punctuated = V.verifyCaseTags([[w("книгу.", "accusative"), w("Книгу,", "accusative")]]);
require_(
  punctuated.report.confirmed === 2,
  `ponctuation et majuscule ne doivent pas empêcher la vérification (${punctuated.report.confirmed}/2)`
);

// Le ё écrit е, et l'inverse.
//
// Le russe courant écrit rarement le ё : un texte de lecture dit
// « ребенок » là où la banque a « ребёнок ». Le repli existait — une ligne
// `.replace(/ё/g, "ё")` — mais remplaçait ё par LUI-MÊME, les deux côtés
// étant le même caractère. Elle ne faisait donc rien, et le tag de ces mots
// restait « invérifiable ».
{
  const withoutYo = V.verifyCaseTags([[w("ребенка", "accusative")]]);
  require_(
    withoutYo.report.confirmed === 1,
    `« ребенка » sans ё doit retrouver « ребёнка » dans la banque (${withoutYo.report.confirmed}/1)`
  );
  const withYo = V.verifyCaseTags([[w("ребёнка", "accusative")]]);
  require_(
    withYo.report.confirmed === 1,
    `« ребёнка » avec ё doit rester reconnu (${withYo.report.confirmed}/1)`
  );
}

// Ce qui n'a pas de tag n'est pas touché.
const untagged = V.verifyCaseTags([[{ ru: "и", gloss: "et" }]]);
require_(
  untagged.report.confirmed + untagged.report.contradicted + untagged.report.unverified === 0,
  "un mot sans tag ne doit rien déclencher"
);

require_(V.INDEXED_FORMS > 2000, `index trop maigre : ${V.INDEXED_FORMS} formes`);

// ─── 3. Textes écrits à la main ────────────────────────────────────
let handContradicted = 0;
let handConfirmed = 0;
let handUnverified = 0;
for (const text of T.READING_TEXTS) {
  const r = V.verifyCaseTags(text.sentences);
  handConfirmed += r.report.confirmed;
  handUnverified += r.report.unverified;
  if (r.report.contradicted > 0) {
    handContradicted += r.report.contradicted;
    failures.push(
      `texte « ${text.title} » : ${r.report.contradicted} tag(s) de cas contredits par la banque`
    );
  }
  checks += 1;

  for (const sentence of text.sentences) {
    for (const word of sentence) {
      require_(word.ru.trim().length > 0, `texte « ${text.title} » : mot vide`);
      require_(
        !word.case || word.gloss,
        `texte « ${text.title} » : « ${word.ru} » porte un cas mais aucune glose`
      );
    }
  }
}

// ─── 4. Validation d'une explication ───────────────────────────────
const okExplanation = E.toWordExplanation(
  {
    meaning: "Livre au sens d'ouvrage imprimé, le mot le plus courant.",
    partOfSpeech: "nom féminin",
    register: "courant",
    examples: [{ ru: "Я читаю книгу.", fr: "Je lis un livre." }],
    collocations: ["интересная книга (un livre intéressant)"],
    related: ["учебник — manuel scolaire"],
  },
  "книга"
);
require_(okExplanation !== null, "une explication bien formée doit être acceptée");
require_(okExplanation?.examples.length === 1, "l'exemple employant le mot doit être conservé");

// Un exemple qui n'emploie pas le mot illustre autre chose : il est retiré
// plutôt que montré, sinon l'apprenant mémorise une phrase hors sujet.
const offTopic = E.toWordExplanation(
  {
    meaning: "Livre au sens d'ouvrage imprimé, le mot le plus courant.",
    examples: [
      { ru: "Я читаю книгу.", fr: "Je lis un livre." },
      { ru: "Он идёт домой.", fr: "Il rentre à la maison." },
    ],
  },
  "книга"
);
require_(
  offTopic?.examples.length === 1,
  "un exemple qui n'emploie pas le mot expliqué doit être écarté"
);

require_(E.toWordExplanation({}, "книга") === null, "une explication vide doit être refusée");
require_(E.toWordExplanation(null, "книга") === null, "une réponse non-objet doit être refusée");
require_(
  E.toWordExplanation({ meaning: "court" }, "книга") === null,
  "un sens quasi vide doit être refusé"
);

// ─── 5. Translittération ───────────────────────────────────────────
// Elle est CALCULÉE, pas demandée au modèle (lib/vocabulary/transliterate.ts) :
// les mots de la banque et de l'index sortaient sans aucune prononciation
// écrite, puisque seul le chemin IA en produisait une. Une règle qui se
// trompe se trompe sur des milliers de mots à la fois — d'où des témoins
// recopiés à la main, un par difficulté.
const TRANSLIT = [
  // [mot russe accentué, lecture attendue, ce que ce témoin protège]
  ["спаси́бо", "spassiba", "s intervocalique doublé + о atone"],
  ["хорошо́", "kharacho", "deux о atones, х = kh, ш = ch"],
  ["кни́га", "kniga", "cas simple, aucune réduction"],
  ["де́вушка", "dévouchka", "е accentué, у = ou"],
  ["чай", "tchaï", "ч = tch, й après voyelle = ï"],
  ["мужчи́на", "moujtchina", "ж = j"],
  ["ещё", "iechtcho", "е initial mouillé, щ = chtch, ё après chuintante"],
  ["я́блоко", "yablaka", "я initial, deux о atones"],
  ["друзья́", "drouzya", "signe mou : la voyelle suivante se mouille"],
  ["де́ньги", "déngui", "г dur devant и"],
  ["жена́", "jena", "е après chuintante, non mouillé"],
  ["что", "chto", "exception : l'orthographe ment"],
  ["э́то", "èta", "э ouvert, о atone"],
  ["по́езд", "poiezd", "е après voyelle : mouillé"],
  ["стол", "stol", "monosyllabe : l'accent est connu sans être marqué"],
  ["добрый", "dobryï", "accent INCONNU : aucune réduction, о reste о"],
  ["Росси́я", "Rassiya", "majuscule conservée"],
];
for (const [ru, want, why] of TRANSLIT) {
  const got = transliterate(ru);
  require_(got === want, `translittération de « ${ru} » : « ${got} » au lieu de « ${want} » (${why})`);
}

// Rien de latin ne doit ressortir : un champ français n'a pas de
// prononciation à écrire, et le formulaire s'en sert pour ne rien proposer.
require_(transliterate("merci") === "", "un mot latin ne doit pas être translittéré");
require_(transliterate("") === "", "une chaîne vide reste vide");

// Et surtout : la règle rend quelque chose pour CHAQUE mot des deux banques.
// C'est la promesse tenue à l'apprenant — les mots connus sont ceux qui ont
// la meilleure prononciation, pas ceux qui n'en ont aucune.
let silent = 0;
let firstSilent = "";
for (const noun of NOUNS) {
  const out = transliterate(noun.forms.singular[0]);
  if (!out || /[Ѐ-ӿ]/.test(out)) {
    silent += 1;
    if (!firstSilent) firstSilent = noun.lemma;
  }
}
for (const entry of LEXICON) {
  const out = transliterate(entry[0]);
  if (!out || /[Ѐ-ӿ]/.test(out)) {
    silent += 1;
    if (!firstSilent) firstSilent = entry[0];
  }
}
require_(
  silent === 0,
  `${silent} mot(s) des banques sans translittération complète — ex. « ${firstSilent} »`
);

// ─── 4. La clé de doublon ──────────────────────────────────────────
//
// Elle décide si un mot est REFUSÉ à l'ajout. Trop large, elle interdit une
// entrée légitime et l'apprenant ne peut pas noter son mot ; trop étroite,
// elle laisse revenir le doublon qu'on vient de bannir. Les deux dérives
// sont ici.
{
  // Ce qui DOIT se replier : l'accent tonique n'est qu'une aide de lecture,
  // et la banque écrit « кни́га » là où l'apprenant tape « книга ».
  for (const [a, b, why] of [
    ["кни́га", "книга", "accent tonique"],
    ["Книга", "книга", "casse"],
    ["  книга  ", "книга", "espaces autour"],
    ["спаси́бо", "спасибо", "accent tonique"],
  ]) {
    require_(sameWord(a, b), `doublon : « ${a} » et « ${b} » devraient être le même mot (${why})`);
  }

  // Ce qui NE DOIT PAS se replier : ё et й portent du sens. Les confondre
  // interdirait d'avoir « всё » (tout) ET « все » (tous) dans une liste —
  // deux mots que le russe distingue et qu'un apprenant doit apprendre à
  // distinguer. C'est précisément ce que fait `normalizeAnswer`, et c'est
  // pour ça que la clé de doublon ne s'appuie pas dessus.
  for (const [a, b, why] of [
    ["всё", "все", "ё distingue deux mots"],
    ["мой", "мои", "й n'est pas и"],
    ["книга", "стол", "mots sans rapport"],
  ]) {
    require_(!sameWord(a, b), `doublon : « ${a} » et « ${b} » ne sont pas le même mot (${why})`);
  }

  require_(wordKey("   ") === "", "doublon : une saisie vide ne doit produire aucune clé");
  require_(!sameWord("", ""), "doublon : deux vides ne sont pas « le même mot »");
}

// ─── 5. L'orthographe approchante ──────────────────────────────────
//
// LE RISQUE EST LA FAUSSE ALERTE, pas l'oubli. Un formulaire qui souligne
// en rouge un mot correct apprend à ignorer ses avertissements — y compris
// les justes —, et l'index ne connaît qu'une fraction du russe : « absent
// de l'index » ne veut PAS dire « faux ». Ce bloc vérifie donc surtout les
// silences.
{
  // Silence obligatoire : une frappe en cours n'est pas une faute.
  for (const typed of ["кни", "книг", "словар", "мат", "спас", "здра"]) {
    const miss = nearMiss(typed);
    require_(
      miss === null,
      `orthographe : « ${typed} » est le début d'un mot connu, rien ne doit être signalé ` +
        `(proposé : « ${miss?.ru} »)`
    );
  }

  // Silence obligatoire : un mot de l'index, écrit juste, avec ou sans son
  // accent tonique.
  let flaggedCorrect = 0;
  let firstFlagged = null;
  for (const entry of LEXICON) {
    for (const form of [entry[0], entry[0].normalize("NFC").split(String.fromCharCode(0x0301)).join("")]) {
      if (form.includes(" ")) continue;
      if (nearMiss(form) !== null) {
        flaggedCorrect += 1;
        if (!firstFlagged) firstFlagged = form;
      }
    }
  }
  require_(
    flaggedCorrect === 0,
    `orthographe : ${flaggedCorrect} mot(s) JUSTES de l'index sont signalés comme douteux ` +
      `— ex. « ${firstFlagged} ». Un seul suffit à discréditer l'avertissement.`
  );

  // Et ce qu'il doit tout de même attraper : les fautes qu'un francophone
  // fait vraiment, en écrivant ce qu'il entend.
  for (const [typed, expected] of [
    ["спосибо", "спасибо"],
    ["здраствуйте", "здравствуйте"],
  ]) {
    const miss = nearMiss(typed);
    const got = miss ? wordKey(miss.ru) : null;
    require_(
      got === expected,
      `orthographe : « ${typed} » devrait proposer « ${expected} », a proposé « ${got ?? "rien"} »`
    );
  }
}

// ─── 6. Ce que le modèle rédige est-il lisible par l'apprenant ? ──
//
// CE QUI EST ARRIVÉ. Sur « Туристы отдыхают под ___ », une réponse fausse
// s'est vu répondre trois phrases de russe : « Форма «Стулами» — это
// неправильная форма творительного падежа множественного числа… ». Le
// prompt demandait « en français », deux fois. Le modèle a dérivé — tout
// son contexte est russe, et une consigne de prompt ne se vérifie pas
// elle-même.
//
// Ce contrôle-ci, si. Il porte sur le GARDE-FOU, pas sur le modèle : on ne
// peut pas tester ce que l'IA répondra, on peut tester ce qu'on accepte
// d'elle.
{
  // Ce qui doit passer : du français, y compris quand il cite du russe —
  // et une bonne explication en cite forcément.
  for (const text of [
    "Instrumental pluriel attendu, avec alternance л → ль.",
    "La forme « стулами » n'est pas l'instrumental pluriel de стул : on attend « стульями ».",
    "Ta réponse est au nominatif, pas au génitif.",
  ]) {
    require_(isFrenchProse(text), `explication : « ${text.slice(0, 40)}… » est du français et devrait passer`);
  }

  // Ce qui doit être jeté : la prose russe, exactement celle qui s'est
  // affichée.
  for (const text of [
    "Форма «Стулами» — это неправильная форма творительного падежа множественного числа. Правильная форма — «стульями».",
    "Это неправильно.",
    "",
    "   ",
  ]) {
    require_(
      !isFrenchProse(text),
      `explication : « ${text.slice(0, 40)}… » n'est pas du français et ne doit pas être affichée`
    );
  }

  // Le prompt doit continuer de le demander. Le garde-fou rattrape la
  // dérive, il ne la remplace pas : sans la consigne, on jetterait
  // simplement une explication sur deux.
  const prompt = P.answerVerificationPrompt({
    lemma: "стул",
    gender: "masculin",
    animacy: "inanimate",
    targetCase: "instrumental",
    plural: true,
    computedForm: "сту́льями",
    userAnswer: "Стулами",
    sentence: "Тури́сты отдыха́ют под ___.",
  });
  require_(
    /EN FRANÇAIS/.test(prompt),
    "le prompt de vérification ne dit plus explicitement d'écrire en français"
  );
}

// ─── 7. La langue que le micro écoute ─────────────────────────────
//
// Elle avait été fixée à « ru-RU » dans les deux sens. En « écoute et
// devine », le mot est ÉNONCÉ en russe et la réponse attendue est sa
// traduction française : le moteur écoutait donc du russe pendant qu'on lui
// parlait français, et le mode paraissait cassé.
//
// Deux lignes, qu'on renverse sans s'en apercevoir, et rien à l'écran ne
// dirait laquelle est fausse — une reconnaissance vocale qui se trompe de
// langue rend du texte, pas une erreur.
{
  require_(
    ANSWER_LANG["ru-first"].startsWith("fr"),
    `voix : en « écoute et devine », le mot est dit en russe et la réponse est FRANÇAISE — ` +
      `le micro écoute « ${ANSWER_LANG["ru-first"]} »`
  );
  require_(
    ANSWER_LANG["fr-first"].startsWith("ru"),
    `voix : en « dis ce mot en russe », la réponse est RUSSE — ` +
      `le micro écoute « ${ANSWER_LANG["fr-first"]} »`
  );
  require_(
    ANSWER_LANG["ru-first"] !== ANSWER_LANG["fr-first"],
    "voix : les deux sens écoutent la même langue, l'un des deux est donc faux"
  );

  // ON NE PRONONCE JAMAIS LA LANGUE DANS LAQUELLE ON ATTEND LA RÉPONSE.
  //
  // Le bouton « Écouter » jouait le mot russe dans les DEUX sens. En « dis ce
  // mot en russe », le russe est exactement ce qu'on demande de produire : le
  // bouton soufflait donc la réponse, et à hauteur de première étape — une
  // pastille de même poids que « Dire en russe », qu'on presse naturellement
  // en premier. La prononciation russe n'est plus proposée qu'APRÈS la
  // révélation, là où l'entendre s'appelle apprendre.
  //
  // Deux tables, une règle : ce qu'on fait entendre et ce qu'on attend ne
  // peuvent pas être la même langue.
  for (const dir of ["ru-first", "fr-first"]) {
    require_(
      ANSWER_LANG[dir].slice(0, 2) !== PROMPT_LANG[dir],
      `voix : en « ${dir} », on prononce du ${PROMPT_LANG[dir]} et on attend du ` +
        `${ANSWER_LANG[dir].slice(0, 2)} — le bouton « Écouter » donnerait la réponse`
    );
  }
  require_(
    PROMPT_LANG["ru-first"] !== PROMPT_LANG["fr-first"],
    "voix : les deux sens prononcent la même langue, l'un des deux est donc faux"
  );

}

// ─── 8. Les messages du micro ─────────────────────────────────────
//
// UNE ÉCOUTE QUI ÉCHOUE DOIT LE DIRE. Le défaut trouvé à l'usage : « si je
// donne une mauvaise réponse à l'oral, rien ne se produit et ça continue de
// capter ma voix ». Le moteur qui n'a rien su transcrire terminait sans
// résultat NI erreur, et cette fin-là était silencieuse — on avait parlé
// pour rien, sans savoir si le micro, l'app ou soi-même était en cause.
//
// La correction tient à deux choses : une fin qui parle toujours, et des
// bornes de temps. La première ne se teste qu'au navigateur ; la seconde,
// et la table de messages qui l'accompagne, se vérifient ici.
{
  // « aborted » est le SEUL code muet, et il doit le rester : c'est notre
  // propre fait — un nouvel essai, un changement de mot. Lui donner un
  // message ferait clignoter une erreur rouge à chaque « Redire ».
  require_(
    RECOGNITION_ERRORS.aborted === "",
    "micro : « aborted » est provoqué par l'app elle-même, il ne doit rien annoncer"
  );

  // Tous les autres doivent parler, et parler français : ce sont eux qui
  // remplacent le silence dont l'apprenant s'est plaint.
  for (const [code, message] of Object.entries(RECOGNITION_ERRORS)) {
    if (code === "aborted") continue;
    require_(
      message.trim().length > 0,
      `micro : le code « ${code} » n'a pas de message — cette panne serait muette`
    );
    require_(
      isFrenchProse(message),
      `micro : le message de « ${code} » n'est pas du français lisible`
    );
  }

  // Les quatre pannes qu'on sait nommer. Les perdre rendrait leur cas muet.
  for (const code of ["not-allowed", "service-not-allowed", "no-speech", "audio-capture"]) {
    require_(
      typeof RECOGNITION_ERRORS[code] === "string",
      `micro : le code « ${code} » a disparu de la table des messages`
    );
  }

  // Les bornes. Sans elles, un moteur qui ne rend jamais la main laisse le
  // bouton sur « J'écoute… » et le micro ouvert — l'autre moitié du défaut.
  require_(
    MAX_LISTEN_MS > 0 && MAX_LISTEN_MS <= 30000,
    `micro : la borne d'écoute (${MAX_LISTEN_MS} ms) doit exister et rester supportable`
  );
  require_(
    END_GRACE_MS > 0 && END_GRACE_MS < MAX_LISTEN_MS,
    `micro : le délai de grâce (${END_GRACE_MS} ms) doit être court devant la borne d'écoute`
  );
}

// ─── 9. L'accent tonique posé sur les mots d'une liste ────────────
//
// LE SEUL DÉFAUT QUI COMPTE EST L'ACCENT FAUX. Absent, l'apprenant sait
// qu'il ne sait pas ; faux, il apprend une prononciation erronée avec la
// même confiance que le reste — et rien à l'écran ne le distingue d'un
// accent juste. Les contrôles portent donc d'abord sur les ABSTENTIONS.
{
  // a. Il pose ce qu'il sait, et le repose à l'identique. Le lexique
  //    d'autocomplétion est accentué à la main : dénudé puis rendu à
  //    accentRu, il doit revenir tel quel ou rester nu, jamais autre chose.
  let restored = 0;
  const wrong = [];
  for (const [word] of LEXICON) {
    const bareWord = stripStress(word);
    const back = accentRu(bareWord);
    if (back === word.normalize("NFC")) restored += 1;
    // Ressorti nu : abstention légitime (homographe, ou absent de l'index).
    else if (back !== bareWord) wrong.push(`${word} -> ${back}`);
  }
  require_(
    wrong.length === 0,
    `accent : ${wrong.length} mot(s) du lexique réaccentués autrement — ${wrong.slice(0, 5).join(", ")}`
  );
  require_(
    restored > LEXICON.length * 0.8,
    `accent : seulement ${restored}/${LEXICON.length} entrées du lexique retrouvent leur accent`
  );

  // b. LES HOMOGRAPHES RESTENT NUS. C'est le contrôle central : ces mots
  //    ont deux lectures, seul le sens tranche, et une liste de vocabulaire
  //    n'en porte aucun. « за́мок » (château) ne doit pas souffler son
  //    accent à « замо́к » (serrure).
  for (const word of ["замок", "дома", "вода", "большая", "мука", "окна", "цены", "стены"]) {
    require_(
      accentRu(word) === word,
      `accent : « ${word} » est un homographe, il ne doit pas être accentué (reçu « ${accentRu(word)} »)`
    );
  }

  // c. IL N'INVENTE RIEN sur ce qu'il ne connaît pas, et ne touche ni au
  //    latin ni à ce qui porte déjà son accent.
  for (const word of ["абракадабрический", "hello world", "", "приве́т"]) {
    require_(accentRu(word) === word, `accent : « ${word} » aurait dû ressortir tel quel`);
  }

  // d. LE MONOSYLLABE N'A RIEN À MARQUER — son accent est forcé.
  for (const word of ["стол", "чай", "дом"]) {
    require_(!hasStress(accentRu(word)), `accent : « ${word} » n'a qu'une voyelle, rien à marquer`);
  }

  // e. Ё N'EST PAS UN ACCENT. « все » (tous) et « всё » (tout) sont deux
  //    mots : poser l'accent de l'un sur l'autre les confondrait, ce que
  //    wordKey refuse déjà de faire.
  require_(accentRu("все") === "все", "accent : « все » ne doit pas recevoir la lecture de « всё »");

  // f. L'ACCENT NE CHANGE PAS LE MOT. C'est ce qui autorise à le poser
  //    après coup sur ce que l'apprenant a tapé : replié, le résultat est
  //    identique à la saisie, donc la même entrée de liste et la même
  //    réponse acceptée.
  for (const word of ["привет", "хорошо", "поведение", "существовать", "он сомневается в себе"]) {
    require_(
      wordKey(accentRu(word)) === wordKey(word),
      `accent : « ${word} » a changé d'identité en recevant son accent`
    );
    require_(
      A.matchesAnswer(word, accentRu(word)),
      `accent : « ${word} » tapé sans accent doit rester une bonne réponse`
    );
  }

  // g. LA MAJUSCULE SURVIT : un mot en tête de phrase reste capitalisé.
  require_(
    accentRu("Поведение") === "Поведе́ние",
    `accent : la majuscule initiale doit survivre (reçu « ${accentRu("Поведение")} »)`
  );

  // h. LA PHRASE EST TRAITÉE MOT À MOT — une liste contient des expressions.
  require_(
    accentRu("Он сомневается в себе") === "Он сомнева́ется в себе́",
    `accent : phrase mal accentuée — reçu « ${accentRu("Он сомневается в себе")} »`
  );

  // i. LA TRANSLITTÉRATION S'AMÉLIORE, puisqu'elle se déduit de l'accent :
  //    sans lui, aucune réduction vocalique n'est appliquée.
  require_(
    transliterate(accentRu("хорошо")) === "kharacho",
    `accent : « хорошо » accentué devrait se lire « kharacho », reçu « ${transliterate(accentRu("хорошо"))} »`
  );
}

// ─── 10. La réponse dite à voix haute ─────────────────────────────
//
// Le mode Voix compare TOUTES les lectures du moteur à la réponse, et en
// tire un indice à trois états. Trop strict, il déclare fausse une réponse
// juste que le micro a ponctuée ; trop laxiste, il révèle d'office une
// réponse fausse — la révélation automatique ne part que sur « match ».
{
  const MATCH = [
    [["Книга."], "кни́га"],
    [["Книга"], "книга"],
    [["это книга"], "книга"],
    [["книгу", "книга"], "книга"],
    [["Le livre."], "livre"],
    [["c'est un livre"], "livre"],
    [["voiture"], "voiture, auto"],
    [["Спасибо!"], "спаси́бо"],
  ];
  for (const [heard, expected] of MATCH) {
    require_(
      A.judgeSpoken(heard, expected) === "match",
      `voix : ${JSON.stringify(heard)} devrait correspondre à « ${expected} » (reçu ${A.judgeSpoken(heard, expected)})`
    );
  }

  const CLOSE = [
    [["книгу"], "книга"],
    [["livres"], "livre"],
    [["университета"], "университет"],
  ];
  for (const [heard, expected] of CLOSE) {
    require_(
      A.judgeSpoken(heard, expected) === "close",
      `voix : ${JSON.stringify(heard)} est à une lettre de « ${expected} » (reçu ${A.judgeSpoken(heard, expected)})`
    );
  }

  const MISS = [
    [["стол"], "книга"],
    [[""], "книга"],
    [[], "книга"],
    [["le chat"], "livre"],
    // Un mot de deux lettres ne se « retrouve » pas dans une phrase : « в »
    // ou « de » sont au milieu de n'importe quelle réponse.
    [["je ne sais pas"], "ne"],
    // Pas de tolérance sur un mot court : « дом » et « дым » sont deux mots.
    [["дым"], "дом"],
  ];
  for (const [heard, expected] of MISS) {
    require_(
      A.judgeSpoken(heard, expected) === "miss",
      `voix : ${JSON.stringify(heard)} ne doit pas passer pour « ${expected} » (reçu ${A.judgeSpoken(heard, expected)})`
    );
  }

  require_(
    MAX_ALTERNATIVES >= 3 && MAX_ALTERNATIVES <= 10,
    `micro : ${MAX_ALTERNATIVES} lectures demandées au moteur — une seule ratait les réponses entendues en second`
  );
}

// ─── 11. « Pourquoi ce cas ? » — la règle avant le modèle ─────────
{
  // a. LA TABLE DU LECTEUR ET LA BANQUE DES DÉCLENCHEURS DISENT LA MÊME
  //    CHOSE. Le lecteur ne peut pas importer triggers.ts (composant
  //    client) : sa table est recopiée, donc elle peut diverger. Toute
  //    préposition d'un seul mot de la banque doit y figurer avec son cas.
  for (const t of TRIGGERS) {
    if (t.kind !== "preposition" || /\s/.test(t.ru.trim())) continue;
    const folded = H.foldWord(t.ru);
    require_(
      Boolean(H.PREPOSITION_CASES[folded]?.[t.caseId]),
      `indice de cas : « ${t.ru} » + ${t.caseId} est dans la banque des déclencheurs, pas dans la table du lecteur`
    );
  }

  const words = (spec) =>
    spec.split(" ").map((token) => {
      const [ru, kase] = token.split("/");
      return kase ? { ru, gloss: "x", case: kase } : { ru, gloss: "x" };
    });

  // b. Ce qu'il doit trouver — adjectif accordé enjambé compris.
  const FOUND = [
    ["Я живу в школе./prepositional", 3, "в"],
    ["Я иду в школу./accusative", 3, "в"],
    ["Он живёт в нашей/prepositional школе/prepositional", 4, "в"],
    ["Я иду со другом/instrumental", 3, "со"],
    // Le mot devant n'est ni préposition ni quantité : rien à dire.
    ["Я доволен новым/x другом/instrumental", 3, null],
    ["В магазине много людей/genitive", 3, "много"],
    ["У нас/genitive нет интернета,/genitive", 3, "нет"],
    ["Мне 20 лет/genitive", 2, "20"],
    ["Кни́га на столе́/prepositional", 2, "на"],
  ];
  for (const [spec, index, trigger] of FOUND) {
    const hint = H.caseHint(words(spec), index);
    require_(
      trigger === null ? hint === null : hint?.trigger === trigger,
      `indice de cas : « ${spec} » (mot ${index}) — attendu ${trigger === null ? "aucun" : `« ${trigger} »`}, reçu ${hint ? `« ${hint.trigger} »` : "aucun"}`
    );
  }

  // c. CE QU'IL NE DOIT PAS INVENTER : une préposition qui ne régit pas ce
  //    cas, ou un cas sans préposition devant.
  const SILENT = [
    ["Я иду в школе/dative", 3],
    ["Мама читает книгу/accusative", 2],
    ["Отец/nominative работает", 0],
  ];
  for (const [spec, index] of SILENT) {
    require_(
      H.caseHint(words(spec), index) === null,
      `indice de cas : « ${spec} » (mot ${index}) ne doit donner aucun indice`
    );
  }
}

// ─── 12. Les textes de la bibliothèque s'expliquent ───────────────
//
// Le module ne sert plus à traduire mais à comprendre les cas : un mot
// décliné sans explication y est un trou. Les explications sont écrites à la
// main — elles ne passent par aucune validation d'IA, donc elles passent ici.
for (const text of T.READING_TEXTS) {
  text.sentences.forEach((sentence, s) => {
    const first = sentence[0];
    require_(
      typeof first?.sentenceFr === "string" && A.normalizeAnswer(first.sentenceFr).length > 0 && isFrenchProse(first.sentenceFr),
      `texte « ${text.title} », phrase ${s + 1} : traduction absente ou pas en français`
    );
    const present = new Set(sentence.map((w) => H.foldWord(w.ru)));
    sentence.forEach((word, i) => {
      if (!word.case) return;
      const label = `texte « ${text.title} », « ${word.ru} »`;
      require_(Boolean(word.why), `${label} : mot décliné sans explication`);
      if (!word.why) return;
      require_(word.why.source === "reviewed", `${label} : explication de la bibliothèque non marquée « relue »`);
      require_(isFrenchProse(word.why.reason) && word.why.reason.length >= 20, `${label} : explication trop courte ou pas en français`);
      require_(!word.why.disputed, `${label} : une explication relue ne peut pas contester son propre cas`);
      if (word.why.trigger) {
        require_(
          word.why.trigger.split(" ").every((part) => present.has(H.foldWord(part))),
          `${label} : le déclencheur « ${word.why.trigger} » n'est pas dans la phrase`
        );
      }
      // Quand la règle sait dire quelque chose, elle doit désigner le même
      // mot que l'explication écrite — sinon l'une des deux se trompe.
      const hint = H.caseHint(sentence, i);
      if (hint && word.why.trigger) {
        require_(
          H.foldWord(hint.trigger) === H.foldWord(word.why.trigger),
          `${label} : la règle désigne « ${hint.trigger} », l'explication « ${word.why.trigger} »`
        );
      }
    });
  });
}

// ─── 13. L'explication de l'IA : ce qu'on en garde ────────────────
{
  const sentence = [
    { ru: "Я", gloss: "je", case: "nominative" },
    { ru: "иду", gloss: "vais" },
    { ru: "в", gloss: "dans" },
    { ru: "школу.", gloss: "école", case: "accusative", caseStatus: "confirmed" },
  ];

  const ok = X.toSentenceExplanation(
    {
      translation: "Je vais à l'école.",
      words: [
        { index: 0, lemma: "я", case: "nominative", number: "singular", trigger: "", reason: "« Я » est le sujet du verbe « иду », donc au nominatif." },
        { index: 3, lemma: "школа", case: "accusative", number: "singular", trigger: "в", reason: "Avec un verbe de mouvement, « в » est suivi de l'accusatif : il indique la direction." },
      ],
    },
    sentence
  );
  require_(ok !== null && ok.translation === "Je vais à l'école.", "explication IA : une réponse bien formée doit être acceptée");
  require_(ok?.words[3]?.trigger === "в" && ok?.words[3]?.lemma === "школа", "explication IA : déclencheur et lemme valides doivent être gardés");
  require_(ok?.words[3]?.source === "ai", "explication IA : doit être marquée comme rédigée par l'IA");

  const hostile = X.toSentenceExplanation(
    {
      translation: "Я иду в школу.",
      words: [
        // Un mot SANS cas dans le texte : rien à expliquer.
        { index: 1, case: "accusative", reason: "Le verbe est ici à l'accusatif, ce qui est une invention." },
        // Une explication en russe : inutilisable.
        { index: 0, case: "nominative", reason: "Это подлежащее, поэтому именительный падеж." },
        // Un autre cas que l'annotation, et un déclencheur absent de la phrase.
        { index: 3, case: "prepositional", trigger: "на", reason: "Après « на », le prépositionnel indique le lieu où l'on se trouve." },
        // Une position hors de la phrase.
        { index: 9, case: "genitive", reason: "Une position qui n'existe pas dans cette phrase russe." },
      ],
    },
    sentence
  );
  require_(hostile !== null, "explication IA : une réponse partiellement valable garde ce qui l'est");
  require_(hostile?.translation === null, "explication IA : une traduction en russe doit être écartée");
  require_(!hostile?.words[1], "explication IA : un mot sans cas ne reçoit pas d'explication");
  require_(!hostile?.words[0], "explication IA : une explication rédigée en russe doit être écartée");
  require_(!hostile?.words[9], "explication IA : une position hors de la phrase doit être ignorée");
  require_(hostile?.words[3]?.disputed === "prepositional", "explication IA : un désaccord sur le cas doit être marqué comme tel");
  require_(hostile?.words[3]?.trigger === undefined, "explication IA : un déclencheur absent de la phrase doit être retiré");

  require_(X.toSentenceExplanation({}, sentence) === null, "explication IA : une réponse vide doit être refusée");
  require_(X.toSentenceExplanation("texte", sentence) === null, "explication IA : une réponse non-objet doit être refusée");

  // Une réponse coupée par le plafond de sortie : les mots arrivés entiers sont gardés.
  const complete = `{"translation":"Je vais à l'école.","words":[{"index":0,"lemma":"я","case":"nominative","number":"singular","trigger":"","reason":"« Я » est le sujet du verbe « иду », donc au nominatif."},{"index":3,"lemma":"школа","case":"accusative","number":"singular","trigger":"в","reason":"Avec un verbe de mouvement, « в » est suivi de l'accusatif : il indique la direction."}]}`;
  const cut = complete.slice(0, complete.indexOf('"trigger":"в"') + 10);
  const salvaged = X.toSentenceExplanation(X.salvageTruncated(cut), sentence);
  require_(
    salvaged?.words[0]?.lemma === "я" && !salvaged.words[3] && salvaged.translation === "Je vais à l'école.",
    `explication IA : une réponse coupée doit garder les mots complets et eux seuls (${JSON.stringify(salvaged)})`
  );
  require_(X.salvageTruncated(`{"translation":"Je vais à l'éc`) === null, "explication IA : une réponse coupée avant les mots ne se récupère pas");
  require_(
    JSON.stringify(X.toSentenceExplanation(X.salvageTruncated(complete.slice(0, -2) + "]}"), sentence)?.words[3]?.lemma) === '"школа"',
    "explication IA : une réponse entière relue par le rattrapage doit rester entière"
  );

  // Le prompt porte bien la phrase et chaque mot à expliquer, avec sa position.
  const prompt = P.readingCasesPrompt({
    sentence: "Я иду в школу.",
    words: [{ index: 3, ru: "школу.", gloss: "école", case: "accusative" }],
    level: "A2",
  });
  require_(prompt.includes("Я иду в школу.") && prompt.includes("position 3") && prompt.includes("Accusatif"), "prompt des cas : la phrase, la position ou le cas annoncé manque");
}

// ─── 14. La file de révision : les révisions avant les nouveaux mots ──
// Cinquante mots ajoutés d'un coup passaient devant tout ce qu'on avait
// appris la veille. La file sert maintenant les mots « à travailler », puis
// les mots déjà vus et échus, puis les nouveaux dans la limite du jour — et
// son décompte dit exactement ce qu'elle servira.
{
  const expect = (label, got, want) =>
    require_(got === want, `${label} : « ${got} » au lieu de « ${want} »`);
  const F = await jiti.import("../lib/vocabulary/focus.ts");
  const now = Date.now();
  const seen = (id, dueIn, reps = 2) => ({ id, focus: "normal", srs: { repetitions: reps, easeFactor: 2.5, dueAt: now + dueIn } });
  const fresh = (id) => ({ id, focus: "normal", srs: null });
  const words = [
    fresh("n1"), fresh("n2"), fresh("n3"),
    seen("due1", -1000), seen("later", 86400000),
    { id: "star", focus: "priority", srs: null },
    { id: "gone", focus: "known", srs: null },
  ];
  const ids = (list) => list.map((w) => w.id).join(",");

  expect("file : sans limite", ids(F.reviewQueue(words, now)), "star,due1,n1,n2,n3");
  expect("file : deux nouveaux permis", ids(F.reviewQueue(words, now, 2)), "star,due1,n1,n2");
  expect("file : aucun nouveau permis", ids(F.reviewQueue(words, now, 0)), "star,due1");
  expect(
    "file : rien d'échu ni de nouveau permis → révision en avance, sans les nouveaux",
    ids(F.reviewQueue([fresh("n1"), seen("later", 86400000)], now, 0)),
    "later"
  );
  const counts = F.countFocus(words, now, 2);
  expect("décompte : dû = file servie", counts.due, F.reviewQueue(words, now, 2).length);
  expect("décompte : nouveaux en attente", counts.newWaiting, 1);
  expect("décompte : sans limite, rien n'attend", F.countFocus(words, now).newWaiting, 0);
}

// ─── 15. Les paquets de départ ─────────────────────────────────────
// Un paquet entre tel quel dans les révisions : chaque mot doit être
// accentué, traduit, unique dans le paquet, et le paquet assez fourni pour
// valoir une liste.
{
  const expect = (label, got, want) =>
    require_(got === want, `${label} : « ${got} » au lieu de « ${want} »`);
  const { STARTER_PACKS, packWords, packSummary } = await jiti.import("../lib/vocabulary/packs.ts");
  const packIds = new Set();
  for (const pack of STARTER_PACKS) {
    require_(!packIds.has(pack.id), `paquet ${pack.id} : identifiant en double`);
    packIds.add(pack.id);
    const entries = packWords(pack);
    // Douze au moins : c'est ce que la banque porte d'animaux, et un paquet
    // plus mince ne vaudrait pas une liste à part.
    require_(entries.length >= 12, `paquet ${pack.id} : seulement ${entries.length} mots`);
    const keys = new Set();
    for (const word of entries) {
      const key = wordKey(word.ru);
      require_(!keys.has(key), `paquet ${pack.id} : « ${word.ru} » en double`);
      keys.add(key);
      require_(word.fr.trim().length > 0, `paquet ${pack.id} : « ${word.ru} » sans traduction`);
      const vowels = [...stripStress(word.ru)].filter((c) => "аеёиоуыэюя".includes(c)).length;
      // Le ё porte toujours l'accent : « ребёнок » n'a pas besoin d'un signe de plus.
      require_(
        vowels < 2 || hasStress(word.ru) || word.ru.includes("ё"),
        `paquet ${pack.id} : « ${word.ru} » n'est pas accentué`
      );
    }
    const summary = packSummary(pack);
    require_(summary.count === entries.length && summary.preview.length > 0, `paquet ${pack.id} : résumé incohérent`);
  }
  // Les paquets de fréquence se suivent sans se chevaucher.
  const frequent = STARTER_PACKS.filter((p) => p.id.startsWith("frequents-")).flatMap((p) => p.nouns.map((n) => n.id));
  expect("paquets de fréquence : aucun mot dans deux paquets", new Set(frequent).size, frequent.length);
}

// ─── 16. La phrase à trous ─────────────────────────────────────────
// Un trou sur le mauvais mot noterait faux quelqu'un qui a juste : la
// précision passe avant le rappel, et se mesure sur les textes relus.
{
  const C = await jiti.import("../lib/vocabulary/cloze.ts");
  const expect = (label, got, want) => require_(got === want, `${label} : ${JSON.stringify(got)} au lieu de ${JSON.stringify(want)}`);
  const answerOf = (word, sentence) => C.clozeOf(word, sentence)?.answer ?? null;
  expect("forme exacte", answerOf("шко́ла", "Это шко́ла."), "шко́ла");
  expect("accusatif", answerOf("школа", "Я иду́ в шко́лу."), "шко́лу");
  expect("adjectif", answerOf("но́вый", "У меня́ нет но́вой кни́ги."), "но́вой");
  expect("nom en -ия", answerOf("исто́рия", "Я чита́ю об исто́рии."), "исто́рии");
  expect("mot dérivé refusé", answerOf("шко́ла", "Он шко́льник."), null);
  expect("voyelle mobile : pas de devinette", answerOf("оте́ц", "Это отде́л отца́."), null);
  expect("pronom : forme exacte seulement", answerOf("я", "Меня́ зову́т А́нна."), null);
  expect("verbe : rien", answerOf("чита́ть", "Я чита́ю."), null);
  expect("sans phrase : rien", C.clozeOf("дом", null), null);
  const twice = C.clozeOf("дом", "Мы до́ма, в на́шем до́ме.");
  expect("première occurrence", twice?.before, "Мы ");
  expect("reste de la phrase", twice?.after, ", в на́шем до́ме.");

  const fold = (s) => s.toLowerCase().replace(/́/g, "").replace(/ё/g, "е");
  let found = 0;
  let wrong = 0;
  let total = 0;
  for (const text of T.READING_TEXTS) {
    for (const sentence of text.sentences) {
      const line = sentence.map((w) => w.ru).join(" ");
      for (const w of sentence) {
        const lemma = w.why?.lemma;
        if (!lemma || /\s/.test(lemma)) continue;
        total += 1;
        const got = C.clozeOf(lemma, line);
        if (!got) continue;
        const core = (w.ru.match(/[а-яё́]+(?:-[а-яё́]+)*/i) ?? [""])[0];
        if (fold(got.answer) === fold(core)) found += 1;
        else if (!sentence.some((other) => other !== w && other.why?.lemma === lemma)) wrong += 1;
      }
    }
  }
  require_(wrong === 0, `phrase à trous : ${wrong} trou(s) sur un autre mot que celui du texte`);
  require_(found >= total * 0.5, `phrase à trous : seulement ${found}/${total} mots des textes retrouvés`);
  console.log(`  phrase à trous : ${found}/${total} mots des textes retrouvés dans leur phrase, 0 sur un autre mot`);
}

// ─── 17. Le mode de révision conseillé ─────────────────────────────
{
  const G = await jiti.import("../lib/vocabulary/guided.ts");
  const expect = (label, got, want) => require_(got === want, `${label} : ${JSON.stringify(got)} au lieu de ${JSON.stringify(want)}`);
  const now = Date.UTC(2026, 8, 14);
  const fresh = () => ({ ru: "стол", exampleRu: null, focus: "normal", srs: null });
  const learning = () => ({ ru: "стол", exampleRu: null, focus: "normal", srs: { repetitions: 1, dueAt: now - 1000 } });
  const solid = (sentence) => ({ ru: "шко́ла", exampleRu: sentence, focus: "normal", srs: { repetitions: 5, dueAt: now - 1000 } });
  const many = (n, make) => Array.from({ length: n }, make);
  expect("mots neufs → QCM", G.recommendReviewMode(many(8, fresh), now)?.mode, "qcm");
  expect("neufs au-delà de la limite du jour : pas comptés", G.recommendReviewMode([...many(8, fresh), ...many(4, learning)], now, 2)?.mode, "typing");
  expect("en cours → frappe", G.recommendReviewMode([...many(6, learning), fresh()], now)?.mode, "typing");
  expect("solides avec phrase → trous", G.recommendReviewMode(many(6, () => solid("Я иду́ в шко́лу.")), now)?.mode, "cloze");
  expect("solides sans phrase → cartes", G.recommendReviewMode(many(6, () => solid(null)), now)?.mode, "flashcards");
  expect("mis de côté : ignorés", G.recommendReviewMode(many(6, () => ({ ...fresh(), focus: "known" })), now), null);
  expect("rien à réviser → rien", G.recommendReviewMode([], now), null);
}

// ─── 18. Les questions de compréhension ───────────────────────────
// Écrites à la main : une bonne réponse hors des options, ou toujours à la
// même place, ferait un quiz qu'on réussit sans lire.
{
  let total = 0;
  const positions = new Set();
  for (const text of T.READING_TEXTS) {
    const label = `texte « ${text.title} »`;
    const questions = text.questions ?? [];
    require_(questions.length >= 3, `${label} : ${questions.length} question(s) de compréhension, 3 attendues`);
    for (const q of questions) {
      total += 1;
      positions.add(q.answer);
      require_(q.question.trim().endsWith("?") && isFrenchProse(q.question), `${label} : question « ${q.question} » mal formée`);
      require_(q.options.length >= 3 && q.options.length <= 4, `${label} : « ${q.question} » a ${q.options.length} options`);
      require_(
        new Set(q.options.map((o) => o.trim().toLowerCase())).size === q.options.length,
        `${label} : « ${q.question} » a des options en double`
      );
      require_(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, `${label} : « ${q.question} » : bonne réponse hors des options`);
      require_(q.explain.trim().length >= 10, `${label} : « ${q.question} » sans explication`);
    }
  }
  require_(positions.size >= 3, "compréhension : la bonne réponse est toujours à la même place");
  console.log(`  compréhension : ${total} questions sur ${T.READING_TEXTS.length} textes`);
}

// ─── Texte collé par l'apprenant (lib/reading/manual.ts) ──────────
// Le modèle rend des gloses qu'on pose sur un découpage fait ici. Un
// découpage faux ou un alignement laxiste poseraient chaque cas sur le
// mauvais mot : c'est ce qui est vérifié.
{
  require_(
    M.tokenizeText("— Вы надолго? — спросила она. Хорошо.").length === 2,
    "texte collé : « ? — спросила она. » continue la réplique, ce n'est pas une nouvelle phrase"
  );
  const sentences = M.tokenizeText("— Привет! Как дела?\nА. С. Пушкин жил в Москве.\n—");
  require_(
    sentences.length === 3,
    `texte collé : 3 phrases attendues, ${sentences.length} obtenues (${JSON.stringify(sentences)})`
  );
  require_(
    JSON.stringify(sentences[0]) === JSON.stringify(["—", "Привет!"]),
    `texte collé : le tiret de réplique reste un mot à part (${JSON.stringify(sentences[0])})`
  );
  require_(
    sentences[2]?.[0] === "А." && sentences[2]?.length === 7 && sentences[2]?.[6] === "—",
    `texte collé : une initiale ne coupe pas la phrase, un tiret seul s'y rattache (${JSON.stringify(sentences[2])})`
  );
  require_(
    M.tokenizeText("Кто это? — Я. Привет").length === 3,
    "texte collé : « Я. » finit une phrase, ce n'est pas une initiale"
  );
  require_(
    M.annotationLines(sentences).split("\n")[0] === "1. Привет!",
    `texte collé : la ponctuation seule n'est pas envoyée au modèle (${M.annotationLines(sentences).split("\n")[0]})`
  );

  const applied = M.applyAnnotations(sentences, [
    [["Привет", "salut"]],
    [["Как", "comment"], ["дела", "affaires", "nom"]],
    [["А", "A."], ["С", "S."], ["Пушкин", "Pouchkine", "NOM"], ["жил", "vivait"], ["в", "à"], ["москве", "Moscou", "prepositional"]],
  ]);
  require_(
    applied?.missed === 0 && applied?.words === 9,
    `texte collé : annotation complète mal comptée (${applied?.missed} manqué(s) sur ${applied?.words})`
  );
  require_(
    applied?.sentences[0][0].gloss === undefined && applied?.sentences[0][1].gloss === "salut",
    "texte collé : la glose doit tomber sur le mot, pas sur le tiret"
  );
  require_(
    applied?.sentences[1][1].case === "nominative" && applied?.sentences[1][0].case === undefined,
    "texte collé : « nom » donne le nominatif, une glose seule aucun cas"
  );
  require_(
    applied?.sentences[2][2].case === "nominative" &&
      applied?.sentences[2][5].case === "prepositional" &&
      applied?.sentences[2][6].ru === "—",
    "texte collé : code en majuscules ou nom complet refusé, mot recopié en minuscules non reconnu, ou tiret final perdu"
  );

  // Deux phrases fusionnées et un mot oublié : l'alignement suit les mots, pas les tableaux.
  const merged = M.applyAnnotations(sentences, [
    [["Привет", "salut"], ["Как", "comment"], ["дела", "affaires", "xyz"]],
    [["А", "A."], ["Пушкин", "Pouchkine", "nom"], ["жил", "vivait"], ["в", "à"], ["Москве", "Moscou", "pre"]],
  ]);
  require_(
    merged?.missed === 1 && merged.sentences[2][1].gloss === undefined && merged.sentences[2][2].case === "nominative",
    `texte collé : un mot oublié doit rester seul sans glose, sans décaler la suite (${merged?.missed} manqué(s))`
  );
  require_(
    merged?.sentences[1][1].gloss === "affaires" && merged.sentences[1][1].case === undefined,
    "texte collé : un code de cas inconnu garde la glose et ne pose aucun cas"
  );

  // Une glose n'est jamais posée sur un autre mot que celui qu'elle recopie.
  const wrong = M.applyAnnotations(sentences, [[["Пока", "au revoir", "nom"]], [["Как", "comment"], ["дела", "affaires"]]]);
  require_(
    wrong?.sentences[0][1].gloss === undefined && wrong.sentences[1][0].gloss === "comment" && wrong.missed === 7,
    `texte collé : glose posée sur un mot qu'elle ne recopie pas (${wrong?.missed} manqué(s))`
  );
  require_(M.applyAnnotations(sentences, "rien") === null, "texte collé : réponse sans tableau acceptée");

  require_(M.checkManualText("Я живу в Москве.").ok, "texte collé : phrase russe simple refusée");
  require_(!M.checkManualText("I live in Moscow, really.").ok, "texte collé : texte latin accepté");
  require_(!M.checkManualText("Привет").ok, "texte collé : un seul mot accepté");
  require_(
    !M.checkManualText("Я живу в Москве. ".repeat(200)).ok,
    `texte collé : plus de ${M.MANUAL_TEXT_MAX_CHARS} caractères acceptés`
  );
  require_(
    M.fallbackTitle(sentences) === "Привет Как дела А…",
    `texte collé : titre de repli inattendu (${M.fallbackTitle(sentences)})`
  );

  // Écrit en français ou collé en russe : la langue se lit sur l'alphabet.
  require_(M.detectTextLanguage("Je vais voir le Kremlin et manger un борщ.") === "fr", "texte écrit : français citant du russe non reconnu");
  require_(M.detectTextLanguage("Мы живём в Париже и любим Louvre.") === "ru", "texte collé : russe citant du latin non reconnu");
  require_(M.detectTextLanguage("Привет, bonjour") === null, "texte mélangé : une langue a été décidée");
  require_(M.detectTextLanguage("1799 — 1837") === null, "texte sans lettre : une langue a été décidée");
  require_(M.checkFrenchText("Je vis à Moscou avec ma sœur.").ok, "texte écrit : phrase française simple refusée");
  require_(!M.checkFrenchText("Bonjour Julie").ok, "texte écrit : deux mots acceptés pour traduction");
  require_(!M.checkFrenchText("Я живу в Москве.").ok, "texte écrit : russe envoyé en traduction");
  require_(
    !M.checkFrenchText("Je vis à Moscou. ".repeat(200)).ok,
    `texte écrit : plus de ${M.MANUAL_TEXT_MAX_CHARS} caractères acceptés en traduction`
  );
  const translation = P.readingTranslationPrompt();
  require_(
    /DONNÉE/.test(translation) && /retours à la ligne/.test(translation) && /\{"ru":"\.\.\."\}/.test(translation),
    "texte écrit : le prompt de traduction a perdu sa mise en garde, le découpage ou sa forme de réponse"
  );

  const prompt = P.readingAnnotationPrompt("B1");
  require_(
    /"nom", "gen", "dat", "acc", "ins" ou "pre"/.test(prompt) && /recopié/.test(prompt) && /DONNÉE/.test(prompt),
    "texte collé : le prompt d'annotation a perdu ses codes de cas, le mot recopié ou sa mise en garde"
  );
}

// ─── Texte lu sans être enregistré : ce que le navigateur renvoie ──
// Expliqué ou enregistré, il vient du client : seule sa forme connue passe,
// et « relue à la main » ne se reprend jamais de lui.
{
  const sent = [
    [
      { ru: "Я", gloss: "je", case: "nominative", caseStatus: "confirmed", sentenceFr: "Je vais à l'école.", why: { reason: "Sujet du verbe « иду ».", source: "reviewed", lemma: "я", number: "singular" } },
      { ru: "иду", gloss: "vais", case: "verbal", why: { reason: "Pas de cas." } },
      { ru: "в", gloss: "dans", sentenceFr: "posée sur le mauvais mot" },
      { ru: "школу.", gloss: "école", case: "accusative", why: { reason: "", source: "ai" } },
    ],
  ];
  const kept = READ_VALIDATE.sentencesFromClient(sent);
  require_(kept?.[0]?.length === 4, "texte non enregistré : une phrase bien formée doit passer");
  require_(
    kept?.[0][0].why?.source === "ai" && kept[0][0].why.lemma === "я" && kept[0][0].caseStatus === undefined,
    "texte non enregistré : « relue à la main » ou l'état de vérification repris du client"
  );
  require_(
    kept?.[0][0].sentenceFr === "Je vais à l'école." && kept[0][2].sentenceFr === undefined,
    "texte non enregistré : la traduction ne tient que sur le premier mot de la phrase"
  );
  require_(
    kept?.[0][1].case === undefined && kept[0][1].why === undefined && kept[0][3].why === undefined,
    "texte non enregistré : cas inconnu ou explication vide gardés"
  );
  require_(
    READ_VALIDATE.sentencesFromClient([[{ ru: "Hello" }, { ru: "my" }, { ru: "friend" }]]) === null,
    "texte non enregistré : un texte latin passe pour du russe"
  );
  require_(READ_VALIDATE.sentencesFromClient([[{ gloss: "je" }]]) === null, "texte non enregistré : mot sans russe accepté");
  require_(READ_VALIDATE.sentencesFromClient([]) === null, "texte non enregistré : texte vide accepté");
  require_(
    READ_VALIDATE.sentencesFromClient(Array.from({ length: 121 }, () => [{ ru: "Да." }])) === null,
    "texte non enregistré : 121 phrases acceptées"
  );

  const explainedSentence = READ_CLIENT.withExplanation(
    [{ ru: "Я", case: "nominative" }, { ru: "иду" }, { ru: "домой." }],
    { translation: "Je rentre.", words: { 0: { reason: "Sujet du verbe.", source: "ai" } } }
  );
  require_(
    explainedSentence[0].sentenceFr === "Je rentre." &&
      explainedSentence[0].why?.reason === "Sujet du verbe." &&
      explainedSentence[1].why === undefined &&
      explainedSentence[1].sentenceFr === undefined,
    "explication gardée : traduction sur le premier mot, explication sur son mot seulement"
  );
}

// ─── Rapport ───────────────────────────────────────────────────────

if (failures.length) {
  console.error(`\n✗ ${failures.length} problème(s) sur ${checks} contrôles :\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error("");
  process.exit(1);
}

const total = handConfirmed + handUnverified + handContradicted;
console.log(`✓ ${checks} contrôles passés.`);
console.log(`  index de vérification : ${V.INDEXED_FORMS} formes fléchies distinctes`);
console.log(
  `  textes écrits à la main : ${T.READING_TEXTS.length} textes, ${total} tags de cas ` +
    `(${handConfirmed} confirmés, ${handUnverified} invérifiables, 0 contredit)`
);
