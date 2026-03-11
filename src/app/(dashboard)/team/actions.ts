"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface RegisterUserInput {
  name: string;
  username: string;
  email: string;
  password: string;
  role: string;
  department_id: string | null;
  leave_balance: number;
}

export async function registerUser(input: RegisterUserInput) {
  // Verify the caller is HR
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return { error: "Not authenticated" };
  }

  const { data: caller } = await supabase
    .from("users")
    .select("role")
    .eq("auth_id", authUser.id)
    .single();

  if (!caller || caller.role !== "hr") {
    return { error: "Only HR can register users" };
  }

  // Step 1: Create auth user via Admin API
  const admin = createAdminClient();
  const { data: newAuthUser, error: authError } =
    await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name },
    });

  if (authError) {
    return { error: authError.message };
  }

  // Step 2: Create profile in public.users
  const { error: profileError } = await admin.from("users").insert({
    auth_id: newAuthUser.user.id,
    name: input.name,
    username: input.username || null,
    email: input.email,
    role: input.role,
    department_id: input.department_id,
    leave_balance: input.leave_balance,
  });

  // Step 3: Rollback auth account if profile creation failed (TEAM-04)
  if (profileError) {
    await admin.auth.admin.deleteUser(newAuthUser.user.id);
    return { error: `Profile creation failed: ${profileError.message}` };
  }

  return { success: true };
}

export async function deleteUser(userId: string) {
  // Verify the caller is HR
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return { error: "Not authenticated" };
  }

  const { data: caller } = await supabase
    .from("users")
    .select("role")
    .eq("auth_id", authUser.id)
    .single();

  if (!caller || caller.role !== "hr") {
    return { error: "Only HR can delete users" };
  }

  // Get the user's auth_id before deleting
  const admin = createAdminClient();
  const { data: targetUser, error: fetchError } = await admin
    .from("users")
    .select("auth_id")
    .eq("id", userId)
    .single();

  if (fetchError || !targetUser) {
    return { error: "User not found" };
  }

  // Prevent HR from deleting themselves
  if (targetUser.auth_id === authUser.id) {
    return { error: "You cannot delete your own account" };
  }

  // Delete from public.users (cascades to leaves, project_members, suggestions, etc.)
  const { error: deleteError } = await admin
    .from("users")
    .delete()
    .eq("id", userId);

  if (deleteError) {
    return { error: `Failed to delete user profile: ${deleteError.message}` };
  }

  // Delete from auth.users
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(
    targetUser.auth_id
  );

  if (authDeleteError) {
    return { error: `Profile deleted but auth cleanup failed: ${authDeleteError.message}` };
  }

  return { success: true };
}
