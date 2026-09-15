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
 *   from(table): select().eq().eq().maybeSingle(), select().in().eq(), upsert(), update().eq()
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

  // Deliberately permissive: the app only ever filters by owner/department/id, and the double holds
  // a single personal workspace row, so filters are recorded for assertions but not used to select.
  function makeQuery(table) {
    const q = {
      _table: table,
      _filters: [],
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
      async maybeSingle() {
        if (table === 'profiles') return ok(state.cfg.profile);
        if (table === 'workspaces') return ok(state.cfg.workspaceRow);
        return ok(null);
      },
      async upsert(row) {
        await delay(state.cfg.pushLatencyMs);
        if (state.cfg.failPush) return fail(state.cfg.failPushMessage);
        state.pushes.push(row);
        state.cfg.workspaceRow = Object.assign({}, row);
        return ok(row);
      },
      update(patch) {
        const applied = {
          async eq() {
            if (table === 'profiles') {
              state.profileUpdates.push(patch);
              state.cfg.profile = Object.assign({}, state.cfg.profile || {}, patch);
            }
            return ok(patch);
          },
        };
        return applied;
      },
      // team_members reads are awaited directly, without maybeSingle()
      then(resolve, reject) {
        const result = table === 'team_members' ? { data: state.cfg.teamMemberships, error: null } : { data: null, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
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
      async signOut() {
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
    // Simulates another device having saved a newer row than this one last observed, which is what
    // the optimistic-concurrency guard in _syncPushWorkspaceNow compares against. The stamp must
    // beat BOTH wall-clock now and whatever the seeded row already carries (helpers.workspaceRow
    // deliberately dates rows ahead of now), or the guard correctly sees nothing newer and the
    // conflict never triggers.
    simulateRemoteWrite(updatedAt) {
      const current = Date.parse((state.cfg.workspaceRow || {}).updated_at || '') || 0;
      const stamp = updatedAt || new Date(Math.max(Date.now(), current) + 60_000).toISOString();
      state.cfg.workspaceRow = Object.assign({}, state.cfg.workspaceRow || {}, { updated_at: stamp });
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
