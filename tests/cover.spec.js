const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, workspaceRow, waitForPicker } = require('./helpers');

// Dated acting cover (People → Cover). Dates are relative to today, because the Cover view looks
// ahead from today. T+n below means n days from today.
//
// Ada leads Zanele (YAT) and Ben, who have no rows of their own and follow Ada's rota. Omar leads
// Kim (Senior Agent) and Pat (YAT, own rows, leave on T+5, acted for Omar 20-16 days ago and still
// carries the permanent "Acting Leader" label the old editor stamped). Ada is on leave T+2..T+4.

const PROJECT = 'Project A';
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function coverWorkspace() {
  const source = 'src-0';
  const person = (id, name, extra) => Object.assign({ person_id: id, full_name: name, home_department: PROJECT, source_id: source, authority_rank: 5, status: 'Active' }, extra);
  const rows = (id, name, start, end, leaveDays) => Array.from({ length: 28 }, (_, i) => {
    const n = i - 7, off = leaveDays.includes(n);
    return { schedule_id: `s-${id}-${i}`, person_id: id, person_name: name, department: PROJECT, source_id: source, date: iso(n),
      uk_start: off ? '' : start, uk_end: off ? '' : end, is_off: off, off_type: off ? 'LEAVE' : '', imported_at: '2026-01-20T00:00:00.000Z' };
  });
  return {
    schema: 'sync.northstar.canonical', version: 1, updated_at: new Date().toISOString(),
    sources: [{ source_id: source, source_name: 'People Hub.xlsx', department_name: PROJECT, loaded_at: '2026-01-20T00:00:00.000Z', sheets: 1, source_kind: 'peoplehub', authority_rank: 5 }],
    people: [
      person('p-ada', 'Ada Leader', { role_type: 'Team Leader', job_title: 'Team Leader', home_team: 'Ada Team' }),
      person('p-omar', 'Omar Reyes', { role_type: 'Team Leader', job_title: 'Team Leader', home_team: 'Omar Team' }),
      person('p-zan', 'Zanele Dube', { role_type: 'Agent', home_team: 'Ada Team', manager_name: 'Ada Leader', reports_to_person_id: 'p-ada', labels: ['YAT'] }),
      person('p-ben', 'Ben Okafor', { role_type: 'Agent', home_team: 'Ada Team', manager_name: 'Ada Leader', reports_to_person_id: 'p-ada' }),
      person('p-kim', 'Kim Senior', { role_type: 'Agent', home_team: 'Omar Team', manager_name: 'Omar Reyes', reports_to_person_id: 'p-omar', labels: ['Senior Agent'] }),
      person('p-pat', 'Pat Ncube', { role_type: 'Agent', home_team: 'Omar Team', manager_name: 'Omar Reyes', reports_to_person_id: 'p-omar', labels: ['YAT', 'Acting Leader'], source_id: 'NS-BROWSER', authority_rank: 0, home_department: PROJECT, department_key: PROJECT }),
    ],
    acting: [{ acting_assignment_id: 'act-past', person_id: 'p-pat', person_name: 'Pat Ncube', acting_role: 'Acting Team Lead', acting_for_person_id: 'p-omar', starts: iso(-20), ends: iso(-16), status: 'Active', source_id: source, authority_rank: 5 }],
    schedule: [
      ...rows('p-ada', 'Ada Leader', '09:00', '17:30', [2, 3, 4]),
      ...rows('p-omar', 'Omar Reyes', '08:00', '16:30', []),
      ...rows('p-pat', 'Pat Ncube', '08:00', '16:30', [5]),
    ],
  };
}

async function openCoverProject(page) {
  await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(coverWorkspace()) });
  await page.evaluate(() => window.__fakeSupabase.signIn());
  await waitForPicker(page);
  await page.evaluate((name) => _syncOpenProject(name), PROJECT);
  await page.waitForFunction(() => S.entries.length > 0 && S.people['Zanele Dube'] && S.people['Zanele Dube'].personId);
  await expect(page.locator('#syncBoot')).toHaveCount(0);
}
const book = (page, who, forName, from, to) => page.evaluate(([a, b, c, d]) => coverAssign(a, b, c, d, 'Acting Team Lead'), [who, forName, from, to]);

