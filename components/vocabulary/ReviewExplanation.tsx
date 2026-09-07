"use client";

import WordExplanation from "@/components/vocabulary/WordExplanation";

/**
 * « Expliquer ce mot » pendant une révision, dans les quatre modes.
 *
 * APRÈS LA RÉPONSE, JAMAIS AVANT. La fiche donne le sens, le registre et
 * des exemples : posée à côté de la question, elle souffle précisément ce
 * qu'on demande de retrouver. Elle n'apparaît donc qu'une fois la réponse
 * connue — carte retournée, réponse vérifiée, option choisie, mot révélé.
 * C'est aussi le seul moment où une nuance ou un piège s'ancre.
 *
 * ÉCRIT ICI UNE SEULE FOIS. Le bloc n'existait qu'en mode Cartes, alors que
 * les trois autres montrent la bonne réponse eux aussi et s'arrêtaient à la
 * traduction — or une faute de frappe ou un mauvais choix est justement le
 * moment où l'on veut savoir pourquoi. Un même bloc recopié quatre fois
 * finit par diverger : voir ReviewModeGrid, pour la grille des modes.
 *
 * RIEN N'EST CHARGÉ SANS CLIC — pas d'`autoLoad`, contrairement à la carte
 * d'une liste où le bouton « Expliquer » EST déjà la demande. Une session
 * enchaîne des dizaines de mots ; en générer la fiche à chaque réponse
 * épuiserait le plafond d'explications sans que personne ne l'ait demandé.
 * La fiche est mise en cache côté serveur, donc la rouvrir plus tard ne
 * coûte ni attente ni quota.
 */
export default function ReviewExplanation({ wordId }: { wordId: string }) {
  return (
    <div className="mt-4 flex justify-center">
      {/* Remonté à chaque mot : sans cette clé, la fiche du mot précédent
          resterait affichée telle quelle sous la réponse du suivant. */}
      <WordExplanation key={wordId} wordId={wordId} />
    </div>
  );
}
