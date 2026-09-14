/**
 * Deux invariants communs à toutes les banques d'exercices, vérifiés au même
 * endroit pour qu'aucun module ne les tienne à sa façon.
 *
 * 1. LES NOTES « POURQUOI PAS CELLE-LÀ » (`whyNot`). Une note posée sur la
 *    bonne réponse affirmerait une faute là où il n'y en a pas — et c'est ce
 *    qui arrive dès qu'un leurre coïncide avec la réponse, ce que le
 *    syncrétisme russe produit souvent. Une note sur une forme absente des
 *    options ne se voit jamais : elle signale un générateur qui étiquette
 *    autre chose que ce qu'il sert.
 *
 * 2. LA RECONSTRUCTION PAR IDENTIFIANT (`rebuild`). « Mes erreurs » ne garde
 *    d'une réponse fausse que son `itemId`, et refait l'exercice le
 *    lendemain. S'il revenait avec une autre bonne réponse, l'apprenant
 *    serait noté contre un exercice qu'il n'a jamais raté.
 *
 * Les options d'un exercice reconstruit ne sont PAS comparées : plusieurs
 * générateurs tirent leurs leurres au hasard (trois autres lettres, trois
 * autres verbes). Ce qui doit revenir à l'identique, c'est la question et sa
 * réponse.
 */
export function practiceInvariants(exercise, rebuild, random) {
  const problems = [];
  const correct = exercise.options[exercise.correctIndex];

  for (const [form, note] of Object.entries(exercise.whyNot ?? {})) {
    if (form === correct) problems.push(`une note vise la bonne réponse « ${form} »`);
    if (!exercise.options.includes(form)) {
      problems.push(`une note vise « ${form} », qui n'est pas proposé`);
    }
    if (typeof note !== "string" || note.trim().length < 8) {
      problems.push(`note vide ou trop courte sur « ${form} »`);
    } else if (/^[A-ZÀ-Ý]/.test(note) || note.trim().endsWith(".")) {
      // L'écran affiche la note derrière la forme choisie : « читаешь —
      // forme de « ты ». » Une majuscule ou un point la cassent.
      problems.push(`note « ${note} » : un fragment s'écrit sans majuscule ni point final`);
    }
  }

  const rebuilt = rebuild(exercise.itemId, random);
  if (!rebuilt) {
    problems.push("l'identifiant ne permet pas de reconstruire l'exercice");
  } else {
    if (rebuilt.itemId !== exercise.itemId) {
      problems.push(`reconstruit sous l'identifiant « ${rebuilt.itemId} »`);
    }
    const again = rebuilt.options[rebuilt.correctIndex];
    if (again !== correct) {
      problems.push(`reconstruit avec la réponse « ${again} » au lieu de « ${correct} »`);
    }
  }
  return problems;
}
