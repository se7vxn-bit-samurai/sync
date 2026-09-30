const { freshDb, addUser, rpc } = require('./pg');

// The Claims department used by the org-layer database tests, on every migration:
// Gina (GM, admin) > Mo (manager) > Ada, Omar (TLs). Ada: Zanele (YAT), Ben. Omar: Kim, Pat.
// Everyone except Kim and Pat has signed in, with the role their invite gave them.
const FROM = '2026-01-01';
const PEOPLE = [
  ['gina', 'Gina Head', 'General Manager'], ['mo', 'Mo Manager', 'Operations Manager'],
  ['ada', 'Ada Leader', 'Team Leader'], ['omar', 'Omar Reyes', 'Team Leader'],
  ['zan', 'Zanele Dube', 'Agent', ['YAT']], ['ben', 'Ben Okafor', 'Agent'], ['kim', 'Kim Senior', 'Agent'], ['pat', 'Pat Ncube', 'Agent'],
];
const LINES = [['mo', 'gina'], ['ada', 'mo'], ['omar', 'mo'], ['zan', 'ada'], ['ben', 'ada'], ['kim', 'omar'], ['pat', 'omar']];
const ROLES = { mo: 'manager', ada: 'tl', omar: 'tl', zan: 'agent', ben: 'agent' };

async function seedClaims() {
  const db = await freshDb({ migrations: null });
  const gina = await addUser(db, 'gina@claims.test');
  const org = await rpc(db, gina, 'org_create_from_project', {
    p_payload: JSON.stringify({
      org_name: 'Acme BPO', dept_name: 'Claims', me_ref: 'gina',
      people: PEOPLE.map(([ref, full_name, role_title, labels]) => ({ ref, full_name, role_title, labels: labels || [] })),
      lines: LINES.map(([p, l]) => ({ person_ref: p, leader_ref: l, from: FROM })),
    }),
  });
  const id = org.map;
  const orgId = org.org_id;
  const users = { gina };
  for (const [who, role] of Object.entries(ROLES)) {
    await rpc(db, gina, 'org_invite', { p_org: orgId, p_person: id[who], p_email: `${who}@claims.test`, p_role: role });
    users[who] = await addUser(db, `${who}@claims.test`);
    await rpc(db, users[who], 'org_claim');
  }
  return { db, org, orgId, id, users };
}

module.exports = { seedClaims };
