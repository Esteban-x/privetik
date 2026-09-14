import { CASE_ORDER, CaseId, DeclensionResult, Noun } from "./types";

/**
 * Deux responsabilités, volontairement séparées :
 *
 * 1. LA FORME est lue dans le paradigme du mot (`noun.forms`), importé du
 *    dictionnaire OpenRussian et vérifié (voir scripts/build-nouns.mjs).
 *    Le module affiche cette forme comme "la bonne réponse" : elle ne peut
 *    pas être le produit d'une règle approximative.
 *
 * 2. LA RÈGLE est calculée ici, par un moteur déterministe. Mesuré sur les
 *    17 800 noms du dictionnaire, ce moteur retombe sur la bonne forme dans
 *    ~76 % des cas : assez pour EXPLIQUER une terminaison, pas assez pour la
 *    produire. Ce qui lui échappe — voyelle mobile (оте́ц -> отца́), schéma
 *    accentuel (врачо́м vs ме́сяцем), pluriels supplétifs (челове́к -> лю́ди)
 *    — n'est pas dérivable de l'orthographe du lemme, par nature.
 *
 * Quand les deux divergent, `isIrregular` passe à vrai et le libellé
 * explique de quel genre d'écart il s'agit, au lieu d'énoncer une règle que
 * la forme affichée contredit.
 */

// ─── Les deux règles d'orthographe russes, à ne pas confondre ──────
//
// Règle des 7 lettres : jamais ы après г к х ж ч ш щ (-> и). Le ц N'EN FAIT
// PAS PARTIE : отцы, улицы, jamais "отци"/"улици".
const SEVEN_LETTERS = ["г", "к", "х", "ж", "ч", "ш", "щ"];
// Chuintantes + ц : imposent (a) о non accentué -> е et (b) l'impossibilité
// d'écrire я/ю après elles (-> а/у : се́рдце -> се́рдца, ночь -> ноча́м).
// г к х n'en font PAS partie : c'est cette confusion qui produisait
// "мальчикей" au génitif pluriel.
const SIBILANTS_AND_TS = ["ж", "ч", "ш", "щ", "ц"];
const SIBILANTS = ["ж", "ч", "ш", "щ"];

const ACCENT = /́/g;
const VOWELS = "аеёиоуыэюя";

/** Retire l'accent tonique combinant : "рабо́та" -> "работа". */
export function stripAccent(form: string): string {
  return form.replace(ACCENT, "");
}

function countVowels(form: string): number {
  return [...stripAccent(form)].filter((c) => VOWELS.includes(c)).length;
}

/**
 * Rang de la voyelle accentuée (1 = la première), 0 si la forme n'en marque
 * aucune. Le ё porte toujours l'accent en russe et n'est donc jamais marqué :
 * il compte pour lui-même.
 */
function stressedVowelRank(accented: string): number {
  let rank = 0;
  let seen = 0;
  const chars = [...accented];
  for (let i = 0; i < chars.length; i += 1) {
    const c = chars[i];
    if (!VOWELS.includes(c)) continue;
    seen += 1;
    if (c === "ё" || chars[i + 1] === "́") rank = seen;
  }
  // Monosyllabe : l'accent n'est pas marqué, mais il n'y a qu'un endroit où
  // il puisse tomber.
  if (rank === 0 && seen === 1) return 1;
  return rank;
}

/**
 * L'accent tombe-t-il sur la DÉSINENCE plutôt que sur le radical ?
 *
 * POURQUOI CETTE QUESTION DÉCIDE DE L'ORTHOGRAPHE. Deux règles russes ne
 * dépendent que d'elle :
 *
 *   après un radical mou     désinence accentuée -> ё   (королём, судьёй)
 *                            désinence atone     -> е   (учителем, тётей)
 *   après une chuintante/ц   désinence accentuée -> о   (врачо́м, душо́й)
 *                            désinence atone     -> е   (ме́сяцем, ка́шей)
 *
 * Le moteur ne les connaissait pas. Il rendait toujours la variante atone,
 * donc « судьей » là où la langue écrit « судьёй » — et comme sa prédiction
 * ne retombait pas sur la forme du dictionnaire, il annonçait à l'apprenant
 * « forme irrégulière : à mémoriser telle quelle ». La forme affichée était
 * juste ; l'explication en dessous était fausse, et fausse sur une forme
 * parfaitement régulière.
 *
 * LIRE L'ACCENT DANS LE PARADIGME N'EST PAS TRICHER. Le schéma accentuel
 * n'est pas dérivable de l'orthographe du lemme — c'est une donnée du mot,
 * au même titre que sa voyelle mobile. Le moteur la lit, comme une grammaire
 * la donne, puis applique une règle qui, elle, est bien une règle. Ce qu'il
 * continue de ne pas savoir, il continue de le signaler.
 */