test.describe('dated acting cover', () => {
  test('acting and the team leader change on the first day of cover and revert the day after it ends', async ({ page }) => {
    await openCoverProject(page);
    expect(await book(page, 'Zanele Dube', 'Ada Leader', iso(2), iso(6))).toBeTruthy();
    const got = await page.evaluate((days) => days.map((d) => [!!actingOn('Zanele Dube', d), leaderOn('Ben Okafor', d).name]), [iso(1), iso(2), iso(6), iso(7)]);
    expect(got).toEqual([[false, 'Ada Leader'], [true, 'Zanele Dube'], [true, 'Zanele Dube'], [false, 'Ada Leader']]);
    // Cover starts in two days, so today nobody is labelled acting.
    expect(await page.evaluate(() => peopleRoleLabels('Zanele Dube'))).toEqual(['YAT']);

    // The Schedule Window shows it on exactly those dates.
    await page.evaluate(([a, b]) => openScheduleWindow('Ben Okafor', { mode: 'custom', from: a, to: b }), [iso(0), iso(8)]);
    await expect(page.locator(`#swinTable tr[data-iso="${iso(2)}"]`)).toContainText('Led by Zanele');
    await expect(page.locator(`#swinTable tr[data-iso="${iso(6)}"]`)).toContainText('Led by Zanele');
    await expect(page.locator(`#swinTable tr[data-iso="${iso(1)}"]`)).not.toContainText('Led by');
    await expect(page.locator(`#swinTable tr[data-iso="${iso(7)}"]`)).not.toContainText('Led by');
    await expect(page.locator('.swin-cover')).toContainText('Led by Zanele Dube (acting for Ada Leader)');
    // Ada's leave is not Ben's: the rota he follows has no shift for him while she is away.
    await expect(page.locator(`#swinTable tr[data-iso="${iso(3)}"]`)).toHaveAttribute('data-kind', 'none');
    await expect(page.locator(`#swinTable tr[data-iso="${iso(3)}"]`)).toContainText('TL away');
    await page.evaluate(([a, b]) => openScheduleWindow('Zanele Dube', { mode: 'custom', from: a, to: b }), [iso(0), iso(8)]);
    await expect(page.locator(`#swinTable tr[data-iso="${iso(4)}"]`)).toContainText('Acting for Ada');
    await expect(page.locator(`#swinTable tr[data-iso="${iso(7)}"]`)).not.toContainText('Acting for');
    expect(page.__jsErrors).toEqual([]);
  });

  test('cover active today shows the acting label; an old permanent label goes once the cover has ended', async ({ page }) => {
    await openCoverProject(page);
    // Pat carries a stored "Acting Leader" label, but the only dated record ended 16 days ago.
    expect(await page.evaluate(() => [peopleRoleLabels('Pat Ncube'), peopleIsActing('Pat Ncube')])).toEqual([['YAT'], false]);
    await book(page, 'Kim Senior', 'Omar Reyes', iso(0), iso(1));
    expect(await page.evaluate(() => [peopleRoleLabels('Kim Senior'), peopleIsActing('Kim Senior'), leaderOn('Pat Ncube').name])).toEqual([['Senior Agent', 'Acting Leader'], true, 'Kim Senior']);
    const id = await page.evaluate(() => nsActingRows().find((r) => r.personName === 'Kim Senior').id);
    await page.evaluate((x) => coverCancel(x), id);
    expect(await page.evaluate(() => [peopleRoleLabels('Kim Senior'), leaderOn('Pat Ncube').name])).toEqual([['Senior Agent'], 'Omar Reyes']);
  });

  test('a leader away without cover is flagged, and the suggestions rank who should cover', async ({ page }) => {
    await openCoverProject(page);
    await page.evaluate(() => railNavPeople('cover'));
    const gap = page.locator('#covGaps .cov-gap');
    await expect(gap).toHaveCount(1);
    await expect(gap).toHaveAttribute('data-leader', 'Ada Leader');
    await expect(gap).toHaveAttribute('data-from', iso(2));
    await expect(gap).toContainText('Leave · 2 people in the team');
    await gap.getByRole('button', { name: 'Suggest cover' }).click();
    // Zanele: on the team, YAT, never acted. Ben: on the team. Kim: Senior Agent, most of Ada's hours.
    // Pat: YAT but has acted before. Omar: leads his own team.
    await expect(page.locator('.cov-sugg li')).toHaveCount(5);
    expect(await page.locator('.cov-sugg li').evaluateAll((els) => els.map((e) => e.dataset.name))).toEqual(['Zanele Dube', 'Ben Okafor', 'Kim Senior', 'Pat Ncube', 'Omar Reyes']);
    await expect(page.locator('.cov-sugg li').first()).toContainText('Works all 3 days');
    await expect(page.locator('.cov-sugg li').nth(2)).toContainText("88% of Ada's hours");
    await expect(page.locator('.cov-sugg li').nth(3)).toContainText('acted 5 days in 6 months');

    await page.locator('.cov-sugg li').first().getByRole('button', { name: 'Assign' }).click();
    await expect(page.locator('#covGaps .cov-gap')).toHaveCount(0);
    // Pat's cover that ended 16 days ago stays listed (ended) next to the new booking.
    await expect(page.locator('#covBooked tbody tr')).toHaveCount(2);
    await expect(page.locator('#covBooked tbody tr', { hasText: 'Zanele Dube' }).locator('.cov-state')).toHaveText('upcoming');
    await expect(page.locator('#covBooked tbody tr', { hasText: 'Pat Ncube' }).locator('.cov-state')).toHaveText('ended');
    // The register counts the booking; Pat's past cover shows under teams covered.
    await expect(page.locator('#covPool tr[data-name="Pat Ncube"]')).toContainText('Omar Reyes');
    await expect(page.locator('#covPool tr[data-name="Zanele Dube"]')).toContainText('Covers Ada Leader');

    // Team view and Day view say who covers.
    await page.evaluate(() => { S.peopleSubTab = 'team'; S.selectedTL = 'Ada Leader'; rPeople($('ca')); });
    await expect(page.locator('[data-testid="cover-banner"]').first()).toContainText('Cover booked for Ada: Zanele Dube');
    await page.evaluate((d) => {
      const day = new Date(d + 'T00:00:00');
      // Month keys are "YYYY-MM" with a 0-based month.
      S.calSubTab = 'day'; S.calDay = day; S.month = day.getFullYear() + '-' + String(day.getMonth()).padStart(2, '0');
      setTab('calendar'); ren();
    }, iso(3));
    await expect(page.locator('.cover-tag', { hasText: 'covered by Zanele' })).toBeVisible();
    expect(page.__jsErrors).toEqual([]);
  });

  test('clashes: double booking, no end date, and the acting person away during the cover', async ({ page }) => {
    await openCoverProject(page);
    await book(page, 'Zanele Dube', 'Ada Leader', iso(2), iso(4));
    await book(page, 'Kim Senior', 'Ada Leader', iso(3), iso(5));
    await book(page, 'Pat Ncube', 'Omar Reyes', iso(4), iso(6));
    await page.evaluate((d) => coverAssign('Ben Okafor', 'Omar Reyes', d, '', 'Acting Team Lead'), iso(10));
    await page.evaluate(() => railNavPeople('cover'));
    const clash = (kind) => page.locator(`#covClashes .cov-clash[data-kind="${kind}"]`);
    await expect(clash('double')).toContainText('Zanele Dube and Kim Senior are both booked to cover Ada Leader');
    await expect(clash('open')).toContainText('Ben Okafor is covering Omar Reyes with no end date');
    await expect(clash('away')).toContainText('Pat Ncube is not available for part of the cover for Omar Reyes');
    await expect(clash('away')).toContainText('(Leave)');
  });

  test('booking from the form stages a NorthStar record; bad input is refused', async ({ page }) => {
    await openCoverProject(page);
    await page.evaluate(() => railNavPeople('cover'));
    await page.locator('#covPerson').selectOption('Kim Senior');
    await page.locator('#covFor').selectOption('Kim Senior');
    await page.locator('#covSave').click();
    // Refused: covering yourself. Only Pat's ended cover is listed.
    await expect(page.locator('#covBooked tbody tr')).toHaveCount(1);
    expect(await page.evaluate(() => nsActingRows().some((r) => r.personName === 'Kim Senior'))).toBe(false);

    await page.locator('#covFor').selectOption('Omar Reyes');
    await page.locator('#covFrom').fill(iso(8));
    await page.locator('#covFrom').dispatchEvent('change');
    await page.locator('#covTo').fill(iso(9));
    await page.locator('#covTo').dispatchEvent('change');
    await page.locator('#covSave').click();
    await expect(page.locator('#covBooked tbody tr', { hasText: 'Kim Senior' })).toHaveCount(1);
    const rec = await page.evaluate(() => nsActingRows().find((r) => r.personName === 'Kim Senior'));
    expect([rec.forName, rec.starts, rec.ends, rec.status]).toEqual(['Omar Reyes', iso(8), iso(9), 'Active']);
    expect(await page.evaluate(() => S.nsCanonical.publishQueue.some((q) => q.status === 'pending' && /Acting/.test(q.record_key)))).toBe(true);

    await page.locator('#covPool tr[data-name="Kim Senior"] .cov-ready').fill('Ready for TL cover, needs WFM training');
    await page.locator('#covPool tr[data-name="Kim Senior"] .cov-ready').dispatchEvent('change');
    expect(await page.evaluate(() => [S.people['Kim Senior'].readiness, S.nsCanonical.people.find((p) => p.person_id === 'p-kim').readiness_notes])).toEqual(['Ready for TL cover, needs WFM training', 'Ready for TL cover, needs WFM training']);
  });
});
