// Sagefinan — phase 1 seed, part 2: admin user + sample movements.
//
// Run AFTER supabase/seed.sql (which creates departments/products/assignments
// with fixed UUIDs that this script references). This part can't be plain SQL
// because creating a Supabase Auth user correctly (password hashing, email
// confirmation, identity linking) requires the Admin API — hand-inserting
// into auth.users bypasses GoTrue and is not something Supabase supports.
//
// Usage: node scripts/seed-admin.mjs

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CENTRAL = "10000000-0000-0000-0000-000000000001";
const BAR = "10000000-0000-0000-0000-000000000002";
const KITCHEN = "10000000-0000-0000-0000-000000000003";

const PRODUCTS = {
  heineken: "20000000-0000-0000-0000-000000000001",
  starLager: "20000000-0000-0000-0000-000000000002",
  starRadler: "20000000-0000-0000-0000-000000000003",
  trophyLager: "20000000-0000-0000-0000-000000000004",
  chivas: "20000000-0000-0000-0000-000000000005",
  jameson: "20000000-0000-0000-0000-000000000006",
  evaWater: "20000000-0000-0000-0000-000000000007",
  coke: "20000000-0000-0000-0000-000000000008",
  vegOil: "20000000-0000-0000-0000-000000000009",
  tomatoPuree: "20000000-0000-0000-0000-000000000010",
};

const ADMIN_EMAIL = "admin@sagefinan.local";
const ADMIN_PASSWORD = "ChangeMe123!";

