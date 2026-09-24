const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, workspaceRow, waitForPicker } = require('./helpers');

// People-view edits on project people. S.people is a runtime copy: nsSyncPeopleToRuntime maps the
// canonical people back over it on every NorthStar editor save, import, restore and cloud load. The
// People views used to change S.people alone, so a team leader move was reverted the next time
// anyone saved a person in Ops > Organisation, and a removed label came straight back (labels were
// unioned). They now write through to the canonical person.

const PROJECT = 'Project A';

// One imported people source: two leaders, two agents reporting to Lena, one with no leader. The
// People views need a schedule to render, so everyone has a week of shifts.
function orgWorkspace() {
  const source = 'src-0';
  const person = (id, name, extra) => Object.assign({ person_id: id, full_name: name, home_department: PROJECT, source_id: source, authority_rank: 5, status: 'Active' }, extra);
  const shifts = (id, name) => Array.from({ length: 5 }, (_, day) => ({
    schedule_id: `s-${id}-${day}`, person_id: id, person_name: name, department: PROJECT, source_id: source,
    date: `2026-02-0${day + 2}`, uk_start: '09:00', uk_end: '17:00', is_off: false, imported_at: '2026-01-20T00:00:00.000Z',
  }));
  return {
    schema: 'sync.northstar.canonical',
    version: 1,
    updated_at: new Date().toISOString(),
    sources: [{ source_id: source, source_name: 'People Hub.xlsx', department_name: PROJECT, loaded_at: '2026-01-20T00:00:00.000Z', sheets: 1, source_kind: 'peoplehub', authority_rank: 5 }],
    people: [
      person('p-lena', 'Lena Hart', { role_type: 'Team Leader', job_title: 'Team Leader', home_team: 'Hart Team' }),
      person('p-omar', 'Omar Reyes', { role_type: 'Team Leader', job_title: 'Team Leader', home_team: 'Reyes Team' }),
      person('p-amy', 'Amy Patel', { role_type: 'Agent', home_team: 'Hart Team', manager_name: 'Lena Hart', reports_to_person_id: 'p-lena', labels: ['YAT', 'SME'] }),
      person('p-ben', 'Ben Okafor', { role_type: 'Agent', home_team: 'Hart Team', manager_name: 'Lena Hart', reports_to_person_id: 'p-lena' }),
      person('p-cal', 'Cal Burns', { role_type: 'Agent', home_team: 'Hart Team' }),
    ],
    schedule: [['p-lena', 'Lena Hart'], ['p-omar', 'Omar Reyes'], ['p-amy', 'Amy Patel'], ['p-ben', 'Ben Okafor'], ['p-cal', 'Cal Burns']].flatMap(([id, name]) => shifts(id, name)),
  };
}

async function signedInWith(page, row) {
  await openApp(page, { profile: PROFILE, workspaceRow: row });
  await page.evaluate(() => window.__fakeSupabase.signIn());
  await waitForPicker(page);
}

const openProject = (page) => page.evaluate((name) => _syncOpenProject(name), PROJECT);

// The three edits, each through the control that makes it.
async function editInPeopleViews(page) {
  // People > Team: the "assign" select on the agent with no leader.
  await page.evaluate(() => { S.peopleSubTab = 'team'; setTab('people'); });
  await page.locator('#ca select:has(option:text-is("— assign —"))').selectOption('Omar Reyes');
  // The "Add agents" box on Omar: moves Ben, who already reports to Lena.
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.innerHTML = renderPeopleAgentAddBox('Omar Reyes', 'test');
    document.body.appendChild(host);
    host.querySelector('textarea').value = 'Ben Okafor';
    host.querySelector('button').click();
    host.remove();
  });
  // Role labels: drop YAT from Amy.
  await page.evaluate(() => openPeopleRoleLabelsModal('Amy Patel'));
  const modal = page.locator('#peopleRoleLabels');
  await modal.locator('input[value="YAT"]').uncheck();
  await modal.getByRole('button', { name: 'Save labels' }).click();
  await expect(modal).toHaveCount(0);
}

// Saving somebody else in Ops > Organisation runs the full canonical → runtime mapping.
async function saveLenaInNorthStarEditor(page) {
  await page.evaluate(() => nsOpenPersonEditor('p-lena'));
  const editor = page.locator('#nsPersonEditor');
  await editor.locator('#nsPersonNotes').fill('Saved from Organisation');
  await editor.getByRole('button', { name: 'Save person' }).click();
  await expect(editor).toHaveCount(0);
}

const runtime = (page) => page.evaluate(() => ({
  cal: S.people['Cal Burns'] && S.people['Cal Burns'].teamLeader,
  ben: S.people['Ben Okafor'] && S.people['Ben Okafor'].teamLeader,
  amy: peopleRoleLabels('Amy Patel').sort(),
}));
const canonical = (page) => page.evaluate(() => {
  const byId = Object.fromEntries(nsCanonical().people.map((p) => [p.person_id, p]));
  return {
    cal: [byId['p-cal'].manager_name, byId['p-cal'].reports_to_person_id],
    ben: [byId['p-ben'].manager_name, byId['p-ben'].reports_to_person_id],
    amy: byId['p-amy'].labels.slice().sort(),
  };
});

const EDITED = { cal: 'Omar Reyes', ben: 'Omar Reyes', amy: ['SME'] };
const EDITED_CANONICAL = { cal: ['Omar Reyes', 'p-omar'], ben: ['Omar Reyes', 'p-omar'], amy: ['SME'] };

