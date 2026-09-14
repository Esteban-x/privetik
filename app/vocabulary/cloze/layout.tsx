import type { Metadata } from "next";

// Le titre de l'onglet, que la page client ne peut pas porter (voir
// app/vocabulary/typing/layout.tsx).
export const metadata: Metadata = {
  title: "Réviser en phrases à trous",
};

export default function ClozeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