function endingIsStressed(accented: string): boolean {
  const rank = stressedVowelRank(accented);
  if (rank === 0) return false;
  // On teste que la DERNIÈRE voyelle porte l'accent, plutôt que de compter
  // les voyelles du radical. Toutes les désinences que cette question
  // départage n'ont qu'une voyelle (-ем/-ом/-ём, -ей/-ой/-ёй, -ев/-ов/-ёв),
  // donc « dernière voyelle accentuée » et « désinence accentuée » sont la
  // même chose — et compter le radical se trompait dès qu'une voyelle
  // mobile le raccourcissait : оте́ц a deux voyelles, отцо́м n'en garde
  // qu'une avant la désinence, et le moteur concluait « atone » sur une
  // désinence qui porte l'accent.
  return rank === countVowels(accented);
}

function lastChar(str: string) {
  return str[str.length - 1];
}

/** Règle des 7 lettres : ы -> и après г к х ж ч ш щ. */
function spellY(stemLastLetter: string, wanted: "ы" | "и"): "ы" | "и" {
  if (wanted === "ы" && SEVEN_LETTERS.includes(stemLastLetter)) return "и";
  return wanted;
}

/**
 * Interdiction orthographique de я/ю après une chuintante ou ц : la
 * désinence molle s'écrit avec la voyelle dure correspondante. Ne touche que
 * la voyelle initiale — "ью" (но́чью) commence par ь et reste intact.
 */
function hardenSoftVowel(stemLastLetter: string, ending: string): string {
  if (!SIBILANTS_AND_TS.includes(stemLastLetter)) return ending;
  if (ending.startsWith("я")) return "а" + ending.slice(1);
  if (ending.startsWith("ю")) return "у" + ending.slice(1);
  return ending;
}

// ─── Classe de déclinaison ─────────────────────────────────────────
//
// Déterminée par la TERMINAISON, jamais par le genre seul : "па́па" est
// masculin mais se décline exactement comme "кни́га". Brancher sur le genre
// produisait "папаа/папау/папаом".
type DeclensionClass = "first" | "second" | "third";

function declensionClass(noun: Noun): DeclensionClass {
  const last = lastChar(noun.lemma);
  if ((last === "а" || last === "я") && noun.gender !== "neuter") return "second";
  if (noun.gender === "feminine" && last === "ь") return "third";
  return "first";
}

interface StemInfo {
  stem: string;
  lastStemLetter: string;
  isSoft: boolean;
}

function getStem(noun: Noun): StemInfo {
  const lemma = noun.lemma;
  const last = lastChar(lemma);
  let stem: string;
  let isSoft: boolean;

  if (last === "а" || last === "о") {
    stem = lemma.slice(0, -1);
    isSoft = false;
  } else if (last === "я" || last === "е" || last === "ё" || last === "ь" || last === "й") {
    stem = lemma.slice(0, -1);
    isSoft = true;
  } else {
    stem = lemma; // terminaison consonantique
    isSoft = false;
  }
  return { stem, lastStemLetter: lastChar(stem), isSoft };
}

/** Forme prédite par la règle, avec la désinence qu'elle ajoute au radical. */
interface RuleResult {
  form: string;
  ending: string;
  rule: string;
}

const dictionaryForm = (noun: Noun): RuleResult => ({
  form: noun.lemma,
  ending: "",
  rule: "forme du dictionnaire",
});

// ─── Singulier ─────────────────────────────────────────────────────

