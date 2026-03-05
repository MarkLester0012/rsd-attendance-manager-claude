/**
 * RSD Attendance Manager - Production Seed
 *
 * Usage: node supabase/seed-production.mjs
 *
 * Creates a clean database with:
 * - 1 HR user (the bootstrap admin)
 * - 5 departments
 * - 17 Philippine holidays (2026)
 *
 * HR can then register all other users from the Team page.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing env vars in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// =============================================
// CONFIGURE YOUR HR ACCOUNT HERE
// =============================================
const HR_EMAIL = "admin@rsd.com";
const HR_PASSWORD = "password123";
const HR_NAME = "Maria Santos";
const HR_USERNAME = "msantos";
// =============================================

async function main() {
  console.log("=== Production Seed ===\n");

  // Step 1: Clear all public data
  console.log("1. Clearing all data...");
  const tables = [
    "suggestion_upvotes", "suggestions", "announcements",
    "project_members", "projects", "leaves", "users",
    "holidays", "departments",
  ];
  for (const table of tables) {
    await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    console.log(`   - ${table}: cleared`);
  }

  // Step 2: Clear all auth users
  console.log("\n2. Clearing auth users...");
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  if (authUsers?.users) {
    for (const u of authUsers.users) {
      await supabase.auth.admin.deleteUser(u.id);
      console.log(`   - ${u.email}: deleted`);
    }
  }
  console.log("   Done.");

  // Step 3: Create HR auth user
  console.log("\n3. Creating HR account...");
  const { data: hrAuth, error: hrAuthError } = await supabase.auth.admin.createUser({
    email: HR_EMAIL,
    password: HR_PASSWORD,
    email_confirm: true,
    user_metadata: { name: HR_NAME },
  });
  if (hrAuthError) {
    console.error("   FAILED:", hrAuthError.message);
    process.exit(1);
  }
  console.log(`   + ${HR_EMAIL} => ${hrAuth.user.id}`);

  // Step 4: Seed departments
  console.log("\n4. Seeding departments...");
  const { error: deptError } = await supabase.from("departments").insert([
    { id: "d1000000-0000-0000-0000-000000000001", name: "Engineering" },
    { id: "d1000000-0000-0000-0000-000000000002", name: "Management" },
  ]);
  if (deptError) { console.error("   FAILED:", deptError.message); process.exit(1); }
  console.log("   + 2 departments");

  // Step 5: Create HR profile
  console.log("\n5. Creating HR profile...");
  const { error: profileError } = await supabase.from("users").insert({
    auth_id: hrAuth.user.id,
    name: HR_NAME,
    username: HR_USERNAME,
    email: HR_EMAIL,
    role: "hr",
    department_id: "d1000000-0000-0000-0000-000000000002", // Management
    leave_balance: 15.0,
  });
  if (profileError) {
    // Rollback auth user
    await supabase.auth.admin.deleteUser(hrAuth.user.id);
    console.error("   FAILED:", profileError.message);
    process.exit(1);
  }
  console.log(`   + ${HR_NAME} (HR)`);

  // Step 6: Seed holidays
  console.log("\n6. Seeding holidays...");
  const { error: holError } = await supabase.from("holidays").insert([
    { name: "New Year's Day", observed_date: "2026-01-01", is_local: false },
    { name: "Chinese New Year", observed_date: "2026-02-17", is_local: false },
    { name: "EDSA Revolution Anniversary", observed_date: "2026-02-25", is_local: false },
    { name: "Araw ng Kagitingan", observed_date: "2026-04-09", is_local: false },
    { name: "Maundy Thursday", observed_date: "2026-04-02", is_local: false },
    { name: "Good Friday", observed_date: "2026-04-03", is_local: false },
    { name: "Black Saturday", observed_date: "2026-04-04", is_local: false },
    { name: "Labor Day", observed_date: "2026-05-01", is_local: false },
    { name: "Independence Day", observed_date: "2026-06-12", is_local: false },
    { name: "Ninoy Aquino Day", observed_date: "2026-08-21", is_local: false },
    { name: "National Heroes Day", observed_date: "2026-08-31", is_local: false },
    { name: "Bonifacio Day", observed_date: "2026-11-30", is_local: false },
    { name: "Christmas Day", observed_date: "2026-12-25", is_local: false },
    { name: "Rizal Day", observed_date: "2026-12-30", is_local: false },
    { name: "Last Day of the Year", observed_date: "2026-12-31", is_local: false },
    { name: "City Foundation Day", observed_date: "2026-06-24", is_local: true },
    { name: "Feast of the Immaculate Conception", observed_date: "2026-12-08", is_local: true },
  ]);
  if (holError) { console.error("   FAILED:", holError.message); process.exit(1); }
  console.log("   + 17 holidays");

  console.log("\n=== Production seed complete! ===");
  console.log(`\nHR Login: ${HR_EMAIL} / ${HR_PASSWORD}`);
  console.log("HR can now register all other users from Team > Register Member.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
