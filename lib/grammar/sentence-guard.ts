import { CaseId } from "./types";
import { CaseTrigger } from "./triggers";
import { pluralizeWord, type ArticleMode } from "./french-article";

/**
 * Garde-fou : une phrase à trou est-elle réellement une phrase de CE cas ?
 *
 * Le moteur de règles calcule la bonne réponse à partir du cas de la page
 * (`caseInfo.id`) et du nombre du déclencheur, jamais à partir de la phrase.
 * Tant que la phrase venait d'un gabarit curé, l'accord était garanti par
 * construction. Depuis que l'IA rédige la phrase, il ne l'est plus : elle a
 * écrit « Не́сколько ___ сиде́ли на дива́не » pour illustrer le NOMINATIF
 * pluriel — sauf que « несколько » impose le génitif. L'apprenant tapait
 * « детей » (juste dans cette phrase) et l'exercice comptait une faute, en
 * lui expliquant par-dessus le marché que le nominatif pluriel de ребёнок
 * est дети. Une erreur de ce type n'est pas un défaut d'affichage : c'est
 * une faute enseignée, et elle décrédibilise tout le module.
 *
 * D'où ce module : un contrôle DÉTERMINISTE, en amont de l'apprenant, qui
 * regarde ce qui GOUVERNE le trou dans la phrase proposée et refuse la
 * phrase si ce gouverneur n'admet pas le cas demandé. Pas d'IA ici — c'est
 * précisément l'IA qu'on surveille.
 *
 * Il sert à trois endroits, avec la même table :
 *   - app/api/ai/exercise/route.ts : refuse la phrase IA (et en redemande une) ;
 *   - components/exercises/CaseDeclension.tsx : dernier filet côté client ;
 *   - scripts/check-declensions.mjs : vérifie les gabarits curés eux-mêmes,
 *     pour que la règle et les données ne puissent pas diverger en silence.
 *
 * Ce que le module NE fait PAS : juger si la phrase est naturelle, ni valider
 * une construction sans gouverneur lexical (objet direct d'un verbe, datif
 * d'attribution). Il attrape ce qui se voit dans les mots — c'est-à-dire
 * toute cette famille d'erreurs : prépositions, quantificateurs, numéraux.
 *
 * Il garde aussi le versant FRANÇAIS de l'exercice, pour une raison voisine :
 * la traduction est la seule chose qui dise quel mot chercher, et le modèle
 * peut la rédiger autour d'un autre sens que celui du lemme qu'il a choisi.
 * Voir validateFrenchSentence, en bas de fichier.
 */

/** Cas admis par chaque mot qui gouverne le nom qui le suit. */
const GOVERNORS: Record<string, CaseId[]> = {
  // ─── Prépositions du génitif ───
  без: ["genitive"],
  безо: ["genitive"],
  близ: ["genitive"],
  вблизи: ["genitive"],
  вдоль: ["genitive"],
  вместо: ["genitive"],
  вне: ["genitive"],
  внутри: ["genitive"],
  возле: ["genitive"],
  вокруг: ["genitive"],
  впереди: ["genitive"],
  вроде: ["genitive"],
  для: ["genitive"],
  до: ["genitive"],
  из: ["genitive"],
  изо: ["genitive"],
  "из-за": ["genitive"],
  "из-под": ["genitive"],
  кроме: ["genitive"],
  мимо: ["genitive"],
  накануне: ["genitive"],
  напротив: ["genitive"],
  насчёт: ["genitive"],
  около: ["genitive"],
  от: ["genitive"],
  ото: ["genitive"],
  подле: ["genitive"],
  позади: ["genitive"],
  помимо: ["genitive"],
  после: ["genitive"],
  посреди: ["genitive"],
  против: ["genitive"],
  ради: ["genitive"],
  сверх: ["genitive"],
  снаружи: ["genitive"],
  среди: ["genitive"],
  сзади: ["genitive"],
  у: ["genitive"],

  // ─── Prépositions du datif ───
  к: ["dative"],
  ко: ["dative"],
  благодаря: ["dative"],
  вопреки: ["dative"],
  согласно: ["dative"],
  навстречу: ["dative"],
  подобно: ["dative"],
  // "по" a des emplois marginaux à l'accusatif ("по пояс") et au
  // prépositionnel ("по приезде") — hors de portée d'un exercice A1-B1, et
  // les admettre rouvrirait exactement le trou qu'on ferme ici.
  по: ["dative"],

  // ─── Prépositions de l'accusatif ───
  про: ["accusative"],
  сквозь: ["accusative"],
  спустя: ["accusative"],
  через: ["accusative"],

  // ─── Prépositions de l'instrumental ───
  над: ["instrumental"],
  надо: ["instrumental"],
  перед: ["instrumental"],
  передо: ["instrumental"],
  меж: ["instrumental"],

  // ─── Préposition du prépositionnel ───
  при: ["prepositional"],

  // ─── Prépositions à double régime ───
  // Les deux cas sont légitimes : c'est le sens (mouvement / localisation)
  // qui tranche, et ça, une table de mots ne peut pas le savoir. On les
  // laisse donc passer pour leurs DEUX cas — et pour eux seulement.
  в: ["accusative", "prepositional"],
  во: ["accusative", "prepositional"],
  на: ["accusative", "prepositional"],
  за: ["accusative", "instrumental"],
  под: ["accusative", "instrumental"],
  подо: ["accusative", "instrumental"],
  о: ["prepositional", "accusative"],
  об: ["prepositional", "accusative"],
  обо: ["prepositional", "accusative"],
  с: ["genitive", "instrumental"],
  со: ["genitive", "instrumental"],
  между: ["instrumental", "genitive"],

  // ─── Quantité, mesure, absence : génitif ───
  нет: ["genitive"],
  много: ["genitive"],
  немного: ["genitive"],
  мало: ["genitive"],
  немало: ["genitive"],
  несколько: ["genitive"],
  сколько: ["genitive"],
  столько: ["genitive"],
  больше: ["genitive"],
  меньше: ["genitive"],
  достаточно: ["genitive"],
  множество: ["genitive"],
  большинство: ["genitive"],
  меньшинство: ["genitive"],
  полно: ["genitive"],
  пара: ["genitive"],
  куча: ["genitive"],
  масса: ["genitive"],
  половина: ["genitive"],
  треть: ["genitive"],
  четверть: ["genitive"],
  количество: ["genitive"],
  кусок: ["genitive"],
  стакан: ["genitive"],
  чашка: ["genitive"],
  бутылка: ["genitive"],
  банка: ["genitive"],
  пачка: ["genitive"],
  коробка: ["genitive"],
  бокал: ["genitive"],
  ложка: ["genitive"],
  тарелка: ["genitive"],
  килограмм: ["genitive"],
  грамм: ["genitive"],
  литр: ["genitive"],
  полный: ["genitive"],
  полное: ["genitive"],
  полные: ["genitive"],
  полон: ["genitive"],
  полна: ["genitive"],
  полны: ["genitive"],
  достоин: ["genitive"],
  достойна: ["genitive"],
  достойно: ["genitive"],
  достойны: ["genitive"],
  жаль: ["genitive"],
  // « нет » au passé et au futur : « не было ___ », « не будет ___ ».
  // Reconnus en deux mots (voir findGovernor) pour ne pas confondre avec le
  // simple passé d'un verbe.
  "не было": ["genitive"],
  "не будет": ["genitive"],

  // ─── Numéraux cardinaux : ils imposent le cas du nom compté ───
  два: ["genitive"],
  две: ["genitive"],
  три: ["genitive"],
  четыре: ["genitive"],
  оба: ["genitive"],
  обе: ["genitive"],
  полтора: ["genitive"],
  полторы: ["genitive"],
  пять: ["genitive"],
  шесть: ["genitive"],
  семь: ["genitive"],
  восемь: ["genitive"],
  девять: ["genitive"],
  десять: ["genitive"],
  одиннадцать: ["genitive"],
  двенадцать: ["genitive"],
  тринадцать: ["genitive"],
  четырнадцать: ["genitive"],
  пятнадцать: ["genitive"],
  шестнадцать: ["genitive"],
  семнадцать: ["genitive"],
  восемнадцать: ["genitive"],
  девятнадцать: ["genitive"],
  двадцать: ["genitive"],
  тридцать: ["genitive"],
  сорок: ["genitive"],
  пятьдесят: ["genitive"],
  шестьдесят: ["genitive"],
  семьдесят: ["genitive"],
  восемьдесят: ["genitive"],
  девяносто: ["genitive"],
  сто: ["genitive"],
  тысяча: ["genitive"],
  миллион: ["genitive"],
};

