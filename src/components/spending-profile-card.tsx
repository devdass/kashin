import type { SpendingProfile } from "@/lib/insights";

function money(value: number) {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(value);
}

export function SpendingProfileCard({ profile }: { profile: SpendingProfile }) {
  return (
    <section className="border border-[#c8bea8] bg-[#1c2b3a] p-4 text-white">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#d7b85b]">Spending profile</p>
      <p className="mt-3 font-serif text-xl font-bold">{money(profile.avgWeeklySpend)} <span className="font-sans text-xs font-normal text-[#b8c1c8]">average each week</span></p>
      {profile.spendVsIncomePct !== null && <p className="mt-1 text-xs text-[#b8c1c8]">Using {profile.spendVsIncomePct}% of detected monthly income</p>}
      <p className="mt-4 border-t border-white/15 pt-3 text-sm leading-5 text-[#e8ecef]">{profile.summary}</p>
      {profile.topCategories.length > 0 && (
        <div className="mt-4 space-y-2">
          {profile.topCategories.map((category) => <div className="flex items-center justify-between gap-3 text-xs" key={category.name}><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />{category.name}</span><span className="font-mono text-[#b8c1c8]">{category.share}%</span></div>)}
        </div>
      )}
    </section>
  );
}
