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
 * Wraps a model as the `workspaces` row the pull reads.
 *
 * The timestamp defaults to a few minutes ahead of now on purpose. syncPullWorkspace only applies a
 * remote row that is strictly newer than the local canonical model, and simply booting the app
 * stamps the (empty) local model with the current time — so a row built "now" loses the comparison
 * by a few milliseconds and is silently ignored. Being clearly ahead models the real case under
 * test: a cloud copy that genuinely postdates anything this device has.
 */
function workspaceRow(model, updatedAt) {
  const stamp = updatedAt || new Date(Date.now() + 5 * 60 * 1000).toISOString();
  return {
    owner_user_id: 'user-test-1',
    team_id: null,
    department_key: '__personal__',
    data: Object.assign({}, model, { updated_at: stamp }),
    updated_at: stamp,
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

async function waitForPicker(page) {
  await page.waitForSelector(`${picker.root} ${picker.rows}`, { state: 'visible', timeout: 20_000 });
}

async function projectNames(page) {
  return page.$$eval(`${picker.root} ${picker.names}`, (els) => els.map((e) => e.textContent.trim()));
}

module.exports = { PROFILE, buildWorkspace, workspaceRow, openApp, picker, waitForPicker, projectNames };
