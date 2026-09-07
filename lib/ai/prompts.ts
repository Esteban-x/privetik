import { CefrLevel } from "@/lib/supabase/types";
import { CaseId } from "@/lib/grammar/types";
import { CASES } from "@/lib/grammar/cases";

const LEVEL_GUIDANCE: Record<CefrLevel, string> = {
  A0: "grand débutant absolu : mots isolés et phrases de 2-3 mots, vocabulaire ultra courant",
  A1: "débutant : présent, phrases simples, vocabulaire quotidien de base",
  A2: "élémentaire : passé/futur simples, phrases coordonnées, vocabulaire du quotidien élargi",
  B1: "intermédiaire : aspects verbaux, subordonnées, vocabulaire thématique",
  B2: "intermédiaire avancé : nuances, expressions idiomatiques courantes, textes plus longs",
  C1: "avancé : registre soutenu, idiomatismes, structures complexes",
  C2: "maîtrise : langue nuancée et précise, registres variés y compris littéraire et scientifique, sous-entendus, syntaxe très libre",
};

// ─── Génération d'exercices contextuels pour un cas donné ───────
//
// L'IA ne choisit PAS le mot et ne calcule AUCUNE forme fléchie : elle
// écrit seulement la phrase qui met en situation un mot imposé.
// ─── Filet de sécurité : vérification IA d'une réponse jugée fausse ──
// Le moteur de règles (lib/grammar/decline.ts) reste la référence rapide et
// gratuite pour CHAQUE réponse (comparaison de chaînes) ; cet appel IA n'a
// lieu QUE quand cette comparaison a déjà dit "faux" — un coût en tokens
// accepté explicitement par l'utilisateur pour ne jamais refuser à tort une
// réponse en fait correcte (variante orthographique/accentuée, ou bug du
// moteur de règles lui-même). Ne rend JAMAIS l'IA seule juge de la
// grammaire : elle ne fait que rattraper les faux négatifs du moteur, elle
// ne remplace jamais son calcul.
//
// La PHRASE de l'exercice lui est transmise quand il y en a une, pour deux
// raisons distinctes. D'abord l'explication affichée : sans la phrase, le
// modèle commentait une forme hors contexte et sortait des énoncés faux
// (« друзей est au génitif pluriel (cas du complément d'objet direct) »).
// Ensuite un dernier recours en faveur de l'apprenant : si la phrase
// imposait en réalité un autre cas que celui demandé, c'est l'exercice qui
// est fautif, et sa réponse ne doit pas lui être comptée fausse. Ce cas ne
// devrait plus se produire — lib/grammar/sentence-guard.ts refuse ces
// phrases en amont — mais la règle coûte une ligne et ferme le dernier
// scénario où quelqu'un serait pénalisé en ayant raison.
export function answerVerificationPrompt(input: {
  lemma: string;
  gender: string;
  animacy: string;
  targetCase: string;
  plural: boolean;
  computedForm: string;
  userAnswer: string;
  sentence?: string;
}) {
  const context = input.sentence
    ? `Phrase de l'exercice, où "___" est le trou à remplir : "${input.sentence}".\n`
    : "";

  return `Tu es un professeur de russe expert en morphologie, pour un apprenant francophone.

TU ÉCRIS EN FRANÇAIS. L'apprenant ne lit pas le russe — c'est ce qu'il
apprend. Tout ce que tu rédiges lui est montré tel quel, au moment précis où
il vient de se tromper. Le russe n'apparaît que CITÉ, entre guillemets, pour
désigner une forme : « la forme « стулами » n'existe pas ». Une explication
rédigée en russe est inutilisable, quelle que soit sa justesse.

Mot (forme du dictionnaire) : "${input.lemma}" (genre : ${input.gender}, ${
    input.animacy === "animate" ? "animé" : "inanimé"
  }).
Cas grammatical demandé : ${input.targetCase}${input.plural ? ", au PLURIEL" : ", au singulier"}.
${context}Un moteur de règles a calculé la forme attendue : "${input.computedForm}".
L'apprenant a répondu : "${input.userAnswer}".

Question : la réponse de l'apprenant est-elle une forme CORRECTE et ACCEPTABLE pour ce mot, ce cas et ce nombre — soit parce qu'elle est identique (aux différences de casse/espaces/ё-е près) à la forme calculée, soit parce que c'est une variante orthographique ou accentuée tout aussi correcte ? Sois STRICT : une vraie faute de déclinaison (mauvais cas, mauvaise terminaison, faute d'orthographe qui change réellement la forme) doit être refusée. N'accepte JAMAIS une réponse simplement "proche" ou "compréhensible" si elle est grammaticalement fautive — en cas de doute, refuse plutôt que d'accepter à tort.
${
  input.sentence
    ? `- Une exception, et une seule : si CETTE phrase appelait en réalité un autre cas que celui demandé (une préposition, un mot de quantité ou un numéral gouverne le trou), c'est l'exercice qui est fautif, pas l'apprenant — accepte alors sa réponse si elle est juste dans cette phrase.\n`
    : ""
}
Pour "reason" : UNE SEULE phrase, RÉDIGÉE EN FRANÇAIS, vingt-cinq mots au plus. Nomme le cas et le nombre de la forme que l'apprenant a écrite, sans lui inventer de fonction grammaticale (ne dis jamais d'un génitif que c'est « le cas du complément d'objet direct »). Si tu n'es pas sûr d'analyser sa forme, dis seulement en quoi elle diffère de la forme attendue.

