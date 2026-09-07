/**
 * Pose l'accent tonique sur les mots DÉJÀ enregistrés dans les listes.
 *
 *   node scripts/accent-vocab.mjs          # montre ce qui changerait
 *   node scripts/accent-vocab.mjs --apply  # écrit
 *
 * POURQUOI UN RATTRAPAGE. /api/vocab/words accentue désormais chaque mot
 * qui entre dans une liste, mais rien ne repasse sur ceux qui y sont déjà :
 * sans ce script, la fonctionnalité ne se voit que sur les mots ajoutés
 * après coup, et les listes existantes — les seules que l'apprenant
 * regarde — restent nues.
 *
 * IL NE DEVINE RIEN : c'est le même lib/vocabulary/accent.ts que la route
 * d'ajout, donc les mêmes abstentions (mot inconnu des banques, homographe,
 * orthographe qui diffère d'un ё, monosyllabe). Ce qu'il ne sait pas
 * trancher ressort tel quel, et il l'affiche.
 *
 * LA TRANSLITTÉRATION SUIT. Elle se déduit de l'accent (voir
 * transliterate.ts) : un mot accentué a droit à une lecture correcte,
 * « хорошо́ » -> « kharacho » là où le mot nu donnait « khorosho ». On ne
 * touche cependant QUE les lignes dont la translittération est absente ou
 * était elle-même calculée à partir du mot nu — celle que l'apprenant a
 * écrite lui-même, ou qu'un modèle a produite, n'est jamais écrasée.
 *
 * ÉCRITURE EN PRODUCTION : la base est partagée avec le local (une seule
 * instance Supabase), donc `--apply` touche les listes de vrais comptes.
 * D'où le mode « montre » par défaut.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });
const { accentRu, stripStress } = await jiti.import("../lib/vocabulary/accent.ts");
const { transliterate } = await jiti.import("../lib/vocabulary/transliterate.ts");

const apply = process.argv.includes("--apply");

function readEnv(name) {
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(new RegExp(`^\s*${name}\s*=\s*(.+?)\s*$`));
      if (match) return match[1].replace(/^["']|["']$/g, "");
    }
  }
  return process.env[name] ?? null;
}

const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (.env.local)."
  );
  process.exit(1);
}
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

const words = await (
  await fetch(`${url}/rest/v1/vocab_words?select=id,ru,transliteration,example_ru`, { headers })
).json();
if (!Array.isArray(words)) {
  console.error("Lecture impossible :", JSON.stringify(words).slice(0, 300));
  process.exit(1);
}

const changes = [];
const untouched = [];
for (const w of words) {
  const ru = accentRu(w.ru ?? "");
  const exampleRu = accentRu(w.example_ru ?? "") || null;
  const patch = {};
  if (ru !== w.ru) patch.ru = ru;
  if (exampleRu !== w.example_ru) patch.example_ru = exampleRu;

  // La translittération n'est refaite que si elle manque, ou si elle est
  // exactement celle que la règle produisait sur le mot NU : dans ce cas
  // personne ne l'a écrite, elle n'était qu'un calcul incomplet.
  if (patch.ru) {
    const fromBare = transliterate(stripStress(w.ru ?? ""));
    if (!w.transliteration || w.transliteration === fromBare) {
      const better = transliterate(ru);
      if (better && better !== w.transliteration) patch.transliteration = better;
    }
  }

  if (Object.keys(patch).length === 0) {
    if (w.ru) untouched.push(w.ru);
    continue;
  }
  changes.push({ id: w.id, before: w, patch });
}

console.log(`${words.length} mots lus, ${changes.length} à modifier.\n`);
for (const c of changes) {
  const parts = [];
  if (c.patch.ru) parts.push(`${c.before.ru} -> ${c.patch.ru}`);
  if (c.patch.transliteration)
    parts.push(`(${c.before.transliteration ?? "—"} -> ${c.patch.transliteration})`);
  if (c.patch.example_ru) parts.push(`ex. ${c.patch.example_ru}`);
  console.log(`   ${parts.join("  ")}`);
}

if (untouched.length) {
  console.log(`\n${untouched.length} laissés tels quels (inconnus des banques, ambigus, ou déjà accentués) :`);
  console.log(`   ${untouched.join(", ")}`);
}

if (!apply) {
  console.log("\nRien n'a été écrit. Relance avec --apply pour appliquer.");
  process.exit(0);
}

let written = 0;
for (const c of changes) {
  const res = await fetch(`${url}/rest/v1/vocab_words?id=eq.${c.id}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(c.patch),
  });
  if (res.ok) written += 1;
  else console.error(`   échec sur ${c.before.ru} : HTTP ${res.status}`);
}
console.log(`\n${written} mot(s) mis à jour.`);