function firstSingular(noun: Noun, c: CaseId, s: StemInfo, stressed: boolean): RuleResult {
  const { stem, lastStemLetter, isSoft } = s;
  const label = noun.gender === "neuter" ? "neutre" : "masc.";
  const build = (ending: string, rule: string): RuleResult => ({ form: stem + ending, ending, rule });

  switch (c) {
    case "nominative":
      return dictionaryForm(noun);
    case "genitive": {
      const e = hardenSoftVowel(lastStemLetter, isSoft ? "я" : "а");
      return build(e, `${label} : génitif -${e}`);
    }
    case "dative": {
      const e = hardenSoftVowel(lastStemLetter, isSoft ? "ю" : "у");
      return build(e, `${label} : datif -${e}`);
    }
    case "accusative": {
      if (noun.gender === "neuter") {
        return { form: noun.lemma, ending: "", rule: "neutre : accusatif = nominatif" };
      }
      if (noun.animacy === "animate") {
        const e = hardenSoftVowel(lastStemLetter, isSoft ? "я" : "а");
        return build(e, "masc. animé : accusatif = génitif");
      }
      return { form: noun.lemma, ending: "", rule: "masc. inanimé : accusatif = nominatif" };
    }
    case "instrumental": {
      // о/ё/е selon que la désinence porte l'accent : королём vs учителем,
      // врачо́м vs ме́сяцем. Voir endingIsStressed.
      const e = isSoft
        ? stressed
          ? "ём"
          : "ем"
        : SIBILANTS_AND_TS.includes(lastStemLetter)
          ? stressed
            ? "ом"
            : "ем"
          : "ом";
      return build(e, `${label} : instrumental -${e}${stressed ? " (désinence accentuée)" : ""}`);
    }
    case "prepositional": {
      // Radical en -и (-ий / -ие : санато́рий, зда́ние) : -ии, jamais "-ие".
      const e = isSoft && stem.endsWith("и") ? "и" : "е";
      return build(e, `${label} : prépositionnel -${e}`);
    }
  }
}

function secondSingular(noun: Noun, c: CaseId, s: StemInfo, stressed: boolean): RuleResult {
  const { stem, lastStemLetter, isSoft } = s;
  const build = (ending: string, rule: string): RuleResult => ({ form: stem + ending, ending, rule });

  switch (c) {
    case "nominative":
      return dictionaryForm(noun);
    case "genitive": {
      const e = isSoft ? "и" : spellY(lastStemLetter, "ы");
      return build(e, `2e déclinaison (-а/-я) : génitif -${e}`);
    }
    case "dative":
    case "prepositional": {
      // Radical en -и (-ия : фами́лия) : datif/prépositionnel en -ии.
      const e = isSoft && stem.endsWith("и") ? "и" : "е";
      return build(e, `2e déclinaison : datif/prépositionnel -${e}`);
    }
    case "accusative": {
      const e = hardenSoftVowel(lastStemLetter, isSoft ? "ю" : "у");
      return build(e, `2e déclinaison : accusatif -${e}`);
    }
    case "instrumental": {
      // Même partage qu'au masculin : семьёй / тётей, душо́й / ка́шей.
      const e = isSoft
        ? stressed
          ? "ёй"
          : "ей"
        : SIBILANTS_AND_TS.includes(lastStemLetter)
          ? stressed
            ? "ой"
            : "ей"
          : "ой";
      return build(
        e,
        `2e déclinaison : instrumental -${e}${stressed ? " (désinence accentuée)" : ""}`
      );
    }
  }
}

function thirdSingular(noun: Noun, c: CaseId, s: StemInfo): RuleResult {
  const build = (ending: string, rule: string): RuleResult => ({ form: s.stem + ending, ending, rule });
  switch (c) {
    case "nominative":
      return { form: noun.lemma, ending: "", rule: "forme du dictionnaire (3e déclinaison, -ь)" };
    case "genitive":
    case "dative":
    case "prepositional":
      return build("и", "3e déclinaison fém. (-ь) : génitif/datif/prép. -и");
    case "accusative":
      return { form: noun.lemma, ending: "", rule: "3e déclinaison fém. : accusatif = nominatif" };
    case "instrumental":
      return build("ью", "3e déclinaison fém. : instrumental -ью");
  }
}

// ─── Pluriel ───────────────────────────────────────────────────────

/**
 * Le radical du PLURIEL, lu sur le nominatif pluriel du paradigme.
 *
 * POURQUOI ON NE PART PAS DU LEMME. Le nominatif pluriel russe n'est pas
 * dérivable : брат → бра́тья, дом → дома́, челове́к → лю́ди, друг → друзья́.
 * Mais UNE FOIS CONNU, tout le reste du pluriel en découle régulièrement —
 * бра́тьям, бра́тьями, бра́тьях sont les désinences ordinaires du radical
 * mou « брать ». Le moteur partait du lemme et prédisait « братам »,
 * « братами », « братах » : trois formes fausses, donc trois fois
 * « forme irrégulière : à mémoriser telle quelle » sur un paradigme qui,
 * à partir de son nominatif pluriel, ne l'est pas du tout.
 *
 * Ce que l'apprenant doit mémoriser, c'est бра́тья. Le reste, il peut le
 * déduire — et c'est exactement ce que le module doit lui dire.
 *
 * LA MOLLESSE SE LIT SUR LA DÉSINENCE, avec une réserve. -я et -и marquent
 * un radical mou (учителя́, лю́ди), -а et -ы un radical dur (дома́, столы́).
 * Sauf après г к х ж ч ш щ, où -и est imposé par la règle des 7 lettres et
 * ne dit rien de la mollesse : кни́ги et врачи́ sont durs, d'où кни́гам et
 * врача́м, jamais « книгям ».
 */
