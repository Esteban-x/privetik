/**
 * Comparaison réponse ↔ attendu pour les exercices de vocabulaire.
 *
 * Isomorphe et sans dépendance : le serveur s'en sert pour JUGER
 * (app/api/vocab/answer), le client uniquement pour afficher un retour
 * immédiat. Le verdict qui compte — celui qui alimente le SRS, la série et
 * l'XP — est toujours celui du serveur, comme dans /api/cases/attempt.
 */

/**
 * Tolérant aux accents français (café/cafe, garçon/garcon) : ce mode peut
 * attendre une réponse française sans clavier AZERTY à disposition, et un
 * accent oublié n'est pas une faute de vocabulaire. La décomposition NFD
 * sépare aussi « ё » en « е » + accent, donc le remplacement explicite est
 * redondant mais gardé par clarté.
 */
export function normalizeAnswer(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Articles français en tête de traduction : « le livre » vaut « livre ». */
const FRENCH_ARTICLE = /^(?:l'|le |la |les |un |une |des |du |de la |de l')/;

function stripArticle(s: string): string {
  return s.replace(FRENCH_ARTICLE, "").trim();
}

/**
 * Variantes acceptables d'un attendu. Une traduction est souvent écrite
 * « voiture, auto » ou « parler / dire » : chaque branche est une réponse
 * juste, et n'accepter que la chaîne entière punirait quelqu'un qui connaît
 * le mot. Les parenthèses (« aller (à pied) ») sont traitées comme
 * facultatives.
 */
export function answerVariants(expected: string): string[] {
  const variants = new Set<string>();
  for (const part of expected.split(/[,;/]|\bou\b/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Trois lectures d'une précision entre parenthèses : « aller (à pied) »
    // accepte « aller (à pied) », « aller à pied » et « aller » — les trois
    // sont la réponse de quelqu'un qui connaît le mot.
    const withParens = normalizeAnswer(trimmed);
    const parensOpened = normalizeAnswer(trimmed.replace(/[()]/g, " "));
    const withoutParens = normalizeAnswer(trimmed.replace(/\([^)]*\)/g, " "));
    for (const v of [withParens, parensOpened, withoutParens]) {
      if (!v) continue;
      variants.add(v);
      const bare = stripArticle(v);
      if (bare) variants.add(bare);
    }
  }
  return [...variants];
}

/** Vrai si la réponse correspond à l'attendu ou à l'une de ses variantes. */
export function matchesAnswer(userAnswer: string, expected: string): boolean {
  const given = normalizeAnswer(userAnswer);
  if (!given) return false;
  const bare = stripArticle(given);
  const variants = answerVariants(expected);
  return variants.includes(given) || (bare.length > 0 && variants.includes(bare));
}

// ─── La réponse DITE à voix haute ───────────────────────────────────

/**
 * Ce qu'une reconnaissance vocale ajoute d'elle-même autour des mots.
 *
 * Le moteur ponctue et met des majuscules : « Книга. », « C'est un livre ! ».
 * Une réponse tapée ne porte jamais ce point final ; une réponse dite le
 * porte presque toujours, et `matchesAnswer` la déclarait donc fausse.
 */
const SPOKEN_PUNCTUATION = /[.,!?;:«»"“”„()…–—-]/g;

function cleanSpoken(text: string): string {
  return text.replace(SPOKEN_PUNCTUATION, " ").replace(/\s+/g, " ").trim();
}

/** Distance d'édition, bornée : au-delà de `max`, la valeur exacte ne sert à rien. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      best = Math.min(best, row[j]);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

export type SpokenVerdict = "match" | "close" | "miss";

/**
 * Ce qu'on a entendu correspond-il à la réponse attendue ?
 *
 * TROIS RÉPONSES, PARCE QUE LE MICRO SE TROMPE. « match » : l'une des
 * lectures du moteur est la réponse, seule ou dans une courte phrase
 * (« это книга », « c'est un livre »). « close » : à une lettre près — un
 * cas mal formé, une syllabe avalée, ou le moteur qui a mal transcrit ; on
 * ne sait pas lequel, et on le dit. « miss » : rien de proche.
 *
 * Toutes les lectures proposées par le moteur sont examinées, pas la seule
 * première (voir `alternatives` dans speech.ts).
 *
 * UN INDICE, JAMAIS UNE NOTE : ce verdict n'alimente ni le SRS ni la série.
 * C'est l'apprenant qui note sa carte.
 */
export function judgeSpoken(heard: string[], expected: string): SpokenVerdict {
  const variants = answerVariants(expected).map(cleanSpoken).filter(Boolean);
  let close = false;

  for (const raw of heard) {
    const given = cleanSpoken(normalizeAnswer(raw));
    if (!given) continue;
    const bare = stripArticle(given);

    for (const variant of variants) {
      if (given === variant || bare === variant) return "match";
      // Le mot dans une phrase — mais pas un mot de deux lettres, qu'on
      // retrouverait au milieu de n'importe quelle réponse.
      if (variant.length >= 3 && ` ${given} `.includes(` ${variant} `)) return "match";

      const tolerance = variant.length >= 8 ? 2 : variant.length >= 4 ? 1 : 0;
      if (tolerance > 0 && editDistance(bare, variant, tolerance) <= tolerance) close = true;
    }
  }
  return close ? "close" : "miss";
}
