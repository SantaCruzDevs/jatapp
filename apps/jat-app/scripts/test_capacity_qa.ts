import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import ws from 'ws';

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env: any = {};
envContent.split('\n').forEach((line) => {
  const [k, v] = line.split('=');
  if (k && v) env[k.trim()] = v.trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
  realtime: { transport: ws as any },
});

async function getOrCreateTestUser(email: string, role: string, fullName: string) {
  const { data: usersData } = await adminClient.auth.admin.listUsers();
  let user = usersData?.users?.find((u) => u.email === email);

  if (!user) {
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !newUser.user) {
      throw new Error(`Failed to create auth user ${email}: ${createErr?.message}`);
    }
    user = newUser.user;
  }

  await adminClient.from('profiles').upsert({
    id: user.id,
    full_name: fullName,
    role: role as any,
  });

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    realtime: { transport: ws as any },
  });

  const { data: sessionData, error: signErr } = await userClient.auth.signInWithPassword({
    email,
    password: 'TestPassword123!',
  });

  if (signErr || !sessionData.session) {
    throw new Error(`Failed to sign in as ${email}: ${signErr?.message}`);
  }

  return { user, userClient, token: sessionData.session.access_token };
}

async function runCapacityQA() {
  console.log('============================================================');
  console.log('QA SUITE COMPLETA DE CONTROL DE CARGA OPERATIVA Y PREASIGNACIÓN (REASSIGNMENT-03)');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail: string = '') {
    if (condition) {
      console.log(`🟢 PASS: ${testName} ${detail ? '- ' + detail : ''}`);
      passed++;
    } else {
      console.error(`🔴 FAIL: ${testName} ${detail ? '- ' + detail : ''}`);
      failed++;
    }
  }

  try {
    const { userClient: adminUserClient } = await getOrCreateTestUser(
      'admin_cap_qa@motojat.com',
      'ADMIN',
      'Admin Cap QA'
    );
    const { user: driverAuthUser, userClient: driverUserClient } = await getOrCreateTestUser(
      'driver_cap_qa@motojat.com',
      'DRIVER',
      'Driver Cap QA'
    );

    // 1. PRUEBA 19: CASO EXISTENTE JORGE PEREZ / MÓVIL #1
    console.log(`--- PRUEBA 19: CASO EXISTENTE JORGE PEREZ / MÓVIL #1 ---`);
    const { data: jorgeDriver } = await adminClient
      .from('drivers')
      .select('id, movil_number, status, profile:profiles(full_name)')
      .eq('movil_number', 1)
      .single();

    if (jorgeDriver) {
      const { data: jorgeRides } = await adminClient
        .from('rides')
        .select('id, ride_code, status')
        .eq('driver_id', jorgeDriver.id)
        .in('status', ['assigned', 'ontheway']);

      assert(
        (jorgeRides?.length || 0) >= 3,
        'Preservación de datos históricos de Jorge Perez / Móvil #1',
        `3 carreras históricas activas preservadas intactas (${jorgeRides?.map((r) => r.ride_code).join(', ')})`
      );

      const { data: dummyRide } = await adminClient
        .from('rides')
        .insert({
          ride_code: `TK-QA-CAP-${Math.floor(1000 + Math.random() * 9000)}`,
          requester_person: 'QA Tester Jorge Overload',
          requester_company: 'Particular',
          pickup_address: 'Origen QA 19',
          destination_address: 'Destino QA 19',
          initial_fare: 25.0,
          total_fare: 25.0,
          status: 'pending',
          payment_method: 'Efectivo',
        })
        .select()
        .single();

      if (dummyRide) {
        const { data: assignRes } = await adminUserClient.rpc('assign_ride_driver_atomic', {
          p_ride_id: dummyRide.id,
          p_driver_id: jorgeDriver.id,
        });

        assert(
          assignRes?.success === false,
          'Impedir 4ta asignación a Jorge Perez (bloqueo por límite de capacidad)',
          `Respuesta RPC: "${assignRes?.error}"`
        );

        await adminClient.from('rides').delete().eq('id', dummyRide.id);
      }
    }

    // 2. ISOLATED TEST DRIVER SETUP (Móvil #999 linked to driverAuthUser)
    console.log(`\n--- PRUEBAS 1 A 4: MATRIZ DE CAPACIDADES SOBRE MÓVIL DE PRUEBA #999 ---`);

    let { data: testDriver } = await adminClient
      .from('drivers')
      .select('id, movil_number, status')
      .eq('profile_id', driverAuthUser.id)
      .maybeSingle();

    if (!testDriver) {
      const { data: newDrv } = await adminClient
        .from('drivers')
        .insert({
          profile_id: driverAuthUser.id,
          movil_number: 999,
          vehicle_type: 'Moto',
          vehicle_plate: 'QA-CAP-999',
          zone: 'Central',
          status: 'available',
        })
        .select()
        .single();
      testDriver = newDrv;
    }

    if (testDriver) {
      // Purge any old test rides for Móvil 999
      await adminClient.from('rides').delete().eq('driver_id', testDriver.id);
      await adminClient.from('drivers').update({ status: 'available' }).eq('id', testDriver.id);

      // Create 3 fresh test rides
      const { data: r1 } = await adminClient
        .from('rides')
        .insert({
          ride_code: `TK-QA-C1-${Math.floor(1000 + Math.random() * 9000)}`,
          requester_person: 'Cliente QA 1',
          requester_company: 'Particular',
          pickup_address: 'Origen C1',
          destination_address: 'Destino C1',
          initial_fare: 15.0,
          total_fare: 15.0,
          status: 'pending',
          payment_method: 'Efectivo',
        })
        .select()
        .single();

      const { data: r2 } = await adminClient
        .from('rides')
        .insert({
          ride_code: `TK-QA-C2-${Math.floor(1000 + Math.random() * 9000)}`,
          requester_person: 'Cliente QA 2',
          requester_company: 'Particular',
          pickup_address: 'Origen C2',
          destination_address: 'Destino C2',
          initial_fare: 20.0,
          total_fare: 20.0,
          status: 'pending',
          payment_method: 'Efectivo',
        })
        .select()
        .single();

      const { data: r3 } = await adminClient
        .from('rides')
        .insert({
          ride_code: `TK-QA-C3-${Math.floor(1000 + Math.random() * 9000)}`,
          requester_person: 'Cliente QA 3',
          requester_company: 'Particular',
          pickup_address: 'Origen C3',
          destination_address: 'Destino C3',
          initial_fare: 25.0,
          total_fare: 25.0,
          status: 'pending',
          payment_method: 'Efectivo',
        })
        .select()
        .single();

      if (r1 && r2 && r3) {
        // PRUEBA 1: Disponible (0+0) -> Asignar
        const { data: res1, error: rpc1Err } = await adminUserClient.rpc('assign_ride_driver_atomic', {
          p_ride_id: r1.id,
          p_driver_id: testDriver.id,
        });

        if (rpc1Err) console.error('rpc1Err:', rpc1Err);
        console.log('res1 data:', res1);

        assert(
          res1?.success === true && res1?.is_preassignment === false,
          'Prueba 1: Disponible (0+0) -> Asignación directa exitosa',
          res1?.message || res1?.error
        );

        // Transition r1 to 'ontheway' (1 ONTHEWAY + 0 ASSIGNED)
        await adminUserClient.rpc('update_ride_status_atomic', {
          p_ride_id: r1.id,
          p_new_status: 'ontheway',
        });

        // PRUEBA 2: Ocupado + 1 ONTHEWAY -> Preasignar
        const { data: res2 } = await adminUserClient.rpc('assign_ride_driver_atomic', {
          p_ride_id: r2.id,
          p_driver_id: testDriver.id,
        });

        assert(
          res2?.success === true && res2?.is_preassignment === true,
          'Prueba 2: Ocupado (1 ONTHEWAY + 0 ASSIGNED) -> Preasignación exitosa',
          res2?.message || res2?.error
        );

        // PRUEBA 3: Ocupado + 1 ONTHEWAY + 1 ASSIGNED -> rechazar
        const { data: res3 } = await adminUserClient.rpc('assign_ride_driver_atomic', {
          p_ride_id: r3.id,
          p_driver_id: testDriver.id,
        });

        assert(
          res3?.success === false,
          'Prueba 3: Ocupado (1 ONTHEWAY + 1 ASSIGNED) -> Rechazar 3ra carrera',
          `Error: "${res3?.error}"`
        );

        // PRUEBA 4: Liberación condicional de estado de motoquero
        // Complete r1 (ontheway). Driver still has r2 (assigned), so status must stay 'busy'
        await adminUserClient.rpc('update_ride_status_atomic', {
          p_ride_id: r1.id,
          p_new_status: 'completed',
          p_payment_method: 'Efectivo',
        });

        const { data: dStatusMid } = await adminClient.from('drivers').select('status').eq('id', testDriver.id).single();
        assert(
          dStatusMid?.status === 'busy',
          'Prueba 4: Motoquero permanece BUSY al finalizar 1ra carrera si aún le resta 1 carrera en espera',
          `Estado BD actual: ${dStatusMid?.status}`
        );

        // Complete r2 (assigned -> ontheway -> completed). NOW driver must become 'available'
        await adminUserClient.rpc('update_ride_status_atomic', {
          p_ride_id: r2.id,
          p_new_status: 'ontheway',
        });
        await adminUserClient.rpc('update_ride_status_atomic', {
          p_ride_id: r2.id,
          p_new_status: 'completed',
          p_payment_method: 'Efectivo',
        });

        const { data: dStatusFinal } = await adminClient.from('drivers').select('status').eq('id', testDriver.id).single();
        assert(
          dStatusFinal?.status === 'available',
          'Prueba 4: Motoquero pasa a AVAILABLE únicamente al concluir TODAS sus carreras activas',
          `Estado BD actual: ${dStatusFinal?.status}`
        );

        // PRUEBA 16: RBAC EN RPC
        console.log(`\n--- PRUEBA 16: BLOQUEO RBAC PARA ROL DRIVER EN RPC DE ASIGNACIÓN ---`);
        const { data: rbacRes } = await driverUserClient.rpc('assign_ride_driver_atomic', {
          p_ride_id: r3.id,
          p_driver_id: testDriver.id,
        });

        assert(
          rbacRes?.success === false,
          'Rol DRIVER bloqueado explícitamente en SQL para assign_ride_driver_atomic',
          `Respuesta RPC: "${rbacRes?.error}"`
        );

        // Cleanup test rides
        await adminClient.from('rides').delete().in('id', [r1.id, r2.id, r3.id]);
      }
    } else {
      console.error('Could not get or create test driver #999');
    }

  } catch (err: any) {
    console.error('Error durante la ejecución del QA:', err);
  }

  console.log('\n------------------------------------------------------------');
  console.log(`RESUMEN QA FUNCIONAL: ${passed} PASADOS | ${failed} FALLADOS`);
  console.log('------------------------------------------------------------\n');
}

runCapacityQA();
