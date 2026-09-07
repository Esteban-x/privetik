/**
 * Chargeur commun du dictionnaire OpenRussian.
 *
 * POURQUOI CE MODULE EXISTE. `scripts/build-nouns.mjs` importait déjà les
 * paradigmes des noms depuis ce dictionnaire, et la banque de noms est la
 * seule du projet à être vérifiable forme par forme. Les autres banques
 * (verbes de conjugaison, d'aspect, de mouvement, adjectifs, lexique de
 * vocabulaire) sont écrites à la main ou produites par un modèle, et rien
 * ne les confrontait à une source.
 *
 * Le dictionnaire couvre pourtant les quatre catégories — 58 433 mots, tous
 * accentués. Ce module les expose une fois pour toutes, pour que chaque
 * script de contrôle puisse répondre à deux questions qu'aucun ne savait
 * poser :
 *
 *   1. « ce mot existe-t-il ? »          -> lookup(bare)
 *   2. « l'accent est-il au bon endroit ? » -> accentedOf(bare)
 *
 * Ce sont exactement les deux questions qui ont laissé passer « абва́к »
 * (mot inexistant donné pour « alphabet ») et « аптека́ » (accent sur la
 * mauvaise syllabe) dans le lexique de vocabulaire.
 *
 * Le dictionnaire est publié sous licence Creative Commons
 * Attribution-ShareAlike 4.0 — voir l'attribution dans le README.
 *
 * Les CSV (11 Mo au total) ne sont pas versionnés : ils sont téléchargés au
 * premier lancement dans scripts/.cache/ (ignoré par git), comme le faisait
 * déjà build-nouns.mjs pour nouns.csv.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = path.join(ROOT, "scripts", ".cache");
const BASE = "https://raw.githubusercontent.com/Badestrand/russian-dictionary/master/";

/** Les quatre fichiers du dictionnaire, et ce que chacun apporte. */
export const SOURCES = {
  // 26 983 noms : 12 formes fléchies, genre, animacité.
  nouns: "nouns.csv",
  // 14 872 verbes : aspect, partenaire aspectuel, impératif, passé, présent/futur.
  verbs: "verbs.csv",
  // 11 942 adjectifs : formes courtes, comparatif, 24 formes déclinées.
  adjectives: "adjectives.csv",
  // 5 032 invariables : adverbes, pronoms, prépositions, conjonctions.
  others: "others.csv",
};

/** Les colonnes qui portent une forme fléchie, par catégorie. */
export const FORM_COLUMNS = {
  nouns: [
    "sg_nom", "sg_gen", "sg_dat", "sg_acc", "sg_inst", "sg_prep",
    "pl_nom", "pl_gen", "pl_dat", "pl_acc", "pl_inst", "pl_prep",
  ],
  verbs: [
    "imperative_sg", "imperative_pl",
    "past_m", "past_f", "past_n", "past_pl",
    "presfut_sg1", "presfut_sg2", "presfut_sg3",
    "presfut_pl1", "presfut_pl2", "presfut_pl3",
  ],
  adjectives: [
    "comparative", "superlative", "short_m", "short_f", "short_n", "short_pl",
    "decl_m_nom", "decl_m_gen", "decl_m_dat", "decl_m_acc", "decl_m_inst", "decl_m_prep",
    "decl_f_nom", "decl_f_gen", "decl_f_dat", "decl_f_acc", "decl_f_inst", "decl_f_prep",
    "decl_n_nom", "decl_n_gen", "decl_n_dat", "decl_n_acc", "decl_n_inst", "decl_n_prep",
    "decl_pl_nom", "decl_pl_gen", "decl_pl_dat", "decl_pl_acc", "decl_pl_inst", "decl_pl_prep",
  ],
};

const VOWELS = "аеёиоуыэюя";

/**
 * "рабо'та" -> "рабо́та" (accent combinant U+0301). Non marqué sur un
 * monosyllabe : la même convention que scripts/build-nouns.mjs, sans quoi
 * la banque de noms et les contrôles ne compareraient pas la même chose.
 */
