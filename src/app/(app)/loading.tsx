import { BrandMark } from "@/components/brand";

/** Aparece na hora em que se clica num link, enquanto o servidor monta a página. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <div className="mb-8 flex items-end justify-between gap-4 border-b border-ink/[0.07] pb-6">
        <div className="space-y-3"><div className="skeleton h-9 w-72" /><div className="skeleton h-4 w-96 max-w-full" /></div>
        <BrandMark animated className="h-10 w-10" color="#8F5E13" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="card space-y-3"><div className="skeleton h-3 w-24" /><div className="skeleton h-8 w-36" /><div className="skeleton h-3 w-28" /></div>)}</div>
      <div className="mt-5 grid gap-4 xl:grid-cols-5">
        <div className="card space-y-3 xl:col-span-3"><div className="skeleton h-4 w-40" /><div className="skeleton h-56 w-full" /></div>
        <div className="card space-y-3 xl:col-span-2"><div className="skeleton h-4 w-40" />{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-6 w-full" />)}</div>
      </div>
    </div>
  );
}
