// Capture real Electron UI using a disposable profile and synthetic content.
// Run after npm run build. No provider task or external tool is executed.
import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Store } from '../dist/main/store.js';

const output = resolve(process.env.AGENTING_GALLERY_OUTPUT || 'docs/images/rc3');
mkdirSync(output, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'agenting-gallery-'));
const root = join(profile, 'Studio-produktu');
mkdirSync(root);
const store = new Store(join(profile, 'agenting.sqlite'));
store.setPreferences({ language: 'pl', theme: 'codex' });
const project = store.createProject({ name: 'Studio produktu', root, master: 'codex' });
store.createMemory({ projectId: project.id, content: 'Kierunek projektu\nCzytelna rozmowa, sześć motywów i dostęp do wiedzy zespołu.', source: 'Decyzja projektowa', scope: 'project' });
store.createMemory({ projectId: project.id, content: 'Plan premiery\nSprawdzić interfejs, przygotować dokumentację i opublikować wersję preview.', source: 'Plan pracy', scope: 'project' });
store.chats.save({ id: randomUUID(), title: 'Plan premiery', projectId: project.id, agent: 'codex', mode: 'chat', source: 'local', root, workspace: root, status: 'idle', messages: [
  { id: randomUUID(), role: 'user', content: 'Pomóż uporządkować plan premiery aplikacji.', at: Date.UTC(2026, 9, 24, 10), status: 'complete' },
  { id: randomUUID(), role: 'assistant', content: '## Plan premiery\n\n1. **Interfejs** — sprawdź czytelność logo i układ na mniejszych ekranach.\n2. **Dokumentacja** — dodaj aktualną galerię oraz instrukcję instalacji.\n3. **Wydanie** — uruchom testy, zbuduj instalator i zapisz sumę SHA-256.\n\nTo przykładowa rozmowa przygotowana do galerii interfejsu.', at: Date.UTC(2026, 9, 24, 10, 1), status: 'complete' },
], contextIds: [], skillIds: [], activity: [], error: null, updatedAt: Date.now() });
store.close();
const env = { ...process.env, AGENTING_DATA_DIR: profile, CLAUDE_CONFIG_DIR: join(profile, 'claude') };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [resolve('.')], env });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('main[aria-busy="false"]').waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  async function capture(name) {
    const dismiss = page.locator('.toast button');
    if (await dismiss.isVisible()) await dismiss.click();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.app-logo-crop img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: join(output, name + '.png'), animations: 'disabled' });
  }
  async function theme(label) {
    await page.getByRole('button', { name: 'Kolorystyka', exact: true }).click();
    await page.getByRole('option', { name: label, exact: true }).click();
  }
  await capture('chat');
  await theme('Pure White');
  await capture('pure-white');
  await theme('Light Orange');
  await capture('light-orange');
  await theme('AI Evolution');
  await page.getByRole('button', { name: 'Plan premiery', exact: true }).click();
  await page.getByText('To przykładowa rozmowa przygotowana do galerii interfejsu.', { exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await capture('conversation');
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [label, name] of [['Skille', 'skills'], ['Pluginy', 'plugins'], ['Pamięć', 'memory'], ['ScheduleJob', 'schedule']]) {
    await page.locator('.primary-nav').getByRole('button', { name: label, exact: true }).click();
    await page.locator('main[aria-busy="false"]').waitFor();
    if (name === 'memory') await page.locator('.graph-node.memory').first().waitFor();
    if (name === 'skills') await page.locator('.skill-library article').first().waitFor();
    await capture(name);
  }
  await page.getByRole('button', { name: 'Ustawienia', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Ustawienia', exact: true }).waitFor();
  await capture('settings');
  await page.getByRole('button', { name: 'Agenci i modele', exact: true }).click();
  await page.locator('.provider-card').first().waitFor();
  await capture('agents');
  await page.getByRole('button', { name: 'Nowa rozmowa', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 1000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await capture('mobile');
  assert.deepEqual(errors, []);
  console.log('PASS: 11 gallery screenshots captured from Electron with synthetic data');
} finally { await app.close(); }