export function accentuate(form) {
  const bare = form.replace(/'/g, "");
  const vowels = [...bare].filter((c) => VOWELS.includes(c)).length;
  if (vowels <= 1) return bare;
  return form.replace(/'/g, "\u0301");
}

/** Retire l'accent tonique combinant : "рабо́та" -> "работа". */
export function stripAccent(form) {
  return form.replace(/\u0301/g, "");
}

/**
 * Repli de comparaison : minuscules, accent retiré, ё -> е.
 *
 * C'est la clé sur laquelle on CHERCHE un mot, jamais celle sur laquelle on
 * le VALIDE — sinon un accent faux serait invisible. Les deux usages sont
 * séparés partout dans ce module.
 */
export function fold(word) {
  return stripAccent(word).replace(/ё/g, "е").toLowerCase();
}

/** Nombre de voyelles, accent retiré. */
export function vowelCount(form) {
  return [...stripAccent(form)].filter((c) => VOWELS.includes(c)).length;
}

/** Un polysyllabe doit porter un accent — ё le porte par nature. */
export function carriesStress(form) {
  return form.includes("\u0301") || form.includes("ё") || form.includes("Ё");
}

/**
 * Une case du dictionnaire peut lister des variantes toutes correctes
 * ("рабо'той, рабо'тою" — la seconde est archaïsante ; "дочерьми', дочеря'ми"
 * — les deux s'entendent). Un astérisque marque une forme non standard : la
 * case entière est alors refusée.
 *
 * Rend TOUTES les variantes, la principale en tête. build-nouns.mjs n'en
 * gardait qu'une et jetait le reste, ce qui faisait compter fausse une
 * réponse juste ; c'est le champ `variants` de la banque qui les recueille.
 */
export function canonicalForms(raw) {
  if (!raw || raw.includes("*")) return [];
  return raw
    .split(/,|\/\//)
    .map((f) => f.trim())
    .filter((f) => f && /^[а-яёА-ЯЁ']+$/.test(f));
}

async function download(file) {
  const target = path.join(CACHE, file);
  if (fs.existsSync(target)) return target;
  fs.mkdirSync(CACHE, { recursive: true });
  process.stdout.write(`Téléchargement du dictionnaire (${file})…\n`);
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`téléchargement impossible (HTTP ${res.status}) : ${BASE + file}`);
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  return target;
}

function parseTsv(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const head = lines[0].split("\t").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    if (cells.length < head.length) continue;
    rows.push(Object.fromEntries(head.map((h, j) => [h, (cells[j] ?? "").trim()])));
  }
  return rows;
}

const loaded = new Map();

/**
 * Charge une ou plusieurs catégories et rend un index.
 *
 * `byBare` garde la PREMIÈRE entrée d'un homographe, comme le faisait
 * loadDictionary() dans build-nouns.mjs : les doublons du dictionnaire sont
 * des sens distincts du même mot, pas des formes distinctes.
 */
export async function loadDictionary(kinds = Object.keys(SOURCES)) {
  const byBare = new Map();
  const byKind = {};
  for (const kind of kinds) {
    const file = SOURCES[kind];
    if (!file) throw new Error(`catégorie inconnue : ${kind}`);
    if (!loaded.has(kind)) loaded.set(kind, parseTsv(await download(file)));
    const rows = loaded.get(kind);
    byKind[kind] = new Map();
    for (const r of rows) {
      if (!r.bare) continue;
      if (!byKind[kind].has(r.bare)) byKind[kind].set(r.bare, r);
      if (!byBare.has(r.bare)) byBare.set(r.bare, { ...r, kind });
    }
  }

  // Index de recherche tolérant : on trouve un mot même mal accentué, ce qui
  // est justement le cas qu'on veut diagnostiquer.
  const byFold = new Map();
  for (const [bare, row] of byBare) {
    const key = fold(bare);
    if (!byFold.has(key)) byFold.set(key, row);
  }

  // ─── Index des formes FLÉCHIES ──────────────────────────────────
  //
  // Un lexique de vocabulaire contient des formes, pas seulement des
  // lemmes : « де́ти » (pluriel de ребёнок), « ноября́ » (génitif de
  // ноябрь), « иди́ » (impératif d'идти), « проду́кты », « но́гти ».
  // Chercher uniquement le lemme les déclarait inconnues et les faisait
  // supprimer — on aurait jeté des mots parfaitement russes en croyant
  // nettoyer des inventions.
  //
  // Le lemme garde la priorité : « ма́сла » est d'abord le génitif de
  // ма́сло, et c'est cette lecture qu'on veut proposer.
  const INFLECTED = {
    nouns: FORM_COLUMNS.nouns,
    verbs: FORM_COLUMNS.verbs,
    adjectives: FORM_COLUMNS.adjectives,
  };
  const byForm = new Map();
  for (const kind of kinds) {
    const columns = INFLECTED[kind];
    if (!columns) continue;
    for (const row of loaded.get(kind)) {
      for (const col of columns) {
        for (const variant of canonicalForms(row[col])) {
          // Accentuer AVANT de replier : le CSV marque l'accent par une
          // apostrophe ("де'ти"), que `fold` ne connaît pas — replier la
          // forme brute produisait une clé introuvable.
          const accented = accentuate(variant);
          const key = fold(accented);
          if (key && !byForm.has(key)) byForm.set(key, accented);
        }
      }
    }
  }

  return {
    size: byBare.size,
    forms: byForm.size,
    /** L'entrée du dictionnaire, cherchée sur la forme nue. */
    lookup: (word) => byBare.get(stripAccent(word)) ?? byFold.get(fold(word)),
    /**
     * Le mot correctement accentué, ou undefined s'il est inconnu.
     *
     * Cherche d'abord le LEMME, puis les formes fléchies : « авеню́ » est un
     * lemme, « де́ти » une forme. Les deux doivent recevoir leur accent.
     */
    accentedOf: (word) => {
      const row = byBare.get(stripAccent(word)) ?? byFold.get(fold(word));
      if (row) return accentuate(row.accented);
      return byForm.get(fold(word));
    },
    /** Vrai si le mot est un lemme du dictionnaire (et pas seulement une forme). */
    isLemma: (word) => byBare.has(stripAccent(word)) || byFold.has(fold(word)),
    /** L'index d'une seule catégorie, pour les scripts qui lisent des colonnes. */
    of: (kind) => byKind[kind],
    /**
     * Les LIGNES BRUTES d'une catégorie, homographes compris.
     *
     * `of()` et `byBare` gardent la première entrée d'un mot : les doublons
     * y sont des sens distincts, et pour décliner « за́мок » le premier sens
     * suffit. Mais pour SAVOIR QU'UN MOT EST AMBIGU il faut justement les
     * lignes que ces index écartent — « за́мок » (château) et « замо́к »
     * (serrure) partagent la forme nue et n'ont pas le même accent. Sans
     * cet accès, on ne peut pas distinguer un mot à lecture unique d'un
     * homographe, et l'on pose l'accent du premier sens sur le second.
     */
    rows: (kind) => loaded.get(kind) ?? [],
  };
}
