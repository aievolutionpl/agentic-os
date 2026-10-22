import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Store } from "./store.js";
import type { Project } from "../shared.js";
import { canonical, git, gitText } from "./git.js";

export async function createDemoProject(
  store: Store,
  userData: string,
  language: "pl" | "en" = "pl",
): Promise<Project> {
  const pl = language === "pl";
  const baseDir = join(userData, "demo-projects");
  mkdirSync(baseDir, { recursive: true });
  const slug = `pricing-demo-${randomUUID().slice(0, 8)}`;
  const repoDir = join(baseDir, slug);
  mkdirSync(join(repoDir, "src"), { recursive: true });
  mkdirSync(join(repoDir, "tests"), { recursive: true });

  await git(baseDir, ["init", "--", repoDir]);

  writeFileSync(
    join(repoDir, "README.md"),
    pl
      ? `# Demo · Kalkulator rabatów\n\nPrzykładowe repozytorium treningowe utworzone przez **Agenting OS**.\n\n## Cel zadania\nSprawdź funkcję \`applyDiscount\` w \`src/pricing.js\`, popraw błąd obliczania rabatu i uruchom \`node --test\`.\n`
      : `# Demo · Discount Calculator\n\nSample training repository created by **Agenting OS**.\n\n## Task goal\nInspect \`applyDiscount\` in \`src/pricing.js\`, fix the discount formula bug, and run \`node --test\`.\n`,
  );

  writeFileSync(
    join(repoDir, "src", "pricing.js"),
    `/**
 * Calculates the final price after a percentage discount.
 * @param {number} price - Base price (>= 0)
 * @param {number} discountPercent - Discount between 0 and 100
 */
export function applyDiscount(price, discountPercent) {
  if (price < 0 || discountPercent < 0 || discountPercent > 100) {
    throw new RangeError("INVALID_DISCOUNT_INPUT");
  }
  // BUG: adds the discount instead of subtracting it
  const discounted = price * (1 + discountPercent / 100);
  return Math.round(discounted * 100) / 100;
}
`,
  );

  writeFileSync(
    join(repoDir, "tests", "pricing.test.mjs"),
    `import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDiscount } from "../src/pricing.js";

test("applies 20% discount to 100.00 -> 80.00", () => {
  assert.equal(applyDiscount(100, 20), 80);
});

test("rejects out-of-range discounts", () => {
  assert.throws(() => applyDiscount(100, 120), /INVALID_DISCOUNT_INPUT/);
});
`,
  );

  writeFileSync(
    join(repoDir, "package.json"),
    JSON.stringify(
      {
        name: slug,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
          test: "node --test tests/*.test.mjs",
        },
      },
      null,
      2,
    ) + "\n",
  );

  await git(repoDir, ["add", "--all"]);
  const tree = await gitText(repoDir, "write-tree");
  const commit = await gitText(
    repoDir,
    "commit-tree",
    tree,
    "-m",
    "Initial demo repository with discount bug",
  );
  await git(repoDir, ["update-ref", "HEAD", commit]);

  const root = canonical(repoDir);
  const project = store.createProject({
    name: pl ? "Demo · Kalkulator rabatów" : "Demo · Discount Calculator",
    root,
    master: "codex",
  });

  store.createMemory({
    projectId: project.id,
    content: pl
      ? "Konwencja projektu: funkcja applyDiscount(price, discountPercent) musi odejmować procent rabatu od ceny bazowej i zaokrąglać wynik do 2 miejsc po przecinku. Testy uruchamiamy przez node --test."
      : "Project convention: applyDiscount(price, discountPercent) must subtract the discount percentage from the base price and round to 2 decimal places. Run tests via node --test.",
    source: pl ? "Specyfikacja demo" : "Demo specification",
    scope: "project",
  });

  store.createTask({
    projectId: project.id,
    title: pl
      ? "Napraw obliczanie rabatu w src/pricing.js, aby test w tests/pricing.test.mjs przechodził poprawnie"
      : "Fix discount calculation in src/pricing.js so tests/pricing.test.mjs passes",
    implementer: "codex",
    reviewer: "claude",
  });

  return project;
}