Exemple de "reason" bien formé : "« стулами » n'est pas l'instrumental pluriel de стул : le radical s'y termine en -ль, d'où « стульями »."

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour : {"acceptable":true|false,"reason":"une phrase en français, vingt-cinq mots au plus"}`;
}

// ─── Filet de sécurité : vérification IA d'une traduction jugée fausse ──
// Même principe que answerVerificationPrompt, pour le mode "Frappe" du
// vocabulaire (app/vocabulary/typing) : la comparaison de chaînes reste la
// référence rapide et gratuite, l'IA n'est appelée qu'en filet de sécurité
// quand elle a déjà dit "faux" — synonyme correct, variante orthographique,
// accord de genre/nombre acceptable selon contexte.
export function translationVerificationPrompt(input: {
  expected: string;
  userAnswer: string;
  expectedLanguage: "ru" | "fr";
}) {
  const lang = input.expectedLanguage === "ru" ? "russe" : "français";
  return `Tu es un professeur de russe-français. Un apprenant devait écrire la traduction ${lang} d'un mot.

Réponse attendue : "${input.expected}".
Réponse de l'apprenant : "${input.userAnswer}".

Question : la réponse de l'apprenant est-elle une traduction ACCEPTABLE et correcte — identique, synonyme tout aussi correct, variante orthographique, ou accord de genre/nombre légitime selon le contexte ? Sois STRICT sur les vraies fautes (mot différent, faute d'orthographe qui change le sens) — refuse-les. En cas de doute, refuse plutôt que d'accepter à tort.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour : {"acceptable":true|false,"reason":"explication très courte en français"}`;
}

// ─── Suggestion de traduction à la saisie d'un mot ──────────────
// L'apprenant tape un mot dans sa liste, dans la langue qu'il veut : un mot
// russe entendu quelque part, ou un mot français dont il cherche
// l'équivalent. On lui propose l'autre moitié plutôt que de le laisser
// ouvrir un dictionnaire à côté.
//
// Ce n'est qu'une PROPOSITION : le formulaire la montre comme telle et la
// première frappe dans le champ la remplace. Rien ici n'entre dans un calcul
// de déclinaison — c'est du contenu que l'apprenant valide.
//
// Une seule traduction, courte : une liste de synonymes séparés par des
// virgules rendrait les modes « Frappe » et « QCM » inutilisables, la
// réponse attendue devant rester un mot qu'on peut taper.
/**
 * Un mot, ou une phrase entière ?
 *
 * LE CHAMP N'A JAMAIS ACCEPTÉ QUE DES MOTS, LES GENS Y METTENT DES PHRASES.
 * C'est légitime — on note une tournure entendue, une réplique, un bout de
 * texte qu'on veut pouvoir se redire — et le champ le permet déjà (400
 * caractères, voir lib/vocabulary/limits). Ce qui ne le permettait pas,
 * c'est la consigne envoyée au modèle : elle lui demandait « la forme du
 * dictionnaire » et « la traduction la plus courte possible, un mot, deux si
 * la langue l'exige ». Appliquée à un paragraphe, elle ne peut produire
 * qu'une glose — le modèle résume, ou renonce.
 *
 * Trois mots suffisent à basculer : « Что вы хотите » n'est plus une entrée
 * de dictionnaire, « спасибо большое » l'est encore.
 */