interface PluralStem {
  stem: string;
  isSoft: boolean;
}

function getPluralStem(noun: Noun): PluralStem {
  const nominativePl = stripAccent(noun.forms.plural[0]);
  const last = lastChar(nominativePl);
  if (!"аяыи".includes(last)) {
    // Pas de voyelle finale (génitif pluriel à désinence zéro servi comme
    // nominatif, cas tordus) : on ne sait pas découper, on rend tel quel.
    return { stem: nominativePl, isSoft: false };
  }
  const stem = nominativePl.slice(0, -1);
  if (last === "я") return { stem, isSoft: true };
  if (last === "а" || last === "ы") return { stem, isSoft: false };
  // -и : mou, sauf si la règle des 7 lettres l'a imposé.
  return { stem, isSoft: !SEVEN_LETTERS.includes(lastChar(stem)) };
}

function nominativePlural(noun: Noun, s: StemInfo): RuleResult {
  const { stem, lastStemLetter, isSoft } = s;
  const cls = declensionClass(noun);
  const build = (ending: string, rule: string): RuleResult => ({ form: stem + ending, ending, rule });

  if (cls === "third") return build("и", "3e déclinaison : nominatif pluriel -и");
  if (cls === "second" || noun.gender !== "neuter") {
    const e = isSoft ? "и" : spellY(lastStemLetter, "ы");
    return build(e, `nominatif pluriel -${e}`);
  }
  const e = hardenSoftVowel(lastStemLetter, isSoft ? "я" : "а");
  return build(e, `neutre : nominatif pluriel -${e}`);
}

function genitivePlural(noun: Noun, s: StemInfo, stressed: boolean): RuleResult {
  const { stem, lastStemLetter, isSoft } = s;
  const cls = declensionClass(noun);
  const build = (ending: string, rule: string): RuleResult => ({ form: stem + ending, ending, rule });

  if (cls === "third") return build("ей", "3e déclinaison (-ь) : génitif pluriel -ей");

  // LES PLURIELS EN -ЬЯ, quel que soit le genre du lemme. брат → бра́тья →
  // бра́тьев, mais aussi де́рево → дере́вья → дере́вьев : le neutre passe dans
  // cette classe par son pluriel, pas par son lemme. On exclut les mots
  // dont le lemme est DÉJÀ mou (пече́нье, пла́тье, семья́) : ceux-là ont leur
  // propre règle plus bas.
  {
    const pl = getPluralStem(noun);
    if (pl.stem.endsWith("ь") && !stem.endsWith("ь")) {
      const before = pl.stem[pl.stem.length - 2];
      const e = SIBILANTS.includes(before) ? "ей" : "ев";
      return {
        form: pl.stem + e,
        ending: e,
        rule: `pluriel en -ья : génitif pluriel -${e}`,
      };
    }
  }

  if (cls === "first" && noun.gender !== "neuter") {
    // LE RADICAL EST CELUI DU PLURIEL, pas celui du lemme. брат fait
    // бра́тья, donc бра́тьев : partir de « брат » donnait « братов ». Même
    // histoire pour стул → сту́лья → сту́льев et де́рево → дере́вья →
    // дере́вьев. C'est un pluriel en -ья complet, parfaitement régulier une
    // fois son nominatif connu, et le moteur l'annonçait irrégulier trois
    // fois par mot.
    const pl = getPluralStem(noun);
    const plLast = lastChar(pl.stem);
    const build2 = (ending: string, rule: string): RuleResult => ({
      form: pl.stem + ending,
      ending,
      rule,
    });

    if (plLast === "ь") {
      // -ья : la chuintante devant le ь impose -ей (мужья́ → муже́й),
      // sinon -ев (бра́тья → бра́тьев).
      const before = pl.stem[pl.stem.length - 2];
      return SIBILANTS.includes(before)
        ? build2("ей", "pluriel en -ья, radical en chuintante : génitif pluriel -ей")
        : build2("ев", "pluriel en -ья : génitif pluriel -ев");
    }
    // -й (semi-voyelle : музе́й, геро́й) : -ев, ou -ёв si la désinence porte
    // l'accent (чай → чаёв, край → краёв). Le radical se lit ici sur le
    // LEMME : le nominatif pluriel « геро́и » a déjà mangé le й.
    if (lastChar(noun.lemma) === "й") {
      const e = stressed ? "ёв" : "ев";
      return build(e, `masc. en -й : génitif pluriel -${e}`);
    }
    if (SIBILANTS.includes(plLast)) return build2("ей", "masc. en chuintante : génitif pluriel -ей");
    // ц suit la même règle que les chuintantes : -ов sous l'accent
    // (конц-о́в), -ев ailleurs (ме́сяц-ев).
    if (lastStemLetter === "ц") {
      const e = stressed ? "ов" : "ев";
      return build(e, `masc. en ц : génitif pluriel -${e}${stressed ? " (désinence accentuée)" : ""}`);
    }
    if (pl.isSoft) return build2("ей", "masc. mou (-ь) : génitif pluriel -ей");
    return build2("ов", "masc. dur : génitif pluriel -ов");
  }
  // Radical terminé par une VOYELLE (-ия, -ея, -ие) : -й. C'était restreint
  // au seul -и, ce qui laissait de côté иде́я → иде́й et змея́ → змей — la
  // même règle, sur la même classe.
  if (isSoft && VOWELS.includes(lastStemLetter)) {
    return build("й", "radical terminé par une voyelle (-ия/-ея/-ие) : génitif pluriel -й");
  }

  // LES MOTS EN -ЬЯ ET -ЬЕ. Le radical se termine par un signe mou, qui
  // tombe devant la désinence : статья́ → стате́й, семья́ → семе́й, судья́ →
  // суде́й ; пече́нье → пече́ний, воскресе́нье → воскресе́ний. Le moteur
  // appliquait la désinence zéro (« статьь », « семьь ») et concluait à
  // l'irrégularité sur une classe entière, régulière et nombreuse.
  if (stem.endsWith("ь")) {
    const bare = stem.slice(0, -1);
    if (cls === "second") {
      return { form: bare + "ей", ending: "ей", rule: "mot en -ья : génitif pluriel -ей" };
    }
    if (noun.gender === "neuter") {
      return { form: bare + "ий", ending: "ий", rule: "neutre en -ье : génitif pluriel -ий" };
    }
  }

  if (noun.gender === "neuter" && isSoft) return build("ей", "neutre mou (-е) : génitif pluriel -ей");
  if (cls === "second" && isSoft) return build("ь", "2e déclinaison molle (-я) : génitif pluriel -ь");
  // Désinence zéro : le mot se réduit à son radical — celui du PLURIEL.
  // жена́ fait жёны, donc жён ; partir du lemme donnait « жен », juste aux
  // lettres près et faux à l'oral.
  return { form: getPluralStem(noun).stem, ending: "", rule: "génitif pluriel Ø (terminaison zéro)" };
}

