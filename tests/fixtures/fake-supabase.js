/**
 * In-page Supabase double.
 *
 * Installed via page.addInitScript BEFORE any of the app's own scripts run. The real supabase-js
 * bundle is inlined into index.html and assigns window.supabase, so this claims the property with a
 * getter plus a swallowing setter — the bundle's own assignment is ignored rather than throwing,
 * which matters because that bundle is strict-mode.
 *
 * The surface implemented here is exactly what the app calls and nothing more:
 *   auth: getSession, getUser, onAuthStateChange, signInWithOAuth, signOut
 *   from(table): select().eq().eq().maybeSingle(), update().eq()…[.select().maybeSingle()],
 *                insert().select().single(), upsert().select().single()
 *
 * The workspace row behaves like the real table: every write gets a new server `version` (the
 * database trigger), an update only applies when all its .eq() filters match (so a stale version
 * matches nothing), and inserting over an existing row fails with Postgres' unique-violation code.
 *
 * Tests drive it through window.__fakeSupabase (see tests/helpers.js), which can flip the network
 * offline, force pushes to fail, and simulate another device writing a newer row.
 */
function installFakeSupabase(config) {
  const cfg = Object.assign(
    {
      signedIn: false,
      user: { id: 'user-test-1', email: 'tester@example.com' },
      profile: null,
      workspaceRow: null,
      teamMemberships: [],
      failPush: false,
      failPushMessage: 'simulated network failure',
      pushLatencyMs: 0,
    },
    config || {}
  );

  const state = {
    cfg,
    session: cfg.signedIn ? makeSession(cfg.user) : null,
    authListeners: [],
    pushes: [],
    profileUpdates: [],
    oauthCalls: 0,
    signOutCalls: [],
  };

  function makeSession(user) {
    return { access_token: 'token-' + user.id, user };
  }
  function ok(data) {
    return Promise.resolve({ data, error: null });
  }
  function fail(message) {
    return Promise.resolve({ data: null, error: { message } });
  }
  function delay(ms) {
    return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
  }

  // Reads are deliberately permissive: the double holds a single personal workspace row, so read
  // filters are recorded for assertions but not used to select. Writes honour their filters.
  function makeQuery(table) {
    const q = {
      _table: table,
      _filters: [],
      _op: 'select',
      _patch: null,
      select() {
        return q;
      },
      eq(col, val) {
        q._filters.push([col, val]);
        return q;
      },
      in(col, vals) {
        q._filters.push([col, vals]);
        return q;
      },
      update(patch) {
        q._op = 'update';
        q._patch = patch;
        return q;
      },
      insert(row) {
        q._op = 'insert';
        q._patch = row;
        return q;
      },
      upsert(row) {
        q._op = 'upsert';
        q._patch = row;
        return q;
      },
      maybeSingle() {
        return run('maybeSingle');
      },
      single() {
        return run('single');
      },
      // team_members reads and bare updates are awaited directly, without maybeSingle()
      then(resolve, reject) {
        return run('many').then(resolve, reject);
      },
    };

    async function run(mode) {
      if (table === 'profiles') {
        if (q._op === 'update') {
          state.profileUpdates.push(q._patch);
          state.cfg.profile = Object.assign({}, state.cfg.profile || {}, q._patch);
          return ok(q._patch);
        }
        return ok(state.cfg.profile);
      }
      if (table === 'team_members') return ok(state.cfg.teamMemberships);
      if (table !== 'workspaces') return ok(null);

      const current = state.cfg.workspaceRow;
      if (q._op === 'select') return ok(mode === 'many' ? (current ? [current] : []) : current);

      await delay(state.cfg.pushLatencyMs);
      if (state.cfg.failPush) return fail(state.cfg.failPushMessage);
      const now = new Date().toISOString();
      let next = null;
      if (q._op === 'update') {
        const matches = current && q._filters.every(([col, val]) => current[col] === val);
        if (matches) next = Object.assign({}, current, q._patch, { version: (current.version || 1) + 1, updated_at: now });
      } else if (q._op === 'insert') {
        if (current) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "workspaces_owner_dept_unique"' } };
        next = Object.assign({}, q._patch, { version: 1, updated_at: now });
      } else if (q._op === 'upsert') {
        next = Object.assign({}, current || {}, q._patch, { version: current ? (current.version || 1) + 1 : 1, updated_at: now });
      }
      if (next) {
        state.pushes.push(next);
        state.cfg.workspaceRow = next;
      }
      if (mode === 'many') return ok(next ? [next] : []);
      if (mode === 'single' && !next) return fail('JSON object requested, multiple (or no) rows returned');
      return ok(next);
    }

    return q;
  }

  const client = {
    auth: {
      async getSession() {
        return ok({ session: state.session });
      },
      async getUser() {
        return ok({ user: state.session ? state.session.user : null });
      },
      onAuthStateChange(cb) {
        state.authListeners.push(cb);
        // Mirror supabase-js: INITIAL_SESSION fires asynchronously after registration.
        setTimeout(() => cb('INITIAL_SESSION', state.session), 0);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signInWithOAuth() {
        state.oauthCalls++;
        // The real client navigates away to Google here. Tests assert the call happened and then
        // drive the post-redirect state themselves via __fakeSupabase.signIn().
        return { data: { url: 'https://accounts.google.test/o/oauth2/auth' }, error: null };
      },
      async signOut(opts) {
        state.signOutCalls.push(opts || null);
        state.session = null;
        state.authListeners.forEach((cb) => cb('SIGNED_OUT', null));
        return { error: null };
      },
    },
    from(table) {
      return makeQuery(table);
    },
  };

  const fake = {
    state,
    client,
    signIn(profile) {
      if (profile !== undefined) state.cfg.profile = profile;
      state.session = makeSession(state.cfg.user);
      state.authListeners.forEach((cb) => cb('SIGNED_IN', state.session));
    },
    setProfile(profile) {
      state.cfg.profile = profile;
    },
    setWorkspaceRow(row) {
      state.cfg.workspaceRow = row;
    },
    setFailPush(flag, message) {
      state.cfg.failPush = !!flag;
      if (message) state.cfg.failPushMessage = message;
    },
    // Simulates another device saving: the server bumps the row's version, which is all a device
    // holding the previous version needs in order to see it has fallen behind. `data`, when given,
    // replaces the row's workspace payload.
    simulateRemoteWrite(data) {
      const current = state.cfg.workspaceRow || {};
      state.cfg.workspaceRow = Object.assign({}, current, data ? { data } : {}, {
        version: (current.version || 1) + 1,
        updated_at: new Date().toISOString(),
      });
    },
    pushCount() {
      return state.pushes.length;
    },
    lastPush() {
      return state.pushes[state.pushes.length - 1] || null;
    },
    oauthCalls() {
      return state.oauthCalls;
    },
  };

  Object.defineProperty(window, '__fakeSupabase', { value: fake, writable: false, configurable: true });
  Object.defineProperty(window, 'supabase', {
    configurable: true,
    get() {
      return { createClient: () => client };
    },
    set() {
      /* swallow the real bundle's assignment */
    },
  });
}

module.exports = { installFakeSupabase };
