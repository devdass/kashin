import Link from "next/link";

const features = [
  {
    title: "Private by default",
    body: "Everything lives in a local SQLite file on your machine. No cloud database, no accounts, no tracking — your transactions never leave your computer unless you choose to.",
  },
  {
    title: "Built on Akahu",
    body: "Connect any New Zealand bank or credit card through your own Akahu personal app. Read-only access — Kashin never stores bank credentials.",
  },
  {
    title: "Budgets & savings goals",
    body: "Choose which accounts feed your balanced budget, set monthly targets per category, and track savings goals with a clean weekly and monthly view.",
  },
  {
    title: "A review queue that learns",
    body: "Categorisation runs locally and improves as you review. Confirm a merchant once and Kashin remembers it for every future transaction.",
  },
  {
    title: "Optional AI categorisation",
    body: "Bring your own LLM API key to help label the tricky ones. It's off by default and you stay in control of what's sent.",
  },
  {
    title: "Your categories, your rules",
    body: "Add, rename and recolour categories. Set travel windows, debt figures and reporting timezone — none of it is hardcoded.",
  },
];

const steps = [
  {
    step: "1",
    title: "Clone & install",
    code: "git clone https://github.com/devdass/kashin.git\ncd kashin\nnpm install",
  },
  {
    step: "2",
    title: "Add a local encryption key",
    code: "cp .env.example .env.local\nopenssl rand -base64 32  # put the output after AKAHU_ENCRYPTION_KEY=",
  },
  {
    step: "3",
    title: "Run it locally",
    code: "npm run dev",
  },
  {
    step: "4",
    title: "Create a password & connect Akahu",
    body: "Open http://localhost:3000, create a login, then paste your Akahu personal-app User Access and App ID tokens. Hit sync and you're off.",
  },
];

export function Brochure() {
  return (
    <main className="min-h-screen bg-[#f0ebe0] text-[#1a1a1a]">
      <div className="mx-auto w-full max-w-[1080px] px-4 pt-8 md:px-8">
        <header className="flex items-center justify-between">
          <p className="font-serif text-xl font-bold text-[#1c2b3a]">Kashin</p>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#b8922a]">Local-first personal finance</span>
        </header>

        <section className="mt-16 grid items-center gap-10 md:grid-cols-2">
          <div>
            <p className="eyebrow">For Akahu users in New Zealand</p>
            <h1 className="mt-4 font-serif text-4xl font-bold leading-tight text-[#1c2b3a] md:text-5xl">
              Understand your spending without giving it away.
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-[#4a4a4a]">
              Kashin is a private, local-first personal finance app that connects to your banks
              via Akahu. It runs on your own machine, keeps your data in a local file, and helps
              you budget, set goals, and review your spending.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="primary-button min-h-11 px-6" href="/setup">
                Set up locally
              </Link>
              <a
                className="inline-flex min-h-11 items-center border border-[#1c2b3a] px-6 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1a3a5c] transition hover:bg-[#1c2b3a] hover:text-white"
                href="https://github.com/devdass/kashin"
                target="_blank"
                rel="noreferrer"
              >
                View on GitHub
              </a>
            </div>
          </div>
          <div className="border border-[#c8bea8] bg-[#faf7f0] p-6">
            <div className="flex items-baseline justify-between gap-2">
              <p className="meta-label">This week</p>
              <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[#9a9a9a]">week 36</span>
            </div>
            <p className="mt-3 font-serif text-4xl font-bold text-[#1c2b3a]">$1,240</p>
            <div className="mt-4 h-1.5 bg-[#f0ebe0]">
              <div className="h-full w-[83%] bg-[#1a3a5c]" />
            </div>
            <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.05em] text-[#7a7a7a]">
              $1,240 of $1,500 budgeted
            </p>
            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: "#78c091" }} /><div><p className="meta-label">Groceries</p><p className="serif-amount mt-0.5 text-lg">$286</p></div></div>
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: "#f28c52" }} /><div><p className="meta-label">Eating out</p><p className="serif-amount mt-0.5 text-lg">$142</p></div></div>
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: "#e7aa18" }} /><div><p className="meta-label">Transport</p><p className="serif-amount mt-0.5 text-lg">$96</p></div></div>
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: "#e9637f" }} /><div><p className="meta-label">Bills</p><p className="serif-amount mt-0.5 text-lg">$310</p></div></div>
            </div>
            <div className="double-rule mt-6" />
            <p className="mt-4 font-mono text-[9px] uppercase leading-5 tracking-[0.06em] text-[#9a9a9a]">
              Illustrative preview
              <br />Your dashboard reflects your own accounts and data.
            </p>
          </div>
        </section>

        <section className="mt-20">
          <p className="eyebrow">Features</p>
          <div className="mt-5 grid gap-px border border-[#c8bea8] bg-[#c8bea8] sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div className="bg-[#faf7f0] p-6" key={feature.title}>
                <p className="text-sm font-semibold text-[#1c2b3a]">{feature.title}</p>
                <p className="mt-2 text-sm leading-6 text-[#4a4a4a]">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20">
          <p className="eyebrow">Get started in four steps</p>
          <div className="mt-5 grid gap-px border border-[#c8bea8] bg-[#c8bea8] md:grid-cols-2">
            {steps.map((item) => (
              <div className="bg-[#faf7f0] p-6" key={item.step}>
                <div className="flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center border border-[#1c2b3a] font-mono text-[11px] font-semibold text-[#1c2b3a]">
                    {item.step}
                  </span>
                  <p className="text-sm font-semibold text-[#1c2b3a]">{item.title}</p>
                </div>
                {"code" in item && item.code ? (
                  <pre className="mt-4 overflow-x-auto bg-[#1c2b3a] p-4 font-mono text-[11px] leading-5 text-white/90">
                    {item.code}
                  </pre>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-[#4a4a4a]">{item.body}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20 border border-[#c8bea8] bg-[#faf7f0] p-8 text-center">
          <p className="font-serif text-2xl font-bold text-[#1c2b3a]">Get your numbers back.</p>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#4a4a4a]">
            Kashin is free and open source. Clone the repo, run it locally, and connect your own
            Akahu tokens. Need help? Read the README on GitHub.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link className="primary-button min-h-11 px-6" href="/setup">
              Set up locally
            </Link>
            <a
              className="inline-flex min-h-11 items-center border border-[#1c2b3a] px-6 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1a3a5c] transition hover:bg-[#1c2b3a] hover:text-white"
              href="https://github.com/devdass/kashin"
              target="_blank"
              rel="noreferrer"
            >
              Read the README
            </a>
          </div>
        </section>

        <footer className="mt-16 pb-10 pt-6">
          <div className="double-rule" />
          <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-[#9a9a9a]">
            Kashin · local-first personal finance for Akahu · open source
          </p>
        </footer>
      </div>
    </main>
  );
}