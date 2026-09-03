// Generate mock (clearly fictional) product screenshots — NO real data.
const { chromium } = require("/usr/lib/node_modules/playwright/index.js");
const { execFileSync } = require("child_process");
const fs = require("fs");
const BASE = "http://127.0.0.1:3140";
const DB = "/tmp/opencode/mock-data/app.db";
const OUT = "/root/kashin/public/screenshots";
fs.mkdirSync(OUT, { recursive: true });
const q = (sql) => execFileSync("sqlite3", [DB, sql], { encoding: "utf8" });

(async () => {
  const browser = await chromium.launch({ args: ["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"] });

  // 1. Create account via the app
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let page = await ctx.newPage();
  await page.goto(`${BASE}/setup`, { waitUntil: "networkidle" });
  if (await page.locator('input[name="passwordConfirmation"]').count()) {
    await page.fill('input[name="password"]', "mock-pass-12345678");
    await page.fill('input[name="passwordConfirmation"]', "mock-pass-12345678");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
  }

  // 2. Seed fictional categories
  const cats = [
    ["groceries", "Groceries", "#78c091"], ["eating-out", "Eating out", "#f28c52"],
    ["bills", "Bills", "#e9637f"], ["transport", "Transport", "#e7aa18"],
    ["shopping", "Shopping", "#dc82ac"], ["health", "Health", "#8a6fa8"],
    ["income", "Income", "#2f8f5b"], ["other", "Other", "#9a9a93"],
  ];
  const now = new Date().toISOString();
  cats.forEach(([id, name, color], i) => {
    q(`INSERT INTO categories (id, name, section, color, sort_order, created_at, updated_at) VALUES ('${id}','${name}','PERSONAL','${color}',${i+1},'${now}','${now}');`);
  });
  q("INSERT INTO finance_settings (key, value, updated_at) VALUES ('onboarding_complete','1',datetime('now'));");

  // 3. Seed fictional accounts
  q(`INSERT INTO cached_accounts (id,name,institution,type,status,formatted_account,currency,current_balance,attributes_json,synced_at)
     VALUES ('acc1','Everyday','Demo Bank','CHECKING','ACTIVE','01-2345-6789012-00','NZD',4120.55,'["TRANSACTIONS"]','${now}');`);
  q(`INSERT INTO cached_accounts (id,name,institution,type,status,formatted_account,currency,current_balance,attributes_json,synced_at)
     VALUES ('acc2','Savings','Demo Bank','SAVINGS','ACTIVE','01-2345-6789013-01','NZD',8200.10,'["TRANSACTIONS"]','${now}');`);
  q(`INSERT INTO cached_accounts (id,name,institution,type,status,formatted_account,currency,current_balance,attributes_json,synced_at)
     VALUES ('acc3','Rewards Card','Demo Bank','CREDITCARD','ACTIVE','01-2345-6789014-02','NZD',-1240.00,'["TRANSACTIONS"]','${now}');`);

  // 4. Seed fictional transactions (clearly fake merchants) over the last ~5 weeks
  const merchants = [
    ["groceries", "Fresh Market Supermarket", -86.20], ["groceries", "Corner Mart", -24.15],
    ["eating-out", "Sunny Cafe", -18.50], ["eating-out", "Burger Joint", -22.80],
    ["bills", "PowerCo Electricity", -145.00], ["bills", "HomeFibre Internet", -89.00],
    ["transport", "CityFuel", -55.20], ["transport", "Bus Pass", -45.00],
    ["shopping", "Modern Apparel", -78.40], ["shopping", "Book Nook", -32.00],
    ["health", "Wellness Pharmacy", -14.90], ["health", "CityFit Gym", -45.00],
    ["income", "Acme Payroll", 4200.00],
  ];
  let n = 0;
  const txs = [];
  for (let day = 0; day < 35; day++) {
    // add a couple of transactions per day
    const shuffled = [...merchants].sort(() => 0.5 - Math.random()).slice(0, 2);
    for (const [cat, desc, amt] of shuffled) {
      const d = new Date(Date.now() - day * 86400000);
      const iso = d.toISOString().replace("T", " ").slice(0, 10) + " 12:00:00";
      const catId = cat === "income" ? "income" : cat;
      txs.push(`('tx${n++}','acc1','${iso}','${desc}',${amt},'EFTPOS','${desc}','${desc.toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}','${catId}','${catId==='income'?'SPECIAL_RULE':'VENDOR'}',0.95,1,'${now}')`);
    }
  }
  // batch insert
  for (let i = 0; i < txs.length; i += 100) {
    const batch = txs.slice(i, i + 100).join(",");
    q(`INSERT INTO cached_transactions (id,account_id,date,description,amount,type,merchant,normalized_merchant,category_id,category_source,confidence,reviewed,synced_at) VALUES ${batch};`);
  }

  // 5. Seed goals + budgets
  q(`INSERT INTO goals (id,name,target_amount,current_amount,monthly_contribution,color,sort_order,updated_at) VALUES ('g1','Holiday fund',4000,1250,200,'#4f8de7',1,'${now}');`);
  q(`INSERT INTO goals (id,name,target_amount,current_amount,monthly_contribution,color,sort_order,updated_at) VALUES ('g2','Emergency fund',6000,1800,150,'#69f2bc',2,'${now}');`);
  q(`INSERT INTO budgets (category_id,monthly_limit,updated_at) VALUES ('groceries',400,'${now}'),('eating-out',250,'${now}'),('bills',300,'${now}'),('transport',200,'${now}'),('shopping',150,'${now}'),('health',100,'${now}');`);

  console.log("seeded:", q("SELECT COUNT(*) FROM cached_transactions").trim(), "txns");
  await ctx.close();

  // 5. Capture screenshots
  const vp = { width: 1440, height: 900 };
  const c2 = await browser.newContext({ viewport: vp });
  page = await c2.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  if (await page.locator('input[name="password"]').count()) {
    await page.fill('input[name="password"]', "mock-pass-12345678");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
  }
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/dashboard.png`, fullPage: true });
  console.log("dashboard.png");
  await page.goto(`${BASE}/budget`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/budget.png`, fullPage: true });
  console.log("budget.png");
  await page.goto(`${BASE}/activity`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/activity.png`, fullPage: true });
  console.log("activity.png");
  await browser.close();
  console.log("DONE");
})();