function decliningPlural(noun: Noun, c: CaseId, s: StemInfo, stressed: boolean): RuleResult {
  switch (c) {
    case "nominative":
      return nominativePlural(noun, s);
    case "genitive":
      return genitivePlural(noun, s, stressed);
    case "dative":
    case "instrumental":
    case "prepositional": {
      // Datif, instrumental et prépositionnel pluriels sont les trois cases
      // les plus régulières de tout le système : une désinence, deux
      // variantes, aucune exception hors les quelques -ьми (людьми́,
      // детьми́, дверьми́). Encore faut-il partir du bon radical.
      const { stem, isSoft } = getPluralStem(noun);
      const endings =
        c === "dative"
          ? (["ям", "ам"] as const)
          : c === "instrumental"
            ? (["ями", "ами"] as const)
            : (["ях", "ах"] as const);
      const e = isSoft ? endings[0] : endings[1];
      const label =
        c === "dative" ? "datif" : c === "instrumental" ? "instrumental" : "prépositionnel";
      return {
        form: stem + e,
        ending: e,
        rule: `pluriel (tous genres) : ${label} -${e}`,
      };
    }
    case "accusative": {
      // « Animé = génitif, inanimé = nominatif » est LA règle de
      // l'accusatif pluriel, et elle se dit sur des formes que le paradigme
      // donne. La reconstruire depuis le lemme n'ajoutait rien : elle
      // héritait des erreurs du nominatif et du génitif pluriels, et un
      // apprenant lisait « forme irrégulière » sous une forme dont la règle
      // est la plus simple du tableau.
      const source = noun.animacy === "animate" ? 1 : 0;
      const form = stripAccent(noun.forms.plural[source]);
      return {
        form,
        ending: "",
        rule:
          noun.animacy === "animate"
            ? "pluriel animé : accusatif = génitif pluriel"
            : "pluriel inanimé : accusatif = nominatif pluriel",
      };
    }
  }
}

