/**
 * RSD Attendance Manager - Database Seed Script
 *
 * Usage: node supabase/seed-database.mjs
 *
 * This script:
 * 1. Cleans up existing seed data
 * 2. Creates auth users via Supabase Admin API (proper way)
 * 3. Seeds departments, profiles, holidays, projects, leaves, etc.
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from .env.local
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
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================
// AUTH USERS TO CREATE
// ============================================
const AUTH_USERS = [
  { id: "a1000000-0000-0000-0000-000000000001", email: "admin@rsd.com", password: "password123", name: "Maria Santos" },
  { id: "a1000000-0000-0000-0000-000000000002", email: "leader@rsd.com", password: "password123", name: "James Cruz" },
  { id: "a1000000-0000-0000-0000-000000000003", email: "leader2@rsd.com", password: "password123", name: "Ana Reyes" },
  { id: "a1000000-0000-0000-0000-000000000004", email: "member1@rsd.com", password: "password123", name: "Carlo Mendoza" },
  { id: "a1000000-0000-0000-0000-000000000005", email: "member2@rsd.com", password: "password123", name: "Sofia Garcia" },
  { id: "a1000000-0000-0000-0000-000000000006", email: "member3@rsd.com", password: "password123", name: "Miguel Torres" },
  { id: "a1000000-0000-0000-0000-000000000007", email: "member4@rsd.com", password: "password123", name: "Isabelle Lim" },
  { id: "a1000000-0000-0000-0000-000000000008", email: "member5@rsd.com", password: "password123", name: "Rafael Tan" },
  { id: "a1000000-0000-0000-0000-000000000009", email: "member6@rsd.com", password: "password123", name: "Patricia Dela Cruz" },
  { id: "a1000000-0000-0000-0000-000000000010", email: "member7@rsd.com", password: "password123", name: "Daniel Ramos" },
  { id: "a1000000-0000-0000-0000-000000000011", email: "member8@rsd.com", password: "password123", name: "Christina Villaruel" },
  { id: "a1000000-0000-0000-0000-000000000012", email: "member9@rsd.com", password: "password123", name: "Marco Rivera" },
  { id: "a1000000-0000-0000-0000-000000000013", email: "member10@rsd.com", password: "password123", name: "Bianca Aquino" },
];

async function main() {
  console.log("=== RSD Attendance Manager - Database Seeder ===\n");

  // Step 1: Clean up existing data
  console.log("1. Cleaning up existing data...");

  // Delete public tables first (they reference auth.users via foreign keys)
  const tables = [
    "suggestion_upvotes", "suggestions", "announcements",
    "project_members", "projects", "leaves", "users",
    "holidays", "departments"
  ];

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      // Table might not exist yet if schema wasn't run — that's OK
      console.log(`  - ${table}: ${error.message}`);
    } else {
      console.log(`  - ${table}: cleared`);
    }
  }

  // Delete existing auth users
  console.log("\n  Cleaning auth users...");
  for (const user of AUTH_USERS) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error && !error.message.includes("not found")) {
      console.log(`  - ${user.email}: ${error.message}`);
    }
  }
  console.log("  - auth users: cleared\n");

  // Step 2: Create auth users via Admin API
  console.log("2. Creating auth users via Admin API...");
  const createdUsers = new Map();

  for (const user of AUTH_USERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { name: user.name },
    });

    if (error) {
      console.error(`  FAILED: ${user.email} - ${error.message}`);
      process.exit(1);
    }

    createdUsers.set(user.id, data.user.id);
    console.log(`  + ${user.email} => ${data.user.id}`);
  }

  // Map old fixed UUIDs to actual UUIDs
  const authId = (oldId) => createdUsers.get(oldId);

  // Step 3: Seed departments
  console.log("\n3. Seeding departments...");
  const { error: deptError } = await supabase.from("departments").insert([
    { id: "d1000000-0000-0000-0000-000000000001", name: "Engineering" },
    { id: "d1000000-0000-0000-0000-000000000002", name: "Human Resources" },
    { id: "d1000000-0000-0000-0000-000000000003", name: "Design" },
    { id: "d1000000-0000-0000-0000-000000000004", name: "Marketing" },
    { id: "d1000000-0000-0000-0000-000000000005", name: "Operations" },
  ]);
  if (deptError) { console.error("  FAILED:", deptError.message); process.exit(1); }
  console.log("  + 5 departments");

  // Step 4: Seed user profiles
  console.log("\n4. Seeding user profiles...");
  const { error: usersError } = await supabase.from("users").insert([
    { id: "b1000000-0000-0000-0000-000000000001", auth_id: authId("a1000000-0000-0000-0000-000000000001"), name: "Maria Santos", username: "msantos", email: "admin@rsd.com", role: "hr", department_id: "d1000000-0000-0000-0000-000000000002", leave_balance: 15.0 },
    { id: "b1000000-0000-0000-0000-000000000002", auth_id: authId("a1000000-0000-0000-0000-000000000002"), name: "James Cruz", username: "jcruz", email: "leader@rsd.com", role: "leader", department_id: "d1000000-0000-0000-0000-000000000001", leave_balance: 15.0 },
    { id: "b1000000-0000-0000-0000-000000000003", auth_id: authId("a1000000-0000-0000-0000-000000000003"), name: "Ana Reyes", username: "areyes", email: "leader2@rsd.com", role: "leader", department_id: "d1000000-0000-0000-0000-000000000003", leave_balance: 15.0 },
    { id: "b1000000-0000-0000-0000-000000000004", auth_id: authId("a1000000-0000-0000-0000-000000000004"), name: "Carlo Mendoza", username: "cmendoza", email: "member1@rsd.com", role: "member", department_id: "d1000000-0000-0000-0000-000000000001", leave_balance: 15.0 },
    { id: "b1000000-0000-0000-0000-000000000005", auth_id: authId("a1000000-0000-0000-0000-000000000005"), name: "Sofia Garcia", username: "sgarcia", email: "member2@rsd.com", role: "member", department_id: "d1000000-0000-0000-0000-000000000001", leave_balance: 15.0 },
    { id: "b1000000-0000-0000-0000-000000000006", auth_id: authId("a1000000-0000-0000-0000-000000000006"), name: "Miguel Torres", username: "mtorres", email: "member3@rsd.com", role: "member", department_id: "d1000000-0000-0000-0000-000000000003", leave_balance: 15.0 },
    { id: "b1000000-0000-0000-0000-000000000007", auth_id: authId("a1000000-0000-0000-0000-000000000007"), name: "Isabelle Lim", username: "ilim", email: "member4@rsd.com", role: "member", department_id: "d1000000-0000-0000-0000-000000000003", leave_balance: 15.0 },
    { id: "b1000000-0000-0000-0000-000000000008", auth_id: authId("a1000000-0000-0000-0000-000000000008"), name: "Rafael Tan", username: "rtan", email: "member5@rsd.com", role: "member", department_id: "d1000000-0000-0000-0000-000000000004", leave_balance: 15.0 },
    { id: "b1000000-0000-0000-0000-000000000009", auth_id: authId("a1000000-0000-0000-0000-000000000009"), name: "Patricia Dela Cruz", username: "pdelacruz", email: "member6@rsd.com", role: "member", department_id: "d1000000-0000-0000-0000-000000000004", leave_balance: 15.0 },
    { id: "b1000000-0000-0000-0000-000000000010", auth_id: authId("a1000000-0000-0000-0000-000000000010"), name: "Daniel Ramos", username: "dramos", email: "member7@rsd.com", role: "member", department_id: "d1000000-0000-0000-0000-000000000005", leave_balance: 15.0 },
    { id: "b1000000-0000-0000-0000-000000000011", auth_id: authId("a1000000-0000-0000-0000-000000000011"), name: "Christina Villaruel", username: "cvillaruel", email: "member8@rsd.com", role: "member", department_id: "d1000000-0000-0000-0000-000000000005", leave_balance: 15.0 },
    { id: "b1000000-0000-0000-0000-000000000012", auth_id: authId("a1000000-0000-0000-0000-000000000012"), name: "Marco Rivera", username: "mrivera", email: "member9@rsd.com", role: "member", department_id: "d1000000-0000-0000-0000-000000000001", leave_balance: 15.0 },
    { id: "b1000000-0000-0000-0000-000000000013", auth_id: authId("a1000000-0000-0000-0000-000000000013"), name: "Bianca Aquino", username: "baquino", email: "member10@rsd.com", role: "member", department_id: "d1000000-0000-0000-0000-000000000002", leave_balance: 15.0 },
  ]);
  if (usersError) { console.error("  FAILED:", usersError.message); process.exit(1); }
  console.log("  + 13 user profiles");

  // Step 5: Seed holidays
  console.log("\n5. Seeding holidays...");
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
  if (holError) { console.error("  FAILED:", holError.message); process.exit(1); }
  console.log("  + 17 holidays");

  // Step 6: Seed projects
  console.log("\n6. Seeding projects...");
  const { error: projError } = await supabase.from("projects").insert([
    { id: "c1000000-0000-0000-0000-000000000001", name: "Project Atlas", description: "Main product development - web application" },
    { id: "c1000000-0000-0000-0000-000000000002", name: "Project Beacon", description: "Mobile app companion for Atlas" },
    { id: "c1000000-0000-0000-0000-000000000003", name: "Internal Tools", description: "Company internal tooling and automation" },
  ]);
  if (projError) { console.error("  FAILED:", projError.message); process.exit(1); }
  console.log("  + 3 projects");

  // Step 7: Seed project members
  console.log("\n7. Seeding project members...");
  const { error: pmError } = await supabase.from("project_members").insert([
    { project_id: "c1000000-0000-0000-0000-000000000001", user_id: "b1000000-0000-0000-0000-000000000002" },
    { project_id: "c1000000-0000-0000-0000-000000000001", user_id: "b1000000-0000-0000-0000-000000000004" },
    { project_id: "c1000000-0000-0000-0000-000000000001", user_id: "b1000000-0000-0000-0000-000000000005" },
    { project_id: "c1000000-0000-0000-0000-000000000001", user_id: "b1000000-0000-0000-0000-000000000012" },
    { project_id: "c1000000-0000-0000-0000-000000000002", user_id: "b1000000-0000-0000-0000-000000000003" },
    { project_id: "c1000000-0000-0000-0000-000000000002", user_id: "b1000000-0000-0000-0000-000000000006" },
    { project_id: "c1000000-0000-0000-0000-000000000002", user_id: "b1000000-0000-0000-0000-000000000007" },
    { project_id: "c1000000-0000-0000-0000-000000000003", user_id: "b1000000-0000-0000-0000-000000000002" },
    { project_id: "c1000000-0000-0000-0000-000000000003", user_id: "b1000000-0000-0000-0000-000000000010" },
    { project_id: "c1000000-0000-0000-0000-000000000003", user_id: "b1000000-0000-0000-0000-000000000011" },
  ]);
  if (pmError) { console.error("  FAILED:", pmError.message); process.exit(1); }
  console.log("  + 10 project memberships");

  // Step 8: Seed leaves
  console.log("\n8. Seeding sample leaves...");
  const { error: leavesError } = await supabase.from("leaves").insert([
    { user_id: "b1000000-0000-0000-0000-000000000004", leave_type: "VL", leave_date: "2026-03-10", duration: "whole", duration_value: 1.0, reason: "Family vacation", status: "approved", reviewed_by: "b1000000-0000-0000-0000-000000000002" },
    { user_id: "b1000000-0000-0000-0000-000000000004", leave_type: "VL", leave_date: "2026-03-11", duration: "whole", duration_value: 1.0, reason: "Family vacation", status: "approved", reviewed_by: "b1000000-0000-0000-0000-000000000002" },
    { user_id: "b1000000-0000-0000-0000-000000000005", leave_type: "WFH", leave_date: "2026-03-05", duration: "whole", duration_value: 1.0, status: "approved" },
    { user_id: "b1000000-0000-0000-0000-000000000005", leave_type: "WFH", leave_date: "2026-03-04", duration: "whole", duration_value: 1.0, status: "approved" },
    { user_id: "b1000000-0000-0000-0000-000000000005", leave_type: "WFH", leave_date: "2026-03-03", duration: "whole", duration_value: 1.0, status: "approved" },
    { user_id: "b1000000-0000-0000-0000-000000000006", leave_type: "SL", leave_date: "2026-03-05", duration: "whole", duration_value: 1.0, reason: "Not feeling well", status: "approved" },
    { user_id: "b1000000-0000-0000-0000-000000000007", leave_type: "VL", leave_date: "2026-03-12", duration: "whole", duration_value: 1.0, reason: "Personal matters", status: "pending" },
    { user_id: "b1000000-0000-0000-0000-000000000007", leave_type: "VL", leave_date: "2026-03-13", duration: "whole", duration_value: 1.0, reason: "Personal matters", status: "pending" },
    { user_id: "b1000000-0000-0000-0000-000000000008", leave_type: "WFH", leave_date: "2026-03-05", duration: "whole", duration_value: 1.0, status: "approved" },
    { user_id: "b1000000-0000-0000-0000-000000000009", leave_type: "SL", leave_date: "2026-03-04", duration: "half_am", duration_value: 0.5, reason: "Doctor appointment", status: "approved" },
    { user_id: "b1000000-0000-0000-0000-000000000010", leave_type: "VL", leave_date: "2026-03-06", duration: "whole", duration_value: 1.0, reason: "Trip", status: "rejected", reviewed_by: "b1000000-0000-0000-0000-000000000002" },
    { user_id: "b1000000-0000-0000-0000-000000000011", leave_type: "AB", leave_date: "2026-03-03", duration: "whole", duration_value: 1.0, status: "approved" },
    { user_id: "b1000000-0000-0000-0000-000000000012", leave_type: "SPL", leave_date: "2026-03-14", duration: "whole", duration_value: 1.0, reason: "Wedding attendance", status: "pending" },
    { user_id: "b1000000-0000-0000-0000-000000000002", leave_type: "WFH", leave_date: "2026-03-05", duration: "whole", duration_value: 1.0, status: "approved" },
    { user_id: "b1000000-0000-0000-0000-000000000003", leave_type: "VL", leave_date: "2026-03-20", duration: "whole", duration_value: 1.0, reason: "Annual leave", status: "approved", reviewed_by: "b1000000-0000-0000-0000-000000000001" },
    { user_id: "b1000000-0000-0000-0000-000000000001", leave_type: "NW", leave_date: "2026-02-28", duration: "whole", duration_value: 1.0, status: "approved" },
  ]);
  if (leavesError) { console.error("  FAILED:", leavesError.message); process.exit(1); }
  console.log("  + 16 leave records");

  // Step 9: Seed suggestions
  console.log("\n9. Seeding suggestions...");
  const { error: sugError } = await supabase.from("suggestions").insert([
    { id: "e1000000-0000-0000-0000-000000000001", user_id: "b1000000-0000-0000-0000-000000000004", content: "Can we have a standing desk option in the office?", is_anonymous: false },
    { id: "e1000000-0000-0000-0000-000000000002", user_id: "b1000000-0000-0000-0000-000000000006", content: "It would be great to have team building activities every quarter.", is_anonymous: false },
    { id: "e1000000-0000-0000-0000-000000000003", user_id: "b1000000-0000-0000-0000-000000000008", content: "The pantry coffee machine needs an upgrade!", is_anonymous: true },
    { id: "e1000000-0000-0000-0000-000000000004", user_id: "b1000000-0000-0000-0000-000000000005", content: "Flexible work hours would improve productivity.", is_anonymous: false },
  ]);
  if (sugError) { console.error("  FAILED:", sugError.message); process.exit(1); }
  console.log("  + 4 suggestions");

  // Upvotes
  const { error: upvError } = await supabase.from("suggestion_upvotes").insert([
    { suggestion_id: "e1000000-0000-0000-0000-000000000001", user_id: "b1000000-0000-0000-0000-000000000005" },
    { suggestion_id: "e1000000-0000-0000-0000-000000000001", user_id: "b1000000-0000-0000-0000-000000000006" },
    { suggestion_id: "e1000000-0000-0000-0000-000000000001", user_id: "b1000000-0000-0000-0000-000000000007" },
    { suggestion_id: "e1000000-0000-0000-0000-000000000002", user_id: "b1000000-0000-0000-0000-000000000004" },
    { suggestion_id: "e1000000-0000-0000-0000-000000000002", user_id: "b1000000-0000-0000-0000-000000000008" },
    { suggestion_id: "e1000000-0000-0000-0000-000000000003", user_id: "b1000000-0000-0000-0000-000000000004" },
    { suggestion_id: "e1000000-0000-0000-0000-000000000003", user_id: "b1000000-0000-0000-0000-000000000005" },
    { suggestion_id: "e1000000-0000-0000-0000-000000000003", user_id: "b1000000-0000-0000-0000-000000000006" },
    { suggestion_id: "e1000000-0000-0000-0000-000000000003", user_id: "b1000000-0000-0000-0000-000000000007" },
    { suggestion_id: "e1000000-0000-0000-0000-000000000003", user_id: "b1000000-0000-0000-0000-000000000009" },
    { suggestion_id: "e1000000-0000-0000-0000-000000000004", user_id: "b1000000-0000-0000-0000-000000000007" },
  ]);
  if (upvError) { console.error("  FAILED:", upvError.message); process.exit(1); }
  console.log("  + 11 upvotes");

  // Step 10: Seed announcements
  console.log("\n10. Seeding announcements...");
  const { error: annError } = await supabase.from("announcements").insert([
    { author_id: "b1000000-0000-0000-0000-000000000001", title: "Welcome to the New Attendance System!", content: "We are excited to launch our new attendance and leave management system. Please explore the features and let us know your feedback via the Suggestions page." },
    { author_id: "b1000000-0000-0000-0000-000000000001", title: "Quarterly Team Building - March 2026", content: "Our Q1 team building event will be held on March 28, 2026. Details will be shared soon. Please mark your calendars!" },
    { author_id: "b1000000-0000-0000-0000-000000000001", title: "Updated WFH Policy", content: "Starting this month, the WFH monthly cap remains at 8 days per person, with a daily company-wide limit of 12 concurrent WFH slots. Please plan accordingly." },
  ]);
  if (annError) { console.error("  FAILED:", annError.message); process.exit(1); }
  console.log("  + 3 announcements");

  // Done!
  console.log("\n=== Seeding complete! ===");
  console.log("\nLogin credentials:");
  console.log("  HR:     admin@rsd.com / password123");
  console.log("  Leader: leader@rsd.com / password123");
  console.log("  Member: member1@rsd.com / password123");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