async function main() {
  console.log(`Creating admin user ${ADMIN_EMAIL}...`);
  const { data: existing } = await supabase.auth.admin.listUsers();
  let userId = existing?.users?.find((u) => u.email === ADMIN_EMAIL)?.id;

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Daniel Auditor" },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Created auth user ${userId}`);
  } else {
    console.log(`Admin user already exists (${userId}), reusing.`);
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    full_name: "Daniel Auditor",
    role: "ADMIN",
    department_id: null,
    is_active: true,
  });
  if (profileError) throw profileError;
  console.log("Profile upserted (role ADMIN).");

  const { count: existingMovements } = await supabase
    .from("movements")
    .select("*", { count: "exact", head: true });

  if (existingMovements && existingMovements > 0) {
    console.log(`${existingMovements} movements already exist, skipping movement seeding.`);
    return;
  }

  const movements = [
    // Purchases into central store — 2026-07-18
    { business_day: "2026-07-18", type: "PURCHASE", product_id: PRODUCTS.heineken, to_department_id: CENTRAL, quantity: 200 },
    { business_day: "2026-07-18", type: "PURCHASE", product_id: PRODUCTS.starLager, to_department_id: CENTRAL, quantity: 150 },
    { business_day: "2026-07-18", type: "PURCHASE", product_id: PRODUCTS.starRadler, to_department_id: CENTRAL, quantity: 150 },
    { business_day: "2026-07-18", type: "PURCHASE", product_id: PRODUCTS.trophyLager, to_department_id: CENTRAL, quantity: 150 },
    { business_day: "2026-07-18", type: "PURCHASE", product_id: PRODUCTS.chivas, to_department_id: CENTRAL, quantity: 50 },
    { business_day: "2026-07-18", type: "PURCHASE", product_id: PRODUCTS.jameson, to_department_id: CENTRAL, quantity: 50 },
    { business_day: "2026-07-18", type: "PURCHASE", product_id: PRODUCTS.evaWater, to_department_id: CENTRAL, quantity: 300 },
    { business_day: "2026-07-18", type: "PURCHASE", product_id: PRODUCTS.coke, to_department_id: CENTRAL, quantity: 300 },
    { business_day: "2026-07-18", type: "PURCHASE", product_id: PRODUCTS.vegOil, to_department_id: CENTRAL, quantity: 100 },
    { business_day: "2026-07-18", type: "PURCHASE", product_id: PRODUCTS.tomatoPuree, to_department_id: CENTRAL, quantity: 100 },

    // Requisitions central -> Bar — 2026-07-19
    { business_day: "2026-07-19", type: "REQUISITION", product_id: PRODUCTS.heineken, from_department_id: CENTRAL, to_department_id: BAR, quantity: 60 },
    { business_day: "2026-07-19", type: "REQUISITION", product_id: PRODUCTS.starLager, from_department_id: CENTRAL, to_department_id: BAR, quantity: 40 },
    { business_day: "2026-07-19", type: "REQUISITION", product_id: PRODUCTS.starRadler, from_department_id: CENTRAL, to_department_id: BAR, quantity: 40 },
    { business_day: "2026-07-19", type: "REQUISITION", product_id: PRODUCTS.trophyLager, from_department_id: CENTRAL, to_department_id: BAR, quantity: 40 },
    { business_day: "2026-07-19", type: "REQUISITION", product_id: PRODUCTS.chivas, from_department_id: CENTRAL, to_department_id: BAR, quantity: 15 },
    { business_day: "2026-07-19", type: "REQUISITION", product_id: PRODUCTS.jameson, from_department_id: CENTRAL, to_department_id: BAR, quantity: 15 },
    { business_day: "2026-07-19", type: "REQUISITION", product_id: PRODUCTS.evaWater, from_department_id: CENTRAL, to_department_id: BAR, quantity: 50 },
    { business_day: "2026-07-19", type: "REQUISITION", product_id: PRODUCTS.coke, from_department_id: CENTRAL, to_department_id: BAR, quantity: 50 },

    // Requisitions central -> Kitchen — 2026-07-19
    { business_day: "2026-07-19", type: "REQUISITION", product_id: PRODUCTS.evaWater, from_department_id: CENTRAL, to_department_id: KITCHEN, quantity: 40 },
    { business_day: "2026-07-19", type: "REQUISITION", product_id: PRODUCTS.coke, from_department_id: CENTRAL, to_department_id: KITCHEN, quantity: 40 },
    { business_day: "2026-07-19", type: "REQUISITION", product_id: PRODUCTS.vegOil, from_department_id: CENTRAL, to_department_id: KITCHEN, quantity: 30 },
    { business_day: "2026-07-19", type: "REQUISITION", product_id: PRODUCTS.tomatoPuree, from_department_id: CENTRAL, to_department_id: KITCHEN, quantity: 30 },

    // Sales — Bar — 2026-07-20
    { business_day: "2026-07-20", type: "SALE", product_id: PRODUCTS.heineken, from_department_id: BAR, quantity: 33 },
    { business_day: "2026-07-20", type: "SALE", product_id: PRODUCTS.starLager, from_department_id: BAR, quantity: 30 },
    { business_day: "2026-07-20", type: "SALE", product_id: PRODUCTS.starRadler, from_department_id: BAR, quantity: 14 },
    { business_day: "2026-07-20", type: "SALE", product_id: PRODUCTS.trophyLager, from_department_id: BAR, quantity: 16 },
    { business_day: "2026-07-20", type: "SALE", product_id: PRODUCTS.chivas, from_department_id: BAR, quantity: 1 },
    { business_day: "2026-07-20", type: "SALE", product_id: PRODUCTS.jameson, from_department_id: BAR, quantity: 2 },
    { business_day: "2026-07-20", type: "SALE", product_id: PRODUCTS.evaWater, from_department_id: BAR, quantity: 10 },
    { business_day: "2026-07-20", type: "SALE", product_id: PRODUCTS.coke, from_department_id: BAR, quantity: 20 },

    // Sales — Kitchen — 2026-07-20
    { business_day: "2026-07-20", type: "SALE", product_id: PRODUCTS.evaWater, from_department_id: KITCHEN, quantity: 15 },
    { business_day: "2026-07-20", type: "SALE", product_id: PRODUCTS.coke, from_department_id: KITCHEN, quantity: 10 },
    { business_day: "2026-07-20", type: "SALE", product_id: PRODUCTS.vegOil, from_department_id: KITCHEN, quantity: 12 },
    { business_day: "2026-07-20", type: "SALE", product_id: PRODUCTS.tomatoPuree, from_department_id: KITCHEN, quantity: 8 },
  ].map((m) => ({ ...m, created_by: userId }));

  const { error: movementsError } = await supabase.from("movements").insert(movements);
  if (movementsError) throw movementsError;
  console.log(`Inserted ${movements.length} sample movements.`);
}

main()
  .then(() => {
    console.log("Seed complete.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