/** Étiquette lisible d'un cas, pour les motifs de refus. */
export const CASE_LABEL: Record<CaseId, string> = {
  nominative: "nominatif",
  genitive: "génitif",
  dative: "datif",
  accusative: "accusatif",
  instrumental: "instrumental",
  prepositional: "prépositionnel",
};

/**
 * Variantes orthographiques d'une même préposition (в/во, с/со…). Le
 * déclencheur est écrit sous sa forme de citation ("в"), la phrase peut
 * légitimement porter l'autre ("во вто́рник", "со мной") : les confondre
 * ferait refuser des phrases justes.
 */
const PREPOSITION_VARIANTS: Record<string, string[]> = {
  в: ["в", "во"],
  во: ["в", "во"],
  с: ["с", "со"],
  со: ["с", "со"],
  к: ["к", "ко"],
  ко: ["к", "ко"],
  о: ["о", "об", "обо"],
  об: ["о", "об", "обо"],
  обо: ["о", "об", "обо"],
  под: ["под", "подо"],
  над: ["над", "надо"],
  перед: ["перед", "передо"],
  из: ["из", "изо"],
  от: ["от", "ото"],
  без: ["без", "безо"],
  // Mêmes déclencheurs, autres formes : le libellé cite « нет », « полный »
  // ou « достоин », la phrase peut légitimement porter « не было »,
  // « полна », « достойны ».
  нет: ["нет", "не было", "не будет"],
  полный: ["полный", "полное", "полные", "полон", "полна", "полно", "полны"],
  достоин: ["достоин", "достойна", "достойно", "достойны"],
};

/**
 * Mots qui peuvent légitimement s'intercaler entre le gouverneur et le nom
 * du trou : adjectifs, possessifs, démonstratifs. On les saute pour aller
 * chercher le vrai gouverneur — « в большо́м но́вом ___ » est gouverné par
 * « в », pas par « новом ».
 */
const ADJECTIVAL_ENDING =
  /(ый|ий|ой|ая|яя|ое|ее|ые|ие|ого|его|ому|ему|ым|им|ых|их|ую|юю|ыми|ими|ом|ем|ей)$/;

/**
 * Pronoms personnels aux cas obliques. Ils ARRÊTENT la remontée vers le
 * gouverneur, au lieu d'être sautés comme des épithètes.
 *
 * « На ней ___ пла́тье » : le trou est un sujet au nominatif, et « на »
 * gouverne « ней », pas le trou. Sans cette liste, « ней » ressemble à une
 * épithète (finale -ей), on le saute, on trouve « на », et on refuse une
 * phrase parfaitement juste.
 *
 * Les possessifs его / её / их n'y sont pas : ils sont bel et bien des
 * épithètes (« его́ кни́га »), et les sauter est le bon comportement.
 */
const OBLIQUE_PRONOUNS = new Set([
  "меня", "мне", "мной", "мною",
  "тебя", "тебе", "тобой", "тобою",
  "нас", "нам", "нами",
  "вас", "вам", "вами",
  "него", "нему", "ним", "нём", "ней", "неё", "нею", "них", "ними",
  "ему", "ей", "ею", "им", "ими",
  "себя", "себе", "собой", "собою",
]);

