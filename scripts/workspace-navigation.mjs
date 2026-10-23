export async function navigateWorkspace(page, name) {
  if (await page.locator('.projects-toggle').isVisible() && !(await page.locator('.project-sidebar').isVisible())) await page.locator('.projects-toggle').click();
  if (name === 'Połączenia i modele') {
    await page.getByRole('button', {name:'Ustawienia',exact:true}).first().click();
    await page.getByRole('button', {name:'Agenci i modele',exact:true}).click();
    return;
  }
  const names = {'Czaty':'Rozmowy','Centrum dowodzenia':'Projekty','Wspólna pamięć':'Pamięć','Biblioteka skilli':'Skille','Praca i pytania':'Zadania','Limity i tokeny':'Limity'};
  const target = page.locator('.primary-nav').getByRole('button',{name:names[name] || name,exact:true});
  if (!(await target.isVisible())) await page.locator('.nav-more > summary').click();
  await target.click();
  if (name === 'Centrum dowodzenia') await page.locator('.system-details > summary').click();
}
export async function chooseTheme(page, theme) {
  await page.locator('.top-theme-picker > button').click();
  await page.locator('.top-theme-picker').getByRole('option',{name:theme,exact:true}).click();
}