test.describe('People-view edits on project people', () => {
  test('are written through to the canonical person', async ({ page }) => {
    await signedInWith(page, workspaceRow(orgWorkspace()));
    await openProject(page);
    expect(await runtime(page)).toEqual({ cal: '', ben: 'Lena Hart', amy: ['SME', 'YAT'] });

    await editInPeopleViews(page);
    expect(await runtime(page)).toEqual(EDITED);
    expect(await canonical(page)).toEqual(EDITED_CANONICAL);
    const ben = await page.evaluate(() => nsCanonical().people.find((p) => p.person_id === 'p-ben'));
    expect(ben).toMatchObject({ source_id: 'NS-BROWSER', authority_rank: 0, home_team: 'Reyes Team', sync_status: 'Staged' });
    expect(ben.last_modified_utc).toBeTruthy();
    // Staged for write-back like an Organisation edit, once per person.
    const staged = await page.evaluate(() => nsCanonical().publishQueue.filter((q) => q.status === 'pending' && q.record_type === 'People').map((q) => q.record_id).sort());
    expect(staged).toEqual(['p-amy', 'p-ben', 'p-cal']);
    expect(page.__jsErrors).toEqual([]);
  });

  test('survive saving another person in the NorthStar editor, and a reload', async ({ page }) => {
    await signedInWith(page, workspaceRow(orgWorkspace()));
    await openProject(page);
    await editInPeopleViews(page);

    await saveLenaInNorthStarEditor(page);
    expect(await runtime(page)).toEqual(EDITED);
    expect(await canonical(page)).toEqual(EDITED_CANONICAL);

    await page.waitForTimeout(600); // IndexedDB and the people store both write on a debounce
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NorthStar && window.NorthStar.bootSettled, null, { timeout: 20_000 });
    await openProject(page);
    expect(await runtime(page)).toEqual(EDITED);
    expect(await canonical(page)).toEqual(EDITED_CANONICAL);
    // And the mapping still leaves them alone after the reload.
    await saveLenaInNorthStarEditor(page);
    expect(await runtime(page)).toEqual(EDITED);
    expect(page.__jsErrors).toEqual([]);
  });

  test('reach a second device through the cloud save and survive its next NorthStar sync', async ({ page, browser }) => {
    await signedInWith(page, workspaceRow(orgWorkspace()));
    await openProject(page);
    await editInPeopleViews(page);
    // The people store writes on a short debounce, and Save here reads storage without flushing it
    // first (se7vxn-bit-samurai/sync#8 adds that flush). The canonical copy is read from memory.
    await page.evaluate(() => _flushPersistQueue());
    expect(await page.evaluate(() => _syncManualSave())).toBe(true);
    const row = await page.evaluate(() => window.__fakeSupabase.state.cfg.workspaceRow);

    const other = await (await browser.newContext()).newPage();
    await signedInWith(other, row);
    await openProject(other);
    expect(await runtime(other)).toEqual(EDITED);
    expect(await canonical(other)).toEqual(EDITED_CANONICAL);
    await saveLenaInNorthStarEditor(other);
    expect(await runtime(other)).toEqual(EDITED);
    expect(await canonical(other)).toEqual(EDITED_CANONICAL);
    expect(other.__jsErrors).toEqual([]);
  });

  test('a person who is not in the project stays a runtime-only edit', async ({ page }) => {
    await signedInWith(page, workspaceRow(orgWorkspace()));
    await openProject(page);
    const before = await page.evaluate(() => JSON.stringify(nsCanonical().people));
    await page.evaluate(() => {
      S.people['Dee Walsh'] = { name: 'Dee Walsh', role: 'agent', teamLeader: '' };
      peopleAssignTeamLeader('Dee Walsh', 'Omar Reyes');
      peopleSetRoleLabels('Dee Walsh', ['Trainer']);
    });
    expect(await page.evaluate(() => S.people['Dee Walsh'].teamLeader)).toBe('Omar Reyes');
    expect(await page.evaluate(() => JSON.stringify(nsCanonical().people))).toBe(before);
  });
});

test.describe('opening a project', () => {
  test('fills S.people from the project, keeping what is already there', async ({ page }) => {
    await signedInWith(page, workspaceRow(orgWorkspace()));
    await page.evaluate(() => { S.people = { 'Amy Patel': { name: 'Amy Patel', role: 'agent', teamLeader: 'Kept Leader' } }; });
    await openProject(page);
    const people = await page.evaluate(() => S.people);
    expect(Object.keys(people).sort()).toEqual(['Amy Patel', 'Ben Okafor', 'Cal Burns', 'Lena Hart', 'Omar Reyes']);
    expect(people['Amy Patel'].teamLeader).toBe('Kept Leader');
    expect(people['Ben Okafor']).toMatchObject({ role: 'agent', teamLeader: 'Lena Hart', team: 'Hart Team' });
    // Filling the runtime copy from the loaded project is not an edit.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sc_cloud_sync') || '{}').dirty)).toBe(false);
  });

  test('a new sample project opens with its people', async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => window.NorthStar && window.NorthStar.bootSettled, null, { timeout: 20_000 });
    await page.evaluate(() => _syncCreateSampleProject());
    const names = await page.evaluate(() => Object.keys(S.people).sort());
    expect(names).toEqual(['Amara Okafor', 'Ben Sorensen', 'Chloe Duarte', 'Dmitri Volkov', 'Esi Mensah', 'Farid Haddad']);
  });
});