const DETERMINERS = new Set([
  "мой", "моя", "моё", "мои", "моего", "моему", "моим", "моих", "моими", "моей", "мою", "моём",
  "твой", "твоя", "твоё", "твои", "твоего", "твоему", "твоим", "твоих", "твоими", "твоей", "твою", "твоём",
  "наш", "наша", "наше", "наши", "нашего", "нашему", "нашим", "наших", "нашими", "нашей", "нашу", "нашем",
  "ваш", "ваша", "ваше", "ваши", "вашего", "вашему", "вашим", "ваших", "вашими", "вашей", "вашу", "вашем",
  "свой", "своя", "своё", "свои", "своего", "своему", "своим", "своих", "своими", "своей", "свою", "своём",
  "его", "её", "их",
  "этот", "эта", "это", "эти", "этого", "этому", "этом", "этой", "эту", "этим", "этих", "этими",
  "тот", "та", "те", "того", "тому", "том", "той", "ту", "тем", "тех", "теми",
  "весь", "вся", "всё", "все", "всего", "всему", "всем", "всех", "всеми",
  "один", "одна", "одно", "одни", "одного", "одному", "одним", "одних", "одной", "одну",
  "какой", "какая", "какое", "какие", "чей", "чья", "чьё", "чьи",
  "самый", "самая", "самое", "самые", "любой", "каждый", "другой",
]);

/**
 * Terminaisons qui marquent le nombre SANS ambiguïté.
 *
 * Plus étroit que ADJECTIVAL_ENDING, et pour une raison précise : sauter un
 * mot qu'on prend à tort pour une épithète est sans conséquence (on continue
 * de chercher le gouverneur), mais en DÉDUIRE un nombre l'a. Sont donc
 * écartées les finales qu'un nom porte couramment — -ом / -ем / -ой / -ей
 * (столо́м, мо́рем, стено́й) — ainsi que -ым / -им (instrumental singulier ET
 * datif pluriel). Un marqueur ambigu ne dit rien, et le faire parler
 * produirait des refus faux.
 *
 * -ую / -юю relèvent de la même prudence, et ont été retirées : c'est aussi
 * la 1re personne du présent des verbes en -овать / -евать. « Я тре́бую ___ »,
 * « Я сове́тую ___ », « Я зави́дую ___ » se lisaient comme une épithète
 * féminine à l'accusatif, et le gabarit était refusé dès qu'on lui demandait
 * un pluriel — un refus faux sur une phrase parfaitement correcte, invisible
 * tant que ces gabarits n'étaient servis qu'au singulier. Des noms la portent
 * aussi (« ста́тую »), ce qui suffirait à elle seule.
 */
const PLURAL_ENDING = /(ые|ие|ых|их|ыми|ими)$/;
const SINGULAR_ENDING = /(ый|ий|ая|яя|ое|ее|ого|его|ому|ему)$/;

const PLURAL_DETERMINERS = new Set([
  "эти", "этих", "этими", "те", "тех", "теми", "все", "всех", "всеми",
  "мои", "моих", "моими", "твои", "твоих", "твоими", "наши", "наших", "нашими",
  "ваши", "ваших", "вашими", "свои", "своих", "своими", "одни", "одних", "какие", "чьи",
  "самые",
]);
const SINGULAR_DETERMINERS = new Set([
  // « это » n'y est PAS : il est aussi le présentatif (« Э́то ру́сские
  // кни́ги », ce sont des livres russes), où il ne dit rien du nombre du
  // groupe qui suit. Il reste dans DETERMINERS — on peut le sauter pour
  // chercher un gouverneur —, il cesse seulement de trancher le nombre.
  "этот", "эта", "этого", "этому", "этом", "этой", "эту",
  "тот", "та", "того", "тому", "том", "той", "ту",
  "весь", "вся", "всё", "всего", "всему",
  "мой", "моя", "моё", "моего", "моему", "моей", "мою", "моём",
  "твой", "твоя", "твоё", "твоего", "твоему", "твоей", "твою", "твоём",
  "наш", "наша", "наше", "нашего", "нашему", "нашей", "нашу", "нашем",
  "ваш", "ваша", "ваше", "вашего", "вашему", "вашей", "вашу", "вашем",
  "свой", "своя", "своё", "своего", "своему", "своей", "свою", "своём",
  "один", "одна", "одно", "одного", "одному", "одной", "одну",
  "какой", "какая", "какое", "чей", "чья", "чьё",
  "самый", "самая", "самое",
]);

export const BLANK = "___";

/** Minuscules, ё → е, accent tonique retiré : la table est lue ainsi. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/́/g, "").replace(/ё/g, "е");
}

// Les tables ci-dessus s'écrivent avec des ё ("насчёт", "моё") : on les
// normalise une fois au chargement plutôt que d'imposer une orthographe
// artificielle aux littéraux.
function normalizedKeys<T>(source: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(source)) out[normalize(key)] = value;
  return out;
}
function normalizedSet(source: Set<string>): Set<string> {
  return new Set([...source].map(normalize));
}
const GOVERNORS_N = normalizedKeys(GOVERNORS);
const VARIANTS_N = normalizedKeys(PREPOSITION_VARIANTS);
const DETERMINERS_N = normalizedSet(DETERMINERS);
const PLURAL_DETERMINERS_N = normalizedSet(PLURAL_DETERMINERS);
const SINGULAR_DETERMINERS_N = normalizedSet(SINGULAR_DETERMINERS);
const OBLIQUE_PRONOUNS_N = normalizedSet(OBLIQUE_PRONOUNS);

type Token = { kind: "word"; text: string } | { kind: "punct"; text: string };

/** Découpe en gardant la ponctuation : une virgule coupe la gouvernance. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /([а-я0-9]+(?:-[а-я0-9]+)*)|([^\sа-я0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) tokens.push({ kind: "word", text: m[1] });
    else tokens.push({ kind: "punct", text: m[2] });
  }
  return tokens;
}

function isAdjectival(word: string): boolean {
  return DETERMINERS_N.has(word) || ADJECTIVAL_ENDING.test(word);
}

/** Cas imposé par un nombre écrit en chiffres (5 книг, 21 книга, 22 книги). */
function casesForDigits(word: string): CaseId[] | undefined {
  if (!/^\d+$/.test(word)) return undefined;
  const n = Number(word);
  if (!Number.isFinite(n)) return undefined;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return ["genitive"];
  return n % 10 === 1 ? ["nominative"] : ["genitive"];
}

