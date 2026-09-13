"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import ResendConfirmationForm from "@/components/auth/ResendConfirmationForm";
import TurnstileWidget from "@/components/auth/TurnstileWidget";
import GoogleButton, { AuthDivider } from "@/components/auth/GoogleButton";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/layout/Logo";

// Le lien de confirmation échoué n'est pas toujours une inscription — un
// message "demande une nouvelle confirmation"serait trompeur pour un lien
// de réinitialisation de mot de passe ou de changement d'email.
function confirmErrorMessage(type: string | null): string {
  if (type === "recovery") {
    return "Ce lien de réinitialisation de mot de passe est invalide ou a expiré. Demande-en un nouveau.";
  }
  if (type === "email_change") {
    return "Ce lien de confirmation de changement d'email est invalide ou a expiré. Ton adresse email n'a pas été modifiée.";
  }
  return "Ce lien de confirmation est invalide ou a expiré. Demande-en un nouveau ci-dessous.";
}

/**
 * Ce qui attend derrière la porte, quand on arrive ici depuis une section
 * fermée.
 *
 * POURQUOI. La barre de navigation annonce le produit entier — vocabulaire
 * et lecture compris — et deux de ses entrées mènent donc ici. Un visiteur
 * qui clique « Vocabulaire » et tombe sur « Connecte-toi pour sauvegarder ta
 * progression » a appris qu'il fallait un compte, mais toujours pas ce
 * qu'il y a dedans : c'est une porte fermée sans écriteau, et c'est
 * exactement le moment où il repart.
 *
 * Le `next` est déjà là — proxy.ts le pose en redirigeant — il ne restait
 * qu'à s'en servir. Chaque phrase décrit CE QUI EST DERRIÈRE, pas la
 * mécanique du compte.
 */
function promiseFor(next: string | null): string | null {
  // SANS `?next=`, ON N'EST VENU DE NULLE PART : /login ouvert depuis la
  // barre, un favori, un lien partagé. Il n'y a pas de porte à décrire, et
  // le repli générique est le bon texte. C'est aussi pour ça que ce
  // paramètre est lu BRUT ici, et non après le `?? "/dashboard"` : ce repli
  // rendrait toute arrivée directe indiscernable d'une redirection.
  if (!next) return null;
  if (next.startsWith("/vocabulary")) {
    return "Tes mots, révisés au bon moment : cartes, QCM, frappe et prononciation, avec une répétition espacée qui décide seule quoi te remontrer et quand.";
  }
  if (next.startsWith("/reading")) {
    return "Des textes où chaque mot décliné dit son cas, et pourquoi — avec l'explication de l'IA pour chaque phrase, et un mode pour deviner les cas.";
  }
  if (next.startsWith("/dashboard")) {
    return "Ta série, ton niveau et ta précision par compétence, mis à jour à chaque exercice.";
  }
  // Toutes les sous-routes d'exercices : /cases/…, /aspect/…, /adjectives/…
  // Le catalogue /exercices, lui, est public et ne mène jamais ici.
  if (next !== "/") {
    return "Les exercices corrigent, expliquent l'erreur et retiennent ta précision — ça demande un compte, parce que ça s'enregistre.";
  }
  return null;
}

export default function LoginForm() {
  return (
    <Suspense fallback={null}>
      <LoginCard />
    </Suspense>
  );
}

function LoginCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "confirm"
      ? confirmErrorMessage(searchParams.get("type"))
      : searchParams.get("error") === "auth"
        ? "La connexion a échoué. Réessaie."
        : null,
  );
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [notice, setNotice] = useState<string | null>(
    searchParams.get("deleted") === "1" ? "Ton compte a bien été supprimé." : null,
  );
  const [loading, setLoading] = useState<"password" | "google" | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);

  async function signInWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setUnconfirmed(false);

    // Supabase protège aussi la connexion mot de passe (Authentication →
    // Attack Protection), pas seulement l'inscription — sans jeton, la
    // requête est rejetée avant même de vérifier les identifiants.
    if (!captchaToken) {
      setError("Merci de valider le captcha avant de continuer.");
      return;
    }

    setLoading("password");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
        options: { captchaToken },
      });

      if (error) {
        if (error.code === "email_not_confirmed") {
          setUnconfirmed(true);
          setError("Ton compte n'est pas encore confirmé. Ouvre le lien reçu par email.");
        } else if (error.code === "invalid_credentials") {
          setError("Email ou mot de passe incorrect.");
        } else if (error.code === "captcha_failed") {
          setError("Le captcha a expiré ou a échoué. Réessaie.");
        } else {
          setError("La connexion a échoué. Réessaie dans un instant.");
        }
        // Le jeton vient d'être consommé par Supabase, qu'il ait réussi ou
        // non — il en faut un neuf pour la prochaine tentative. On le vide
        // aussi immédiatement (pas seulement le reset du widget, qui est
        // asynchrone) : sinon une resoumission pendant la fenêtre où le
        // widget n'a pas encore renvoyé de jeton frais repartirait avec
        // l'ancien, déjà invalide côté Supabase.
        setCaptchaToken(null);
        setCaptchaResetSignal((n) => n + 1);
        setLoading(null);
        return;
      }

      // Le cookie de session est posé : on recharge pour que le serveur le voie.
      router.push(next);
      router.refresh();
    } catch {
      setError("La connexion a échoué. Réessaie dans un instant.");
      setCaptchaToken(null);
      setCaptchaResetSignal((n) => n + 1);
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-var(--nav-h))] max-w-md flex-col justify-center px-6 py-10">
      <div className="rounded-[20px] surface p-8 shadow-float">
        <div className="text-center">
          {/* Le vrai logo, pas un carré bleu portant une lettre : c'est la
              première chose que voit quelqu'un qui arrive sur le site depuis
              un lien, et elle doit dire « russe ». Le halo reprend celui de
              la barre pour que les deux se répondent. */}
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center">
            <Logo size={48} />
          </div>
          <h1 className="font-display text-2xl font-bold">Bienvenue sur Privetik</h1>
          <p className="mt-2 font-display text-sm text-muted">
            {promiseFor(searchParams.get("next")) ??
              "Connecte-toi pour sauvegarder ta progression et retrouver tes modules."}
          </p>
        </div>

        <form onSubmit={signInWithPassword} className="mt-7 text-left">
          <label
            htmlFor="email"
            className="mb-1.5 block font-display text-sm font-medium text-muted"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="toi@exemple.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-[10px] border border-border bg-bg px-3.5 py-2.5 font-display text-sm text-text placeholder:text-muted/60 field-focus focus:outline-none"
          />

          {/* Le lien vit SUR LA LIGNE DU CHAMP, pas en bas de carte : on le
              cherche au moment précis où le mot de passe ne revient pas, et
              c'est là que l'œil se trouve. Relégué sous le bouton, il se lit
              après trois tentatives ratées. */}
          <div className="mb-1.5 mt-4 flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="block font-display text-sm font-medium text-muted">
              Mot de passe
            </label>
            <Link
              href="/forgot-password"
              className="font-display text-xs font-semibold text-muted transition-colors hover:text-accent-ink"
            >
              Oublié ?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-[10px] border border-border bg-bg px-3.5 py-2.5 font-display text-sm text-text field-focus focus:outline-none"
          />

          <div className="mt-4">
            <TurnstileWidget
              action="login"
              onToken={setCaptchaToken}
              resetSignal={captchaResetSignal}
            />
          </div>

          <button
            type="submit"
            disabled={loading !== null}
            className="btn surface-interactive surface-static mt-5 h-12 w-full rounded-xl px-4 font-display text-sm font-semibold disabled:opacity-60"
          >
            <span>{loading === "password" ? "Connexion…" : "Se connecter"}</span>
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-4 font-display text-sm text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-4 font-display text-sm text-success">
            {notice}
          </p>
        )}
        {unconfirmed && (
          <div className="mt-4">
            <ResendConfirmationForm email={email} />
          </div>
        )}

        <AuthDivider />

        <GoogleButton
          next={next}
          disabled={loading !== null}
          onError={(message) => setError(message || null)}
          onPending={(pending) => setLoading(pending ? "google" : null)}
        />

        <p className="mt-6 text-center font-display text-sm text-muted">
          Pas encore de compte ?{" "}
          <Link href="/signup" className="font-semibold text-text hover:text-accent-ink">
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
  );
}