/**
 * Les neutres en -мя : вре́мя, и́мя, зна́мя, пле́мя…
 *
 * Classe fermée d'une dizaine de mots, et parfaitement régulière À
 * L'INTÉRIEUR d'elle-même : un -ен- s'intercale à tous les cas obliques
 * (вре́мени, вре́менем, времена́, времён). Le moteur la traitait comme un
 * neutre mou ordinaire et se trompait sur huit cases sur douze, en disant
 * « à mémoriser telle quelle » — alors qu'il y a une règle, qu'elle tient en
 * une ligne, et que c'est celle qu'un manuel enseigne.
 */
function heteroclitic(noun: Noun, c: CaseId, plural: boolean): RuleResult | undefined {
  if (noun.gender !== "neuter" || !noun.lemma.endsWith("мя")) return undefined;
  const stem = noun.lemma.slice(0, -1); // "время" -> "врем"
  const label = "neutre en -мя (-ен- à tous les cas obliques)";
  if (!plural) {
    if (c === "nominative" || c === "accusative") {
      return { form: noun.lemma, ending: "", rule: `${label} : nominatif = accusatif` };
    }
    if (c === "instrumental") {
      return { form: `${stem}енем`, ending: "енем", rule: `${label} : instrumental -енем` };
    }
    return { form: `${stem}ени`, ending: "ени", rule: `${label} : génitif/datif/prép. -ени` };
  }
  if (c === "nominative" || c === "accusative") {
    return { form: `${stem}ена`, ending: "ена", rule: `${label} : nominatif pluriel -ена́` };
  }
  if (c === "genitive") {
    return { form: `${stem}ён`, ending: "ён", rule: `${label} : génitif pluriel -ён` };
  }
  return undefined; // datif/instr/prép. pluriels : la règle générale suffit
}

/**
 * Les noms qui se déclinent comme des ADJECTIFS.
 *
 * живо́тное (animal), моро́женое (glace), столо́вая (cantine), учёный
 * (savant) : ce sont d'anciens adjectifs substantivés, et ils ont gardé la
 * déclinaison adjectivale entière — живо́тного, живо́тному, живо́тным, et non
 * « животноа », « животному » par hasard.
 *
 * ON LE RECONNAÎT AU PARADIGME, pas au lemme. Une finale en -ое ou -ий ne
 * suffit pas : мо́ре et ге́ний s'y terminent aussi et se déclinent
 * normalement. Le génitif singulier en -ого / -его, lui, est la définition
 * même de cette déclinaison — aucun nom ordinaire ne le prend.
 *
 * Le moteur les traitait comme des neutres mous et se trompait sur neuf
 * cases sur douze.
 */
function adjectivalNoun(noun: Noun, c: CaseId, plural: boolean): RuleResult | undefined {
  const genitiveSg = stripAccent(noun.forms.singular[1]);
  if (!genitiveSg.endsWith("ого") && !genitiveSg.endsWith("его")) return undefined;

  const stem = noun.lemma.slice(0, -2);
  const soft = genitiveSg.endsWith("его");
  // Règle des 7 lettres : jamais ы après г к х ж ч ш щ.
  const y = SEVEN_LETTERS.includes(lastChar(stem)) ? "и" : "ы";
  const label = "nom à déclinaison adjectivale (живо́тное, моро́женое)";

  const table: Record<CaseId, string> = plural
    ? {
        nominative: soft ? "ие" : `${y}е`,
        genitive: soft ? "их" : `${y}х`,
        dative: soft ? "им" : `${y}м`,
        accusative: "",
        instrumental: soft ? "ими" : `${y}ми`,
        prepositional: soft ? "их" : `${y}х`,
      }
    : noun.gender === "feminine"
      ? {
          nominative: soft ? "яя" : "ая",
          genitive: soft ? "ей" : "ой",
          dative: soft ? "ей" : "ой",
          accusative: soft ? "юю" : "ую",
          instrumental: soft ? "ей" : "ой",
          prepositional: soft ? "ей" : "ой",
        }
      : {
          nominative: noun.gender === "neuter" ? (soft ? "ее" : "ое") : soft ? "ий" : `${y}й`,
          genitive: soft ? "его" : "ого",
          dative: soft ? "ему" : "ому",
          accusative: "",
          instrumental: soft ? "им" : `${y}м`,
          prepositional: soft ? "ем" : "ом",
        };

  if (c === "accusative" && table.accusative === "") {
    // L'animacité ne touche PAS le neutre singulier : живо́тное est animé et
    // fait pourtant « я ви́жу живо́тное ». La règle « animé = génitif » ne
    // vaut qu'au masculin singulier et à tous les pluriels — c'est aussi ce
    // que dit firstSingular pour les noms ordinaires.
    const animateAccusative = noun.gender === "masculine" && noun.animacy === "animate";
    const from: CaseId = plural
      ? noun.animacy === "animate"
        ? "genitive"
        : "nominative"
      : animateAccusative
        ? "genitive"
        : "nominative";
    const e = table[from];
    return {
      form: stem + e,
      ending: e,
      rule: `${label} : accusatif = ${from === "genitive" ? "génitif" : "nominatif"}`,
    };
  }
  const ending = table[c];
  return { form: stem + ending, ending, rule: `${label} : -${ending}` };
}