export interface Governor {
  /** Le mot tel qu'il apparaît, normalisé. */
  word: string;
  /** Cas qu'il admet pour le nom qu'il gouverne. */
  cases: CaseId[];
}

/**
 * Le mot qui gouverne le trou, s'il y en a un. On remonte depuis le trou en
 * sautant au plus trois épithètes ; une ponctuation forte, ou un mot qui
 * n'est ni gouverneur ni épithète, arrête la remontée — c'est alors un verbe
 * ou un sujet, et la gouvernance n'est plus lexicale (objet direct, datif
 * d'attribution) : il n'y a rien à vérifier de ce côté.
 */
export function findGovernor(sentence: string): Governor | undefined {
  const blankAt = sentence.indexOf(BLANK);
  const before = normalize(blankAt >= 0 ? sentence.slice(0, blankAt) : sentence);
  const tokens = tokenize(before);

  let skipped = 0;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
    if (token.kind === "punct") {
      // Le tiret d'incise et les guillemets ne coupent rien d'utile ; une
      // virgule ou un point séparent bel et bien deux syntagmes.
      if (/[,.;:!?…]/.test(token.text)) return undefined;
      continue;
    }
    const word = token.text;
    const previous = tokens[i - 1]?.kind === "word" ? tokens[i - 1].text : "";

    // Locutions en deux mots : le second mot seul dirait autre chose.
    if (word === "время" && previous === "во") return { word: "во время", cases: ["genitive"] };
    if (word === "на" && previous === "несмотря") {
      return { word: "несмотря на", cases: ["accusative"] };
    }
    if ((word === "было" || word === "будет") && previous === "не") {
      return { word: `не ${word}`, cases: ["genitive"] };
    }

    const digits = casesForDigits(word);
    if (digits) return { word, cases: digits };

    const cases = GOVERNORS_N[word];
    if (cases) return { word, cases };

    // Un pronom oblique a déjà consommé la préposition qui le précède.
    if (OBLIQUE_PRONOUNS_N.has(word)) return undefined;

    if (isAdjectival(word) && skipped < 3) {
      skipped += 1;
      continue;
    }
    return undefined;
  }
  return undefined;
}

/**
 * Nombre exigé par l'épithète collée au trou, quand elle le marque sans
 * ambiguïté. Attrape « Здесь только но́вые ___ » servi pour une réponse au
 * singulier (et l'inverse) : la désinence attendue serait alors en désaccord
 * avec la phrase que l'apprenant a sous les yeux.
 */
function attributeNumber(sentence: string): "singular" | "plural" | undefined {
  const blankAt = sentence.indexOf(BLANK);
  if (blankAt < 0) return undefined;
  const tokens = tokenize(normalize(sentence.slice(0, blankAt)));
  const last = tokens[tokens.length - 1];
  if (!last || last.kind !== "word") return undefined;
  const word = last.text;
  if (PLURAL_DETERMINERS_N.has(word)) return "plural";
  if (SINGULAR_DETERMINERS_N.has(word)) return "singular";
  if (DETERMINERS_N.has(word)) return undefined; // déterminant ambigu : on se tait
  if (GOVERNORS_N[word] || casesForDigits(word)) return undefined;
  if (PLURAL_ENDING.test(word)) return "plural";
  if (SINGULAR_ENDING.test(word)) return "singular";
  return undefined;
}

/**
 * Gouverneur(s) attendu(s) d'après le déclencheur qu'on a demandé à
 * illustrer. `undefined` = ce déclencheur n'impose aucun mot devant le trou
 * (verbe à régime, « это », « мн. число »…) : on ne peut rien exiger, et
 * exiger quand même ferait refuser des phrases justes.
 */
export function expectedGovernors(trigger: CaseTrigger): string[] | undefined {
  // "у ... есть" → "у" ; "говорить о" → "о" ; "несмотря на" → "на" ;
  // "работать +" → rien. On lit les mots du libellé et on garde le premier
  // qui soit un gouverneur connu.
  const words = normalize(trigger.ru)
    .replace(/\(.*?\)/g, " ")
    .split(/[^а-я0-9-]+/)
    .filter(Boolean);

  if (words.includes("несмотря")) return ["несмотря на"];
  if (words.includes("во") && words.includes("время")) return ["во время"];

  for (const word of words) {
    if (GOVERNORS_N[word]) return VARIANTS_N[word] ?? [word];
  }
  return undefined;
}

/**
 * Ce qu'un déclencheur SANS gouverneur laisse quand même dans la phrase.
 *
 * LE TROU QUE ÇA BOUCHE. `expectedGovernors` rend `undefined` pour 68 des
 * 136 déclencheurs — tous les verbes à régime, qui n'imposent aucun mot
 * DEVANT le trou (« Я занима́юсь ___ ») — et le contrôle d'identité ne
 * s'appliquait donc pas à eux. Une phrase au bon cas mais bâtie sur un autre
 * verbe passait : l'écran annonçait « заниматься » au-dessus d'une phrase
 * qui ne le contient pas.
 *
 * COMPARER SUR UN RADICAL, PAS SUR L'INFINITIF. Le russe conjugue en
 * modifiant le thème : тре́бовать → тре́бую, ви́деть → ви́жу, писа́ть → пишу́.
 * Chercher l'infinitif ne trouve presque rien.
 *
 * ET CALIBRER SUR LE GABARIT DE RÉFÉRENCE, plutôt que sur un seuil unique.
 * Un préfixe de six lettres attrape « занима́ется » depuis « занима́ться » ;
 * le même seuil sur « есть » → « ем » refuserait un gabarit juste. On mesure
 * donc ce que le gabarit d'origine — écrit à la main, relu — partage avec la
 * racine, et on exige AUTANT d'une nouvelle phrase, jamais plus. Le contrôle
 * est fort là où la langue le permet, muet là où elle ne le permet pas, et
 * ne peut par construction refuser aucun gabarit existant.
 */
