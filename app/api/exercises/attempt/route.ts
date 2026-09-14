import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bumpStreakAndXp } from "@/lib/progress/streak";
import {
  checkNumberAnswer,
  getNumberSkill,
  rebuildNumberExercise,
} from "@/lib/numbers/exercises";
import {
  checkConjugationAnswer,
  getConjugationSkill,
  rebuildConjugationExercise,
  TYPABLE_CONJUGATION_SKILLS,
} from "@/lib/conjugation/exercises";
import {
  checkAlphabetAnswer,
  getAlphabetSkill,
  rebuildAlphabetExercise,
} from "@/lib/alphabet/exercises";
import { typedMatches, type PracticeExercise } from "@/lib/exercises/types";
import { allowPractice } from "@/lib/practice/quota";

/**
 * Seule autorité sur la justesse d'une réponse, pour les modules
 * d'exercices récents.
 *
 * Les cinq premiers modules ont chacun leur route (app/api/aspect/attempt,
 * app/api/adjectives/attempt…) parce que chacun a sa table. Ici une seule
 * route sert tous les modules qui écrivent dans `exercise_progress` : ce qui
 * change d'un module à l'autre, c'est la fonction de correction, et elle
 * tient dans une entrée de la table ci-dessous.
 *
 * La règle ne change pas : le client envoie l'identifiant de l'item et ce
 * qu'il a choisi, jamais « j'ai eu juste ». Le serveur rejoue la correction
 * depuis la banque, si bien qu'on ne peut ni gonfler sa progression ni voir
 * à l'écran autre chose que ce qui est enregistré.
 */

type Checker = {
  hasSkill: (skill: string) => boolean;
  check: (itemId: string, answer: string) => boolean | null;
  /** L'exercice exact qu'un identifiant désigne — pour juger une réponse TAPÉE. */
  rebuild: (itemId: string) => PracticeExercise | null;
  /** Les compétences qui acceptent une réponse tapée plutôt qu'une option. */
  typable: readonly string[];
  /** Le `kind` écrit dans activity_log, pour le tableau de bord. */
  activityKind: string;
};

const MODULES: Record<string, Checker> = {
  numbers: {
    hasSkill: (skill) => Boolean(getNumberSkill(skill)),
    check: checkNumberAnswer,
    rebuild: (itemId) => rebuildNumberExercise(itemId),
    typable: [],
    activityKind: "numbers",
  },
  conjugation: {
    hasSkill: (skill) => Boolean(getConjugationSkill(skill)),
    check: checkConjugationAnswer,
    rebuild: (itemId) => rebuildConjugationExercise(itemId),
    typable: TYPABLE_CONJUGATION_SKILLS,
    activityKind: "conjugation",
  },
  alphabet: {
    hasSkill: (skill) => Boolean(getAlphabetSkill(skill)),
    check: checkAlphabetAnswer,
    rebuild: (itemId) => rebuildAlphabetExercise(itemId),
    typable: [],
    activityKind: "alphabet",
  },
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const moduleId = typeof body.module === "string" ? body.module : "";
  const skill = typeof body.skill === "string" ? body.skill : "";
  const itemId = typeof body.itemId === "string" ? body.itemId.slice(0, 160) : "";
  const answer = typeof body.answer === "string" ? body.answer.slice(0, 160) : "";

  const checker = MODULES[moduleId];
  if (!checker) return NextResponse.json({ error: "Module inconnu" }, { status: 400 });
  if (!checker.hasSkill(skill)) {
    return NextResponse.json({ error: "Compétence inconnue" }, { status: 400 });
  }

  // UNE RÉPONSE TAPÉE N'EST PAS UNE OPTION. Elle est comparée, accent, casse
  // et ё mis à part, à la forme que l'exercice attend — relue dans la banque
  // à partir de l'identifiant, jamais prise au client. Seules les compétences
  // déclarées tapables l'acceptent : au passé, l'accent seul sépare la
  // réponse de son leurre, et une saisie sans accent les confondrait.
  const typed = body.typed === true;
  let correct: boolean | null;
  if (typed) {
    if (!checker.typable.includes(skill)) {
      return NextResponse.json({ error: "Cette compétence se répond en choisissant" }, { status: 400 });
    }
    const exercise = itemId.startsWith(`${skill}:`) ? checker.rebuild(itemId) : null;
    correct = exercise ? typedMatches(answer, exercise.options[exercise.correctIndex]) : null;
  } else {
    correct = checker.check(itemId, answer);
  }
  if (correct === null) return NextResponse.json({ error: "Exercice inconnu" }, { status: 400 });

  // Le péage de pratique : vingt exercices par jour au plan gratuit, tous
  // modules confondus.
  //
  // PLACÉ ICI, ET PAS PLUS HAUT. La correction ci-dessus ne coûte rien —
  // c'est une lecture de banque en mémoire. Ce qu'il faut éviter, c'est
  // qu'une requête malformée (compétence inconnue, item inexistant) grignote
  // la journée de quelqu'un : elle ressort en 400 sans avoir rien consommé.
  // Et le péage reste AVANT toute écriture, donc un refus ne laisse ni
  // progression ni XP derrière lui.
  const gate = await allowPractice(supabase, "practice");
  if (!gate.ok) return gate.response;

  const { data: existing } = await supabase
    .from("exercise_progress")
    .select("attempts, correct")
    .eq("user_id", user.id)
    .eq("module_id", moduleId)
    .eq("skill_id", skill)
    .single();

  const attempts = (existing?.attempts ?? 0) + 1;
  const correctTotal = (existing?.correct ?? 0) + (correct ? 1 : 0);

  const { error } = await supabase.from("exercise_progress").upsert(
    {
      user_id: user.id,
      module_id: moduleId,
      skill_id: skill,
      attempts,
      correct: correctTotal,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "user_id,module_id,skill_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("activity_log").insert({
    user_id: user.id,
    kind: checker.activityKind,
    correct,
    meta: { module: moduleId, skill, itemId },
  });

  // Même barème que les autres modules : une réponse juste vaut dix points,
  // une fausse en vaut deux — se tromper en s'entraînant reste mieux que ne
  // pas s'entraîner.
  await bumpStreakAndXp(supabase, user.id, correct ? 10 : 2);

  return NextResponse.json({
    correct,
    accuracy: Math.round((correctTotal / attempts) * 100),
    // Ce qu'il reste APRÈS celui-ci : l'écran sait donc qu'il vient de
    // servir le dernier, et propose l'abonnement plutôt qu'un exercice
    // qu'il faudrait refuser une fois répondu.
    quota: gate.allowance,
  });
}