/**
 * путь : le seul masculin de la 3e déclinaison.
 *
 * Les grammaires le présentent ainsi, mot pour mot — il prend les
 * désinences féminines en -ь aux cas obliques du singulier (пути́) et garde
 * l'instrumental masculin (путём). Une exception d'UN mot, mais que tout
 * manuel nomme : la nommer vaut mieux que dire « à mémoriser telle quelle »
 * trois fois de suite.
 */
function pathNoun(noun: Noun, c: CaseId, plural: boolean): RuleResult | undefined {
  if (noun.lemma !== "путь" || plural) return undefined;
  const label = "путь : seul masculin de la 3e déclinaison";
  if (c === "nominative" || c === "accusative") {
    return { form: "путь", ending: "", rule: `${label} : nominatif = accusatif` };
  }
  if (c === "instrumental") {
    return { form: "путём", ending: "ём", rule: `${label} : instrumental masculin -ём` };
  }
  return { form: "пути", ending: "и", rule: `${label} : génitif/datif/prép. -и` };
}

/** Ce que la règle générale prédit — pas forcément ce que la langue fait. */
function byRule(noun: Noun, targetCase: CaseId, plural: boolean, stressed: boolean): RuleResult {
  const special =
    adjectivalNoun(noun, targetCase, plural) ??
    heteroclitic(noun, targetCase, plural) ??
    pathNoun(noun, targetCase, plural);
  if (special) return special;
  const stem = getStem(noun);
  if (plural) return decliningPlural(noun, targetCase, stem, stressed);
  const cls = declensionClass(noun);
  if (cls === "second") return secondSingular(noun, targetCase, stem, stressed);
  if (cls === "third") return thirdSingular(noun, targetCase, stem);
  return firstSingular(noun, targetCase, stem, stressed);
}

/**
 * Ce que la règle générale donnerait pour cette case, sans accent.
 *
 * Exposé pour le diagnostic d'une réponse fausse (lib/grammar/diagnose.ts) :
 * « отеца́ » n'est pas une faute de cas, c'est la règle appliquée à un mot
 * qui lui échappe — et le dire apprend quelque chose, là où « pas tout à
 * fait » n'apprend rien.
 */
export function ruleForm(noun: Noun, targetCase: CaseId, plural = false): string {
  const accented = (plural ? noun.forms.plural : noun.forms.singular)[CASE_ORDER.indexOf(targetCase)];
  return byRule(noun, targetCase, plural, endingIsStressed(accented)).form;
}

// ─── Point d'entrée ────────────────────────────────────────────────