export interface LexicalMark {
  /** Racine attendue quelque part dans la phrase. */
  stem: string;
  /** Longueur de préfixe commun exigée, mesurée sur le gabarit de référence. */
  minPrefix: number;
}

/** Terminaisons de l'infinitif russe, à retirer pour obtenir la racine. */
const INFINITIVE_ENDING = /(ться|тись|ся|ть|ти|чь)$/;

/** En dessous, la racine attraperait n'importe quel mot : on se tait. */
const MIN_MARK_PREFIX = 2;

function cyrillicWords(text: string): string[] {
  return normalize(text).match(/[а-я]+/g) ?? [];
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

export function expectedLexicalMark(trigger: CaseTrigger): LexicalMark | undefined {
  // Le libellé porte parfois un régime (« занима́ться (+ твор.) », « стать + »)
  // ou une abréviation (« мн. число́ ») : on ne garde que les mots russes.
  const label = normalize(trigger.ru).replace(/\(.*?\)/g, " ");
  // Une abréviation (le point) ou plusieurs mots : ce n'est pas une entrée
  // lexicale, il n'y a rien à retrouver dans la phrase.
  if (label.includes(".")) return undefined;
  const words = label.match(/[а-я]+/g) ?? [];
  if (words.length !== 1) return undefined;

  const word = words[0];
  // Un gouverneur est déjà vérifié par le contrôle 2, avec sa table de
  // variantes : le refaire ici, sans elles, ferait refuser « во » pour « в ».
  if (GOVERNORS_N[word]) return undefined;

  const stem = INFINITIVE_ENDING.test(word) ? word.replace(INFINITIVE_ENDING, "") : word;
  if (stem.length < MIN_MARK_PREFIX) return undefined;

  const reference = cyrillicWords(trigger.template.ru).reduce(
    (best, w) => Math.max(best, commonPrefix(stem, w)),
    0
  );
  if (reference < MIN_MARK_PREFIX) return undefined;
  return { stem, minPrefix: reference };
}

export interface GuardInput {
  sentence: string;
  targetCase: CaseId;
  plural: boolean;
  trigger?: CaseTrigger;
  /**
   * Formes que la phrase ne doit pas déjà contenir : la réponse attendue et
   * le lemme. Une phrase qui les donne rend l'exercice sans objet.
   */
  forbiddenForms?: string[];
}

export interface GuardVerdict {
  ok: boolean;
  /** Motif du refus, en français — journalisé côté serveur, jamais affiché. */
  reason?: string;
}

/** Le contrôle complet. Voir l'en-tête du module pour le pourquoi. */
export function validateSentence(input: GuardInput): GuardVerdict {
  const { sentence, targetCase, plural, trigger, forbiddenForms } = input;

  if (typeof sentence !== "string" || !sentence.trim()) {
    return { ok: false, reason: "phrase vide" };
  }
  const blanks = sentence.split(BLANK).length - 1;
  if (blanks !== 1) {
    return { ok: false, reason: `${blanks} trou(s) au lieu d'un seul` };
  }
  if (!/[а-яё]/i.test(sentence)) {
    return { ok: false, reason: "phrase sans cyrillique" };
  }
  // Un trou suivi d'une désinence recollée ("___ой") laisserait croire à
  // l'apprenant qu'il ne doit taper qu'un morceau du mot.
  const after = sentence.slice(sentence.indexOf(BLANK) + BLANK.length);
  if (/^[а-яёa-z]/i.test(after)) {
    return { ok: false, reason: "le trou est collé à un morceau de mot" };
  }

  const normalized = normalize(sentence);
  for (const form of forbiddenForms ?? []) {
    const target = normalize(form);
    if (!target) continue;
    if (new RegExp(`(^|[^а-я])${target}([^а-я]|$)`).test(normalized)) {
      return { ok: false, reason: `la phrase contient déjà « ${form} »` };
    }
  }

  const governor = findGovernor(sentence);

  // ── Contrôle 1 : le gouverneur trouvé admet-il le cas demandé ? ──
  // C'est celui qui attrape « Несколько ___ » servi pour du nominatif.
  if (governor && !governor.cases.includes(targetCase)) {
    return {
      ok: false,
      reason:
        `« ${governor.word} » gouverne le trou et impose ` +
        `${governor.cases.map((c) => CASE_LABEL[c]).join(" ou ")}, ` +
        `pas ${CASE_LABEL[targetCase]}`,
    };
  }

  // ── Contrôle 2 : la phrase illustre-t-elle LE déclencheur annoncé ? ──
  // Sans lui, une phrase au bon cas mais bâtie sur une autre préposition
  // afficherait un intitulé de déclencheur faux au-dessus de l'exercice.
  if (trigger) {
    const expected = expectedGovernors(trigger);
    if (expected && (!governor || !expected.includes(governor.word))) {
      return {
        ok: false,
        reason: governor
          ? `le trou est gouverné par « ${governor.word} », pas par « ${expected[0]} »`
          : `« ${expected[0]} » ne précède pas le trou`,
      };
    }
  }

  // ── Contrôle 4 : le déclencheur est-il DANS la phrase ? ──
  // Pour les 68 déclencheurs sans gouverneur — les verbes à régime — c'est
  // le seul contrôle d'identité possible. Voir expectedLexicalMark.
  if (trigger && !expectedGovernors(trigger)) {
    const mark = expectedLexicalMark(trigger);
    if (mark) {
      const found = cyrillicWords(sentence).some(
        (word) => commonPrefix(mark.stem, word) >= mark.minPrefix
      );
      if (!found) {
        return {
          ok: false,
          reason: `la phrase ne contient aucune forme de « ${trigger.ru} »`,
        };
      }
    }
  }

  // ── Contrôle 3 : le nombre de la phrase et celui de la réponse ──
  const marked = attributeNumber(sentence);
  if (marked && marked !== (plural ? "plural" : "singular")) {
    return {
      ok: false,
      reason:
        `l'épithète devant le trou est au ${marked === "plural" ? "pluriel" : "singulier"}, ` +
        `la réponse attendue au ${plural ? "pluriel" : "singulier"}`,
    };
  }

  return { ok: true };
}

// ─── Côté français : la traduction doit désigner LE mot du trou ──────
//
// Deuxième façon de rendre un exercice insoluble, et elle n'a rien à voir
// avec les cas. La phrase française est la seule chose qui dise à
// l'apprenant QUEL mot chercher ; le modèle la rédige librement et peut la
// bâtir autour d'un autre sens que celui du lemme qu'il a choisi. Observé :
// une phrase française parlant de « l'homme » pour un exercice dont la
// réponse était герой (héros) — мужчина et человек s'imposaient à la
// lecture, et étaient comptés faux.
//
// Le contrôle est volontairement lexical, pas sémantique : la traduction de
// la banque (« héros ») doit littéralement apparaître dans la phrase. C'est
// la banque qui fait foi pour le sens du mot, ici comme pour ses formes.

/**
 * Minuscules, sans diacritiques, apostrophes et traits d'union en espaces.
 * « œ » s'écrit « oe » : la décomposition ne le touche pas, et le découpage
 * en mots l'aurait pris pour un séparateur — « œil » devenait « il ».
 */
function normalizeFrench(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’\-]/g, " ");
}