export function isPhrase(text: string): boolean {
  return text.trim().split(/\s+/).length >= 3;
}

export function translationSuggestionPrompt(word: string, from: "ru" | "fr") {
  if (isPhrase(word)) return phraseTranslationPrompt(word, from);

  const asked =
    from === "ru"
      ? `Mot RUSSE saisi : "${word}". Donne sa traduction française.`
      : `Mot FRANÇAIS saisi : "${word}". Donne le mot russe correspondant.`;

  return `Tu es un dictionnaire russe-français pour un apprenant francophone.

${asked}

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{"ru":"...","fr":"...","transliteration":"...","partOfSpeech":"...","confident":true|false}

Consignes :
- "ru" : le mot russe en cyrillique, forme du dictionnaire (nominatif
  singulier pour un nom, infinitif pour un verbe), avec son accent tonique
  marqué par un accent aigu combinant Unicode juste après la voyelle
  accentuée (ex. "спаси́бо"). ${
    from === "ru"
      ? "Recopie le mot saisi, en ajoutant seulement l'accent tonique — ne le corrige pas, ne le remplace pas par un autre mot."
      : "C'est LUI que l'apprenant attend : choisis le mot le plus courant, un seul."
  }
- "fr" : LA traduction française la plus courante, aussi courte que possible
  (un mot, deux si la langue l'exige). Pas de liste de synonymes, pas de
  parenthèses explicatives, pas d'article inutile. Pour un verbe, l'infinitif.${
    from === "fr" ? " Recopie ici le mot français saisi." : ""
  }
- "transliteration" : lecture du mot RUSSE en alphabet latin, orientée
  prononciation pour un francophone (ex. "спасибо" -> "spassiba").
- "partOfSpeech" : en français et en deux mots maximum ("nom masculin",
  "verbe imperfectif", "adjectif", "adverbe"...).
- "confident" : false si la saisie n'est pas un mot reconnaissable, si elle
  est ambiguë, ou si tu n'es pas sûr. Dans ce cas donne quand même ta
  meilleure hypothèse : c'est l'apprenant qui tranche.`;
}

/**
 * La même demande, pour un texte plutôt qu'un mot.
 *
 * DEUX DIFFÉRENCES, ET ELLES COMPTENT TOUTES LES DEUX.
 *
 * 1. ON NE DEMANDE PAS DE RECOPIER LE RUSSE quand c'est lui qui a été
 *    saisi : le serveur l'a déjà, et le lui faire répéter doublait la
 *    réponse — trois cents caractères de cyrillique à réémettre avant
 *    d'arriver à la traduction, pour un texte identique à l'entrée. C'est
 *    exactement ce qui faisait dépasser le plafond de sortie et rendait la
 *    réponse illisible : le JSON était coupé au milieu, la lecture échouait,
 *    et le champ français restait vide sans qu'aucune erreur ne le dise.
 *    L'accent tonique, lui, se pose ensuite par index (lib/vocabulary/accent),
 *    sans modèle et sans risque de réécriture.
 *
 * 2. LA TRADUCTION EST ENTIÈRE. Pour un mot on veut le plus court possible,
 *    parce que la réponse doit se taper en mode « Frappe ». Une phrase ne se
 *    tape pas : elle se relit. La tronquer ou la résumer, ici, c'est perdre
 *    ce qu'on était venu noter.
 */
