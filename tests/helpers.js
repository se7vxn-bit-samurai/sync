const { installFakeSupabase } = require('./fixtures/fake-supabase');

const PROFILE = {
  full_name: 'Test User',
  organization: 'Test Org',
  role: 'Planner',
  preferred_colorway: 'surge',
  continuation_pref: null,
};

/**
 * Builds a canonical workspace model containing `count` projects, in the shape
 * nsListCanonicalProjects() reads: a source per project, plus people and (optionally) schedule rows
 * tagged with the project's department name.
 */
function buildWorkspace(count, opts = {}) {
  const { peopleOnly = false, names = null, scheduleRowsPer = 3, peoplePer = 2 } = opts;
  const model = { schema: 'sync.northstar.canonical', version: 1, updated_at: new Date().toISOString(), sources: [], people: [], schedule: [] };
  for (let i = 0; i < count; i++) {
    const name = names && names[i] ? names[i] : `Project ${String.fromCharCode(65 + i)}`;
    const sourceId = `src-${i}`;
    // Older loaded_at for later projects, so ordering is deterministic before any open events.
    const loadedAt = new Date(Date.UTC(2026, 0, 20 - i)).toISOString();
    model.sources.push({ source_id: sourceId, source_name: `${name}.xlsx`, department_name: name, loaded_at: loadedAt, sheets: 2, source_kind: 'schedulehub' });
    for (let p = 0; p < peoplePer; p++) {
      model.people.push({ person_id: `p-${i}-${p}`, full_name: `${name} Person ${p + 1}`, home_department: name, source_id: sourceId });
    }
    if (!peopleOnly) {
      for (let r = 0; r < scheduleRowsPer; r++) {
        model.schedule.push({
          schedule_id: `s-${i}-${r}`,
          person_name: `${name} Person ${(r % peoplePer) + 1}`,
          department: name,
          source_id: sourceId,
          date: new Date(Date.UTC(2026, 1, r + 1)).toISOString().slice(0, 10),
          shift: '09:00-17:00',
          imported_at: loadedAt,
        });
      }
    }
  }
  return model;
}

/**
 * Wraps a model as the `workspaces` row the pull reads, at server version `version` (default 1).
 *
 * Deliberately dated a day in the past by default: a cloud save always predates the device reading
 * it, and the pull must load it anyway. It compares server versions, never timestamps.
 */
function workspaceRow(model, updatedAt, version) {
  const stamp = updatedAt || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return {
    owner_user_id: 'user-test-1',
    team_id: null,
    department_key: '__personal__',
    data: Object.assign({}, model, { updated_at: stamp }),
    updated_at: stamp,
    version: version || 1,
  };
}

/**
 * Installs the Supabase double and navigates to the app. Returns once the landing screen is up.
 * `signedIn: true` means the session already exists at first paint (a returning visit); use
 * page.evaluate(() => window.__fakeSupabase.signIn()) to test the sign-in transition itself.
 */
async function openApp(page, config = {}) {
  const initSource = installFakeSupabase.toString();
  await page.addInitScript(
    ({ src, cfg }) => {
      // eslint-disable-next-line no-new-func
      new Function('config', `(${src})(config)`)(cfg);
    },
    { src: initSource, cfg: config }
  );
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.__jsErrors = errors;
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // `S` and most app functions are top-level `let`/`function` declarations, which are lexical
  // globals rather than window properties — window.sb is one of the few things explicitly exported,
  // so it is the reliable "the app's scripts have run" signal.
  await page.waitForFunction(() => !!window.sb && !!document.getElementById('lcProjectPicker'), null, { timeout: 30_000 });
  return page;
}

/**
 * Builds a small, realistic project straight into the canonical store and opens it: six people in
 * two teams, four weeks of shifts from the Monday of this week with rolling days off, one source.
 * Test data only. The app itself ships no sample or demo data, so this lives here rather than in src/.
 */
async function createTestProject(page, name = 'Test Team') {
  return page.evaluate((projectName) => {
    const PEOPLE = [
      { name: 'Amara Okafor', team: 'Early', role: 'Team leader' },
      { name: 'Ben Sorensen', team: 'Early', role: 'Advisor' },
      { name: 'Chloe Duarte', team: 'Early', role: 'Advisor' },
      { name: 'Dmitri Volkov', team: 'Late', role: 'Team leader' },
      { name: 'Esi Mensah', team: 'Late', role: 'Advisor' },
      { name: 'Farid Haddad', team: 'Late', role: 'Advisor' },
    ];
    const model = window.nsCanonical();
    const taken = new Set(window.nsListCanonicalProjects().map((p) => window.nsDepartmentKey(p.name)));
    let dept = projectName;
    for (let n = 2; taken.has(window.nsDepartmentKey(dept)); n++) dept = `${projectName} (${n})`;
    const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const sourceId = `src-test-${slug(dept)}`;
    const loadedAt = new Date().toISOString();
    PEOPLE.forEach((person, index) => {
      model.people.push({
        person_id: `per-${slug(dept)}-${slug(person.name)}`,
        full_name: person.name,
        home_department: dept,
        team_name: person.team,
        role: person.role,
        authority_rank: index === 0 || index === 3 ? 2 : 1,
        source_id: sourceId,
      });
    });
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let rows = 0;
    for (let day = 0; day < 28; day++) {
      const date = new Date(start);
      date.setDate(start.getDate() + day);
      PEOPLE.forEach((person, index) => {
        const offset = (day + index * 2) % 7;
        const isOff = offset === 5 || offset === 6;
        const early = person.team === 'Early';
        model.schedule.push({
          schedule_id: `sch-${slug(dept)}-${slug(person.name)}-${iso(date)}`,
          person_name: person.name,
          department: dept,
          team_name: person.team,
          source_id: sourceId,
          date: iso(date),
          day_of_week: DAYS[date.getDay()],
          is_off: isOff,
          off_type: isOff ? 'OFF' : '',
          uk_start: isOff ? '' : early ? '07:00' : '12:00',
          uk_end: isOff ? '' : early ? '15:00' : '20:00',
          authority_rank: 1,
          imported_at: loadedAt,
        });
        rows++;
      });
    }
    model.sources.push({ source_id: sourceId, source_name: `${dept}.xlsx`, source_kind: 'schedulehub', department_name: dept, loaded_at: loadedAt, sheets: 1, source_rows: rows });
    window.nsPersist();
    _syncOpenProject(dept);
    _syncRenderProjectPicker();
    _syncMarkLocalChange();
    return { name: dept, people: PEOPLE.length, schedule: rows };
  }, name);
}

const picker = {
  root: '#lcProjectPicker',
  rows: '.lc-project-row',
  names: '.lc-project-name',
  search: '#lcProjectSearch',
  showAll: '.lc-project-more-btn',
  deleteBtn: '.lc-project-delete',
  renameBtn: '.lc-project-action:not(.lc-project-delete)',
  newSourceToggle: '#lcNewSourceToggle',
};

// Signing in loads the cloud copy by itself; this waits for the picker it produces. Passing
// { sync: true } also presses Sync from cloud, for tests about that button.
async function waitForPicker(page, options = {}) {
  if (options.sync === true) await page.evaluate(() => _syncManualPull());
  await page.waitForSelector(`${picker.root} ${picker.rows}`, { state: 'visible', timeout: 20_000 });
}

async function projectNames(page) {
  return page.$$eval(`${picker.root} ${picker.names}`, (els) => els.map((e) => e.textContent.trim()));
}

module.exports = { PROFILE, buildWorkspace, workspaceRow, openApp, createTestProject, picker, waitForPicker, projectNames };