/** Mots-outils : leur présence ne dit rien, leur absence non plus. */
const FRENCH_STOPWORDS = new Set([
  "de", "du", "des", "d", "le", "la", "les", "l", "un", "une", "a", "au", "aux", "en",
]);

export interface FrenchGuardInput {
  /** La phrase française produite par le modèle. */
  sentenceFr: unknown;
  /** La traduction du lemme, telle que la banque la donne. */
  translation: string;
}

/**
 * La phrase française nomme-t-elle bien le mot à deviner ?
 *
 * Une phrase qui a gardé son "___" est acceptée : le trou est comblé avec
 * la traduction de la banque (fillFrenchBlank), donc l'accord est garanti
 * par construction.
 *
 * Les précisions entre parenthèses de la banque (« bureau (pièce) ») ne sont
 * pas exigées — ce sont des désambiguïsations pour l'auteur, pas des mots à
 * écrire. Tout le reste l'est, y compris les traductions en plusieurs mots :
 * « jeune fille » sans « jeune » désignerait « дочь », pas « девушка ».
 */
export function validateFrenchSentence(input: FrenchGuardInput): GuardVerdict {
  const { sentenceFr, translation } = input;
  if (typeof sentenceFr !== "string" || !sentenceFr.trim()) {
    return { ok: false, reason: "traduction française vide" };
  }
  if (sentenceFr.includes(BLANK)) return { ok: true };

  const required = normalizeFrench(translation.replace(/\(.*?\)/g, " "))
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 2 && !FRENCH_STOPWORDS.has(word));
  if (required.length === 0) return { ok: true };

  const haystack = normalizeFrench(sentenceFr);
  for (const word of required) {
    // Pluriel français toléré (livre/livres, œil/yeux, cheval/chevaux) : c'est
    // le mot qu'on cherche, pas son nombre. Le pluriel vient de la même règle
    // que celle qui écrit les phrases (lib/grammar/french-article.ts).
    const plural = normalizeFrench(pluralizeWord(word));
    const alternatives = plural !== word ? `${word}(s|x)?|${plural}` : `${word}(s|x)?`;
    if (!new RegExp(`(^|[^a-z])(${alternatives})([^a-z]|$)`).test(haystack)) {
      return {
        ok: false,
        reason: `la traduction française ne contient pas « ${translation} » (le mot du trou)`,
      };
    }
  }
  return { ok: true };
}


// ─── Côté français : le GABARIT, pas la phrase remplie ──────────────
//
// Quand la phrase française est un gabarit à trou, `validateFrenchSentence`
// ne dit rien : elle rend `ok` dès qu'elle voit un « ___ », parce que le
// trou est ensuite comblé par la banque et que l'accord est garanti. C'est
// juste — et ça laissait le gabarit lui-même sans aucun contrôle.
//
// Ce que ça laissait passer, mesuré : « Travail travail travail. » Et, plus
// insidieux, un gabarit sans verbe (« Un morceau de ___. ») ou dont le trou
// tombe après « comme » alors que le déclencheur pose un démonstratif — ce
// qui donne « Il travaille comme ce juge ».

/** Le trou d'un gabarit français, et ce qui le précède. */
function frenchFrame(templateFr: string): { before: string; after: string } | null {
  const at = templateFr.indexOf(BLANK);
  if (at < 0) return null;
  return { before: templateFr.slice(0, at), after: templateFr.slice(at + BLANK.length) };
}

/**
 * Constructions françaises qui SUPPRIMENT le déterminant devant le nom.
 *
 * C'est la liste qui doit précéder le trou quand le déclencheur porte
 * `article: "none"` — « un verre de ___ », « il travaille comme ___ ». Elle
 * dit aussi l'inverse : après « comme » ou « devenir », un déclencheur qui
 * pose un démonstratif écrirait « devenir ce médecin ».
 */
const NO_DETERMINER_BEFORE = new Set([
  "de", "d", "des", "plusieurs", "comme", "devenir",
  // « Je m'appelle ___ » : le trou est un prénom, qui ne prend pas d'article.
  "appelle", "appelles", "appelons", "appelez", "appellent", "nomme", "nomment",
]);
/**
 * Celles-ci refusent le DÉMONSTRATIF, et lui seul : « il travaille comme
 * juge » et « il est considéré comme un héros » se disent tous les deux,
 * « comme ce héros » non — le démonstratif désigne alors quelqu'un de précis
 * au lieu d'attribuer une qualité.
 */