function phraseTranslationPrompt(text: string, from: "ru" | "fr") {
  return from === "ru"
    ? `Tu es un traducteur russe-français pour un apprenant francophone.

Texte RUSSE saisi :
"""
${text}
"""

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{"fr":"...","confident":true|false}

Consignes :
- "fr" : la traduction française du texte ENTIER, du début à la fin. Naturelle,
  fidèle, dans le même registre. Ce n'est ni un résumé, ni une explication, ni
  une paraphrase : chaque proposition du texte doit s'y retrouver.
- Ne recopie pas le russe, ne le commente pas, n'ajoute aucune note.
- "confident" : false si le texte est incomplet, ambigu ou illisible. Donne
  quand même ta meilleure traduction — c'est l'apprenant qui tranche.`
    : `Tu es un traducteur français-russe pour un apprenant francophone.

Texte FRANÇAIS saisi :
"""
${text}
"""

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{"ru":"...","confident":true|false}

Consignes :
- "ru" : la traduction russe du texte ENTIER, en cyrillique, du début à la fin.
  Naturelle, fidèle, dans le même registre — ni résumé, ni paraphrase.
- N'écris pas l'accent tonique : il est posé ensuite, par index.
- Ne recopie pas le français, ne le commente pas, n'ajoute aucune note.
- "confident" : false si le texte est incomplet, ambigu ou illisible. Donne
  quand même ta meilleure traduction — c'est l'apprenant qui tranche.`;
}

// ─── Classification grammaticale d'un mot de vocabulaire perso ──
// Utilisée UNIQUEMENT pour déduire genre/animacité/type de radical d'un
// mot ajouté par l'utilisateur à une liste perso — jamais pour calculer
// une forme fléchie (ça reste le rôle du moteur de règles). L'heuristique
// locale (lib/vocabulary/grammar-classify.ts) est tentée en premier ; ceci
// ne sert qu'à compléter ce qu'elle ne peut pas déduire (surtout
// l'animacité, qui dépend du sens du mot).
export function vocabGrammarSystemPrompt(word: string, translation: string) {
  return `Tu es un linguiste spécialiste du russe et du français. On te donne un nom commun russe au nominatif singulier : "${word}", traduit en français par : "${translation}".

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme :
{"gender":"masculine|feminine|neuter","animacy":"animate|inanimate","stem_type":"hard|soft|mixed","indeclinable":true|false,"french_gender":"m|f"}

Précisions :
- "animacy":"animate" pour une personne ou un animal, "inanimate" sinon.
- "stem_type":"mixed" si le radical se termine par г, к, х, ж, ч, ш ou щ ; "soft" si le radical est mou (ex. finale -ь, -й, -я, -е d'un vrai adoucissement) ; "hard" sinon.
- "indeclinable" à true pour un emprunt qui ne se décline jamais (ex. кофе, метро, такси).
- "french_gender" est le genre grammatical du mot FRANÇAIS donné en traduction (indépendant du genre russe : ex. "книга" est féminin en russe mais sa traduction "livre" est masculine en français -> "m"). Si la traduction contient plusieurs mots ou options séparées par "/" ou ",", donne le genre du premier substantif.
- Si le mot n'est pas un nom commun russe déclinable normalement (ex. adjectif, verbe, mot étranger non intégré), réponds quand même avec ta meilleure estimation raisonnable — ne laisse jamais un champ vide.`;
}

// ─── Génération d'un texte de lecture gradué (contenu ORIGINAL) ──
const READING_LENGTH_GUIDANCE = {
  short: "court : 4 à 6 phrases",
  medium: "moyen : 8 à 12 phrases",
  long: "long : 15 à 20 phrases",
} as const;
export type ReadingLength = keyof typeof READING_LENGTH_GUIDANCE;

const READING_STYLE_GUIDANCE = {
  narrative: "un récit à la 3e personne (on suit un personnage)",
  dialogue: "un dialogue entre deux personnages (répliques introduites par un tiret \"— \")",
  description: "une description (lieu, personne, objet ou situation, sans intrigue)",
} as const;
export type ReadingStyle = keyof typeof READING_STYLE_GUIDANCE;

export interface ReadingOptions {
  level: CefrLevel;
  length?: ReadingLength;
  style?: ReadingStyle;
  focusCase?: CaseId;
}