export function declineNoun(noun: Noun, targetCase: CaseId, plural = false): DeclensionResult {
  const index = CASE_ORDER.indexOf(targetCase);
  const accented = (plural ? noun.forms.plural : noun.forms.singular)[index];
  const form = stripAccent(accented);
  // La variante du dictionnaire, quand elle existe. Elle ne change rien à
  // la forme enseignée — elle empêche de compter fausse une réponse juste.
  const variant = (plural ? noun.forms.variants?.plural : noun.forms.variants?.singular)?.[index];

  const predicted = byRule(noun, targetCase, plural, endingIsStressed(accented));
  if (predicted.form === form) {
    return {
      case: targetCase,
      form,
      accented,
      variant,
      ruleApplied: predicted.rule,
      isIrregular: false,
    };
  }

  // La règle se trompe : reste à dire EN QUOI, pour que l'apprenant sache
  // quoi mémoriser. « Forme irrégulière : à mémoriser telle quelle » est le
  // dernier recours, pas la réponse par défaut — c'est un aveu, et un aveu
  // rendu sur une forme régulière décourage pour rien.
  const sameEnding = predicted.ending.length > 0 && form.endsWith(predicted.ending);
  if (sameEnding) {
    return {
      case: targetCase,
      form,
      accented,
      variant,
      ruleApplied: `${predicted.rule} — mais le radical change (voyelle mobile ou alternance)`,
      isIrregular: true,
    };
  }

  // Génitif pluriel à désinence zéro : le mot se réduit à son radical, et
  // une voyelle vient rendre prononçable le groupe de consonnes qui reste
  // (о́кна → о́кон, сёстры → сестёр, ба́бушки → ба́бушек). La désinence est
  // bien celle que la règle annonce — il n'y en a pas — et c'est la voyelle
  // d'appui qui ne se devine pas.
  if (targetCase === "genitive" && plural) {
    const pluralStem = getPluralStem(noun).stem;
    if (insertsVowel(pluralStem, form)) {
      return {
        case: targetCase,
        form,
        accented,
        ruleApplied:
          "génitif pluriel Ø — une voyelle d'appui s'insère dans le radical " +
          "(о́кна → о́кон, пе́сни → пе́сен)",
        isIrregular: true,
      };
    }
    // Le signe mou cède la place à la voyelle d'appui plutôt que de s'y
    // ajouter : ко́льца → коле́ц, пи́сьма → пи́сем.
    if (pluralStem.includes("ь") && insertsVowel(pluralStem.replace("ь", ""), form)) {
      return {
        case: targetCase,
        form,
        accented,
        ruleApplied:
          "génitif pluriel Ø — le signe mou cède la place à une voyelle d'appui " +
          "(ко́льца → коле́ц, пи́сьма → пи́сем)",
        isIrregular: true,
      };
    }
    // Désinence zéro sur un masculin dur, là où la règle attend -ов.
    // Classe fermée qu'on apprend comme une liste.
    if (form === pluralStem && noun.gender === "masculine") {
      return {
        case: targetCase,
        form,
        accented,
        ruleApplied:
          "génitif pluriel Ø sur un masculin : classe fermée (глаз, во́лос, " +
          "солда́т, раз — pas de -ов)",
        isIrregular: true,
      };
    }
  }

  // L'instrumental pluriel en -ьми : classe fermée de cinq mots, qu'on
  // apprend comme une liste et non comme une règle. Le dire, c'est déjà la
  // moitié du travail de mémorisation.
  if (targetCase === "instrumental" && plural && form.endsWith("ьми")) {
    return {
      case: targetCase,
      form,
      accented,
      variant,
      ruleApplied:
        "instrumental pluriel en -ьми : classe fermée (людьми́, детьми́, " +
        "дверьми́, лошадьми́, дочерьми́)",
      isIrregular: true,
    };
  }

  // Le « second prépositionnel » : после в/на, quelques masculins prennent
  // -у́ accentué au lieu de -е (в саду́, на полу́, в лесу́). Ce n'est pas une
  // irrégularité, c'est un cas résiduel que les grammaires nomment locatif.
  if (targetCase === "prepositional" && !plural && form.endsWith("у")) {
    return {
      case: targetCase,
      form,
      accented,
      variant,
      ruleApplied:
        "locatif en -у́ : après в/на, quelques masculins le prennent au lieu " +
        "de -е (в саду́, на полу́, в лесу́)",
      isIrregular: true,
    };
  }

  // Le nominatif pluriel, lui, n'est pas dérivable : -ья (бра́тья), -а́
  // accentué (дома́, учителя́), supplétif (лю́ди), hétéroclitique (времена́).
  // C'est LA forme à mémoriser du pluriel — et depuis que les cas obliques
  // se calculent à partir d'elle, le dire est une information utile et non
  // un constat d'échec.
  if (targetCase === "nominative" && plural) {
    return {
      case: targetCase,
      form,
      accented,
      variant,
      ruleApplied:
        "nominatif pluriel irrégulier : à mémoriser — les autres cas du pluriel s'en déduisent",
      isIrregular: true,
    };
  }

  return {
    case: targetCase,
    form,
    accented,
    ruleApplied: "forme irrégulière : à mémoriser telle quelle",
    isIrregular: true,
  };
}

/**
 * `form` est-il `stem` avec UNE voyelle insérée ? Comparé au ё près : la
 * voyelle d'appui déplace souvent l'accent, et donc le ё (сёстры → сестёр).
 */
function insertsVowel(stem: string, form: string): boolean {
  const flat = (w: string) => w.replace(/ё/g, "е");
  const a = flat(stem);
  const b = flat(form);
  if (b.length !== a.length + 1) return false;
  for (let i = 0; i < b.length; i += 1) {
    if (!VOWELS.includes(b[i])) continue;
    if (b.slice(0, i) + b.slice(i + 1) === a) return true;
  }
  return false;
}

export function declineAll(noun: Noun, plural = false): DeclensionResult[] {
  return CASE_ORDER.map((c) => declineNoun(noun, c, plural));
}