const REFUSES_DEMONSTRATIVE = new Set(["comme", "devenir"]);

/** Mots qu'un doublement n'accuse pas : « nous nous sommes… ». */
const DOUBLABLE = new Set(["nous", "vous"]);

/**
 * Déterminants qui ne peuvent pas précéder le trou quand le déclencheur en
 * pose un lui-même.
 *
 * Le gabarit n'écrit JAMAIS l'article du trou : c'est frenchNounPhrase qui
 * le pose, en accord avec le mode déclaré. Un gabarit qui l'écrit quand même
 * — « C'est un ___ » sur un déclencheur en `indefinite` — donne « C'est un
 * un livre ». Écrit par un modèle à la première tentative, invisible tant
 * qu'on ne remplit pas le trou.
 *
 * « de » et « d' » n'y sont pas : ce sont des prépositions, et « la voiture
 * de ce directeur » est exactement ce qu'on veut.
 */
const DETERMINERS_BEFORE_HOLE = new Set([
  "un", "une", "des", "du", "au", "aux", "le", "la", "les", "l",
  "ce", "cet", "cette", "ces", "mon", "ma", "mes", "ton", "ta", "tes",
  "son", "sa", "ses", "notre", "nos", "votre", "vos", "leur", "leurs",
  "quelques", "plusieurs", "chaque", "tout", "toute", "tous", "toutes",
]);

/**
 * Le verbe conjugué d'un gabarit français, cherché en deux temps.
 *
 * POURQUOI PAS UNE RÈGLE SEULE. Le français ne s'analyse pas sans
 * dictionnaire : « sorte », « lampe », « idée » finissent comme des verbes
 * du premier groupe. Une règle purement morphologique dirait donc qu'un
 * groupe nominal est une phrase — exactement ce qu'on veut refuser.
 *
 * POURQUOI PAS UNE LISTE SEULE. Elle devrait porter chaque personne de
 * chaque verbe : « pratique » y était, « pratiquons » non, et un gabarit
 * juste était rejeté.
 *
 * Donc : une liste de RADICAUX du premier groupe, conjugués par la règle
 * (elle, au moins, est vraie), et une liste de FORMES pour les auxiliaires
 * et les irréguliers, que rien ne régularise. Les deux sont de la donnée, et
 * check:grammar vérifie qu'elles couvrent les 136 gabarits écrits à la
 * main : elles ne peuvent pas pourrir en silence. Un gabarit qui emploie un
 * verbe absent d'ici est refusé, et c'est le comportement voulu — soit le
 * verbe entre dans la liste, décision prise et visible, soit le gabarit est
 * réécrit.
 */
const FRENCH_VERB_STEMS = [
  "achet", "admir", "aid", "aim", "ajout", "allum", "amen", "appell", "apport", "approch",
  "arrang", "arret", "arriv", "assist", "attend", "attrap", "avanc", "bais",
  "bavard", "brill", "brul", "cass", "caus", "cherch", "chang", "chant", "charg",
  "cherch", "class", "commenc", "compt", "concern", "conseill", "consider",
  "constitu", "continu", "coup", "cout", "cri", "cuisin", "danc", "demand",
  "demenag", "depens", "derang", "dessin", "detest", "devin", "dirig", "discut",
  "donn", "dur", "echang", "ecout", "emprunt", "emmen", "employ", "envi",
  "envoi", "epous", "essai", "etudi", "evit", "exig", "expliqu", "ferm", "gagn",
  "gard", "gout", "guid", "habit", "hesit", "ignor", "imagin", "import", "inform",
  "inquiet", "install", "interess", "invit", "jou", "juge", "laiss", "lav",
  "lev", "livr", "lou", "maitris", "manqu", "mang", "march", "menac", "mentionn",
  "mont", "montr", "nag", "nettoi", "not", "occup", "organis", "oubli", "parl",
  "partag", "pass", "pay", "pens", "photographi", "plaisant", "port", "poss",
  "pous", "pratiqu", "prefer", "prepar", "present", "prom", "promen", "propos",
  "prot", "quitt", "racont", "ramass", "rappell", "regard", "regrett", "remerci",
  "rencontr", "rentr", "renvoi", "repar", "repet", "repos", "resist", "rest",
  "retourn", "retrouv", "rev", "risqu", "sembl", "sign", "soign", "souhait",
  "surveill", "telephon", "termin", "tir", "tomb", "touch", "tourn", "travaill",
  "travers", "trouv", "utilis", "vend", "verifi", "vis", "visit", "vol", "voyag",
];

/** Terminaisons du premier groupe, aux temps qu'un gabarit emploie. */
const GROUP_ONE = new RegExp(
  `^(${FRENCH_VERB_STEMS.join("|")})` +
    "(e|es|ent|ons|ez|eons|eais|eait|eaient|ais|ait|aient|ai|as|a|" +
    "erai|eras|era|erons|erez|eront|erais|erait|eraient|ee|ees|e)$"
);