// ─── Explication d'un mot de vocabulaire ────────────────────────
// Du COMMENTAIRE, pas du calcul : on demande au modèle ce qu'un
// dictionnaire ne donne pas — la nuance, le registre, le piège pour un
// francophone. Aucune forme fléchie n'est produite ici ; les déclinaisons
// restent du ressort du moteur de règles et du dictionnaire.
export function wordExplanationPrompt(input: {
  ru: string;
  fr: string;
  level: string;
}) {
  return `Tu es un professeur de russe qui enseigne à des francophones. Explique le mot russe "${input.ru}", que l'apprenant a noté avec la traduction "${input.fr}". Son niveau est ${input.level}.

Écris pour quelqu'un qui connaît déjà la traduction : ne répète pas simplement le sens, apporte ce qu'une traduction seule ne dit pas.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{"meaning":"...","partOfSpeech":"...","register":"...","examples":[{"ru":"...","fr":"..."}],"collocations":["..."],"related":["..."],"pitfall":"..."}

Consignes :
- "meaning" : deux ou trois phrases en français. Ce que le mot recouvre exactement, ses connotations, dans quelles situations on l'emploie vraiment.
- "partOfSpeech" : en français ("nom masculin", "verbe imperfectif", "adjectif"...). Pour un verbe, précise l'aspect et donne son partenaire aspectuel.
- "register" : "courant", "familier", "soutenu", "technique", "vieilli"...
- "examples" : deux ou trois phrases COURTES adaptées au niveau ${input.level}, chacune employant réellement le mot "${input.ru}" (fléchi si besoin), avec sa traduction française.
- "collocations" : expressions ou associations habituelles du mot, en russe suivi du français entre parenthèses.
- "related" : mots proches (synonymes, mots de la même famille, ou l'autre membre de la paire aspectuelle), chacun avec ce qui le DISTINGUE en quelques mots.
- "pitfall" : le piège pour un francophone — faux-ami, cas exigé par le verbe, aspect à ne pas confondre, préposition inattendue. Omets ce champ s'il n'y a rien de notable ; n'invente pas de difficulté.
- Tout le français doit être naturel et sans jargon inutile. Le russe doit porter les accents toniques uniquement s'ils sont pédagogiquement utiles.`;
}

export function readingSystemPrompt({
  level,
  length = "medium",
  style = "narrative",
  focusCase,
}: ReadingOptions) {
  const focusCaseInfo = focusCase ? CASES.find((c) => c.id === focusCase) : undefined;
  const focusInstruction = focusCaseInfo
    ? `- Fais un usage RÉPÉTÉ et NATUREL du cas "${focusCaseInfo.nameFr}" (${focusCaseInfo.nameRu}, ${focusCaseInfo.question}) : ${focusCaseInfo.usage} Le texte doit contenir plusieurs occurrences claires de ce cas (prépositions ou verbes qui le déclenchent), sans que ça sonne artificiel.`
    : "";

  return `Tu es un auteur de textes pédagogiques de russe langue étrangère pour francophones.
Niveau CEFR : ${level} (${LEVEL_GUIDANCE[level]}).
Longueur souhaitée : ${READING_LENGTH_GUIDANCE[length]}.
Forme : ${READING_STYLE_GUIDANCE[style]}.
${focusInstruction}

Tâche : écrire un TEXTE ORIGINAL, gradué, adapté au niveau, sur une situation concrète de la vie quotidienne.
IMPORTANT — droit d'auteur :
- Écris un texte 100% original. Ne reproduis JAMAIS d'extrait d'œuvre existante sous droit d'auteur.
- Tu ne dois pas prétendre citer un livre réel. Ce texte est un contenu pédagogique original.

Fournis aussi, pour CHAQUE mot russe, une glose mot-à-mot ET le cas grammatical qu'il porte :
- "case" vaut l'une de ces valeurs EXACTES : "nominative", "genitive", "dative", "accusative",
  "instrumental", "prepositional" — UNIQUEMENT pour un nom/adjectif/pronom/numéral qui porte
  visiblement une marque de cas dans cette phrase précise (pas le nominatif "par défaut" d'un
  sujet neutre : ne tague le nominatif QUE si ça aide à voir un contraste, par exemple un attribut
  après "быть"). Omets "case" (ne mets pas le champ, ou mets null) pour les verbes, adverbes,
  conjonctions, prépositions, la ponctuation, et tout mot invariable.
- Ne devine JAMAIS un cas dont tu n'es pas sûr — mieux vaut omettre "case" qu'en donner un faux.

Réponds UNIQUEMENT avec un JSON valide de la forme :
{"title":"titre en russe","title_fr":"titre en français","level":"${level}",
 "sentences":[[{"ru":"mot","gloss":"traduction ou null pour la ponctuation","case":"genitive ou null"}, ...], ...],
 "summary_fr":"résumé en 1 phrase française"}`;
}
