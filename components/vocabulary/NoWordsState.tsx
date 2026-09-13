import Link from "next/link";

/**
 * « Aucun mot à réviser » — commun aux quatre modes de révision.
 *
 * IL RENVOYAIT AU PROFIL « pour obtenir des mots tout faits » en choisissant
 * des thèmes : une fonctionnalité retirée depuis que toutes les listes sont
 * écrites par l'apprenant. Le lien ouvrait une page de réglages où aucun
 * thème n'existait. Recopié dans chaque mode, le texte périmé avait survécu
 * quatre fois — il n'est plus écrit qu'ici.
 */
export default function NoWordsState({ listId }: { listId?: string | null }) {
  return (
    <div className="mx-auto max-w-md px-6 py-14 text-center sm:py-24">
      <p className="font-display text-lg font-semibold">Aucun mot à réviser pour l&apos;instant</p>
      <p className="mt-2 font-display text-sm text-muted">
        {listId
          ? "Cette liste est vide. Ajoute-lui quelques mots : ils arrivent en révision dès l'ajout."
          : "Tes listes sont vides. Ajoute des mots à une liste : ils arrivent en révision dès l'ajout."}
      </p>
      <Link
        href={listId ? `/vocabulary?list=${listId}` : "/vocabulary"}
        className="btn btn-primary btn-sheen mt-5 inline-block rounded-[10px] px-5 py-2.5 font-display text-sm"
      >
        {listId ? "Ajouter des mots" : "Aller à mes listes"}
      </Link>
    </div>
  );
}
