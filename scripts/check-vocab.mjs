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
const { ANSWER_LANG, PROMPT_LANG, RECOGNITION_ERRORS, MAX_LISTEN_MS, END_GRACE_MS } = await jiti.import("../lib/vocabulary/speech.ts");

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