/** Ce que la règle ne régularise pas : auxiliaires, deuxième et troisième groupes. */
const FRENCH_FINITE_FORMS = new Set([
  // auxiliaires et modaux
  "est", "sont", "es", "suis", "sommes", "etes", "a", "as", "ai", "avons", "avez", "ont",
  "sera", "serai", "etait", "etaient", "avait", "avaient", "aie", "soit", "ete", "eu",
  "vais", "vas", "va", "allons", "allez", "vont", "irai", "iras", "ira", "irons",
  "veux", "veut", "voulons", "voulez", "veulent", "voudrais",
  "peux", "peut", "pouvons", "pouvez", "peuvent", "dois", "doit", "devons", "doivent",
  "fais", "fait", "faisons", "faites", "font", "sais", "sait", "savons", "savent",
  "faut", "y",
  // troisième groupe, aux personnes qu'un gabarit emploie
  "bois", "boit", "buvons", "buvez", "boivent", "bu",
  "connais", "connait", "connaissons", "connaissent", "connu",
  "comprends", "comprend", "comprenons", "comprennent", "compris",
  "crois", "croit", "croyons", "croient", "cru",
  "dis", "dit", "disons", "disent", "dors", "dort", "dormons", "dorment", "dormi",
  "ecris", "ecrit", "ecrivons", "ecrivent", "ecrit",
  "lis", "lit", "lisons", "lisent", "lu",
  "mets", "met", "mettons", "mettent", "mis",
  "ouvre", "ouvrons", "ouvrent", "ouvert", "offre", "offrons", "offert",
  "prends", "prend", "prenons", "prenez", "prennent", "pris",
  "recois", "recoit", "recevons", "recoivent", "recu",
  "reponds", "repond", "repondons", "repondent", "repondu",
  "sens", "sent", "sentons", "sentent", "senti",
  "sers", "sert", "servons", "servent", "servi",
  "sors", "sort", "sortons", "sortent", "sorti", "sortis", "sortie",
  "suit", "suis", "suivons", "suivent", "suivi",
  "tiens", "tient", "tenons", "tiennent", "tenu",
  "viens", "vient", "venons", "viennent", "venu", "venue", "venus", "viendrai",
  "vis", "vit", "vivons", "vivent", "vecu", "vivre",
  "vois", "voit", "voyons", "voyez", "voient", "vu",
  "attends", "attend", "attendons", "attendent", "attendu",
  "entends", "entend", "entendons", "entendent", "entendu",
  "perds", "perd", "perdons", "perdent", "perdu",
  "plait", "plaisent", "plu", "appartient", "appartiennent",
  "cours", "court", "courons", "courent", "couru", "couraient",
  "obeis", "obeit", "obeissons", "obeissez", "obeissent", "obei",
  "applaudis", "applaudit", "applaudissons", "applaudissent",
  "finis", "finit", "finissons", "finissent", "fini",
  "choisis", "choisit", "choisissons", "choisissent",
  "reussis", "reussit", "reussissons", "reussissent",
  "rejouis", "rejouit", "rejouissons", "rejouissent",
  "compatis", "compatit", "compatissons", "compatissent",
  "souviens", "souvient", "souvenons", "souviennent",
  "assis", "atteint", "atteignons", "atteignent", "suspendu", "suspendue",
  "arrive", "arrives", "arrivee", "tu", "etre", "aller",
]);

/**
 * Tournures sans verbe qu'une phrase française admet quand même : « Voici
 * ___ », « Merci pour ___ ». Elles sont peu nombreuses et fermées — les
 * accepter au titre du verbe reviendrait à dire qu'un groupe nominal en est
 * un.
 */
const FRENCH_PRESENTATIVES = new Set(["voici", "voila", "merci"]);

function isFinite_(word: string): boolean {
  return FRENCH_FINITE_FORMS.has(word) || GROUP_ONE.test(word);
}

export interface FrenchTemplateInput {
  /** Le gabarit français, trou compris. */
  templateFr: unknown;
  /** L'article que le déclencheur posera dans le trou. */
  article: ArticleMode;
}

/** Le gabarit français tient-il debout ? Voir le commentaire ci-dessus. */
export function validateFrenchTemplate(input: FrenchTemplateInput): GuardVerdict {
  const { templateFr, article } = input;
  if (typeof templateFr !== "string" || !templateFr.trim()) {
    return { ok: false, reason: "gabarit français vide" };
  }
  const holes = templateFr.split(BLANK).length - 1;
  if (holes !== 1) return { ok: false, reason: `${holes} trou(s) au lieu d'un seul` };
  if (/[а-яё]/i.test(templateFr)) return { ok: false, reason: "du cyrillique dans le français" };
  if (!/[.!?]["»]?\s*$/.test(templateFr)) {
    return { ok: false, reason: "le gabarit ne finit pas comme une phrase" };
  }

  const frame = frenchFrame(templateFr)!;
  if (/[a-zà-ÿ]$/i.test(frame.before.trimEnd()) && !frame.before.endsWith(" ")) {
    return { ok: false, reason: "le trou est collé au mot qui précède" };
  }
  if (/^[a-zà-ÿ]/i.test(frame.after)) {
    return { ok: false, reason: "le trou est collé au mot qui suit" };
  }

  const words = normalizeFrench(templateFr.replace(BLANK, " ")).split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) {
    return { ok: false, reason: "le gabarit n'est qu'un trou" };
  }
  // « Nous nous sommes promenés » : le pronom réfléchi double légitimement le
  // sujet. Ailleurs, un mot plein répété colle à « Travail travail travail. »
  for (let i = 1; i < words.length; i += 1) {
    if (words[i] === words[i - 1] && words[i].length >= 4 && !DOUBLABLE.has(words[i])) {
      return { ok: false, reason: `« ${words[i]} » répété deux fois de suite` };
    }
  }
  if (!words.some((w) => isFinite_(w) || FRENCH_PRESENTATIVES.has(w))) {
    return {
      ok: false,
      reason: "aucun verbe conjugué reconnu — groupe nominal, ou verbe à ajouter à la liste",
    };
  }

  // ── Le déterminant devant le trou ──
  const beforeWords = normalizeFrench(frame.before).split(/[^a-z0-9]+/).filter(Boolean);
  const last = beforeWords[beforeWords.length - 1] ?? "";
  if (REFUSES_DEMONSTRATIVE.has(last) && article === "demonstrative") {
    return {
      ok: false,
      reason: `« ${last} ___ » attribue une qualité, le démonstratif y désignerait quelqu'un`,
    };
  }
  if (article === "none") {
    if (beforeWords.length > 0 && !NO_DETERMINER_BEFORE.has(last)) {
      return {
        ok: false,
        reason: `le déclencheur ne pose aucun déterminant, et « ${last} ___ » en demande un`,
      };
    }
  } else if (DETERMINERS_BEFORE_HOLE.has(last)) {
    return {
      ok: false,
      reason: `« ${last} » est déjà un déterminant, le déclencheur en poserait un second`,
    };
  }
  return { ok: true };
}
