/** Remonta a cada navegação: entrada suave do conteúdo da página. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
