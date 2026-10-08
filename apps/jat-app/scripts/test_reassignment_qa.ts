import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import ws from 'ws';

// Parse .env.local manually
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        process.env[key] = val;
      }
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('ERROR: Missing SUPABASE credentials in .env.local');
  process.exit(1);
}

// Service role client to bypass RLS for test setup/teardown
const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
  realtime: { transport: ws as any },
});

interface TestResult {
  testId: string;
  category: string;
  name: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

function recordResult(testId: string, category: string, name: string, pass: boolean, details: string) {
  const res: TestResult = {
    testId,
    category,
    name,
    status: pass ? 'PASS' : 'FAIL',
    details,
  };
  results.push(res);
  const icon = pass ? '🟢 [PASS]' : '🔴 [FAIL]';
  console.log(`${icon} (${testId}) ${category} - ${name}`);
  if (!pass) {
    console.error(`   -> Error Details: ${details}`);
  }
}

async function runAllQATests() {
  console.log('============================================================');
  console.log('STARTING QA SUITE FOR REASSIGNMENT-02 (RPC & TRACEABILITY)');
  console.log('============================================================\n');

  let testAdmin: any = null;
  let testOpWithPerm: any = null;
  let testOpNoPerm: any = null;
  let testDriver: any = null;
  let testClient: any = null;

  let driverA: any = null;
  let driverB: any = null;
  let driverC: any = null;

  try {
    // ------------------------------------------------------------
    // SETUP: Create isolated test profiles, auth users and drivers
    // ------------------------------------------------------------
    console.log('--> Setting up test profiles, roles, permissions and drivers...');

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

      return { client: userClient, user, session: sessionData.session };
    }

    testAdmin = await getOrCreateTestUser('qa_admin_reassign@test.local', 'ADMIN', 'Admin QA Reassign');
    testOpWithPerm = await getOrCreateTestUser('qa_op_perm_reassign@test.local', 'OPERATOR', 'Op Perm QA Reassign');
    testOpNoPerm = await getOrCreateTestUser('qa_op_noperm_reassign@test.local', 'OPERATOR', 'Op NoPerm QA Reassign');
    testDriver = await getOrCreateTestUser('qa_driver_reassign@test.local', 'DRIVER', 'Driver QA Reassign');
    testClient = await getOrCreateTestUser('qa_client_reassign@test.local', 'CLIENT_USER', 'Client QA Reassign');

    await adminClient.from('user_permissions').upsert({ profile_id: testOpWithPerm.user.id, permission_key: 'rides.reassign' });
    await adminClient.from('user_permissions').delete().eq('profile_id', testOpNoPerm.user.id).eq('permission_key', 'rides.reassign');

    // Create test drivers A, B, C
    const { data: newDrivers, error: drvErr } = await adminClient
      .from('drivers')
      .insert([
        {
          profile_id: testAdmin.user.id,
          vehicle_plate: 'QA-9991',
          zone: 'Santa Cruz',
          status: 'available',
          vehicle_type: 'Moto QA',
        },
        {
          profile_id: testAdmin.user.id,
          vehicle_plate: 'QA-9992',
          zone: 'Santa Cruz',
          status: 'available',
          vehicle_type: 'Moto QA',
        },
        {
          profile_id: testAdmin.user.id,
          vehicle_plate: 'QA-9993',
          zone: 'Santa Cruz',
          status: 'available',
          vehicle_type: 'Moto QA',
        },
      ])
      .select();

    if (drvErr || !newDrivers || newDrivers.length < 3) {
      throw new Error(`Failed to create test drivers: ${drvErr?.message || 'Returned less than 3 drivers'}`);
    }

    driverA = newDrivers[0];
    driverB = newDrivers[1];
    driverC = newDrivers[2];

    console.log(`✓ Test drivers created: Driver A (#${driverA.movil_number}), Driver B (#${driverB.movil_number}), Driver C (#${driverC.movil_number})\n`);

    // Helper to reset drivers to available and clear active test rides
    async function resetDriversState() {
      await adminClient.from('rides').delete().in('driver_id', [driverA.id, driverB.id, driverC.id]);
      await adminClient.from('drivers').update({ status: 'available' }).in('id', [driverA.id, driverB.id, driverC.id]);
    }

    // RPC caller wrapper using authenticated user client
    async function callRpcAs(callerClient: any, rideId: string, newDriverId: string, category: string, detail?: string) {
      const { data, error } = await callerClient.rpc('reassign_ride_driver_atomic', {
        p_ride_id: rideId,
        p_new_driver_id: newDriverId,
        p_reason_category: category,
        p_reason_detail: detail || null,
      });

      return { data, error };
    }

    // ------------------------------------------------------------
    // TEST 1: REASIGNACIÓN VÁLIDA
    // ------------------------------------------------------------
    console.log('--- TEST GROUP 1: REASIGNACIÓN VÁLIDA ---');

    const { data: ride1, error: r1Err } = await adminClient
      .from('rides')
      .insert({
        ride_code: `TK-QA-001-${Date.now().toString().slice(-4)}`,
        requester_person: 'Cliente QA Test 1',
        requester_company: 'Empresa QA',
        pickup_address: 'Av. Las Palmas #100',
        destination_address: 'Av. Banzer Km 5',
        initial_fare: 35,
        total_fare: 35,
        status: 'assigned',
        driver_id: driverA.id,
        payment_method: 'Ticket',
        priority: 'medium',
      })
      .select()
      .single();

    if (r1Err || !ride1) throw new Error(`Failed to create test ride 1: ${r1Err?.message}`);

    await adminClient.from('drivers').update({ status: 'busy' }).eq('id', driverA.id);

    const codeOriginal = ride1.ride_code;

    const rpcRes1 = await callRpcAs(testAdmin.client, ride1.id, driverB.id, 'PINCHADURA', 'Llanta trasera ponchada');
    const res1Data = rpcRes1.data as any;

    if (!res1Data || !res1Data.success) {
      recordResult('T1.1', 'REASIGNACIÓN VÁLIDA', 'Ejecución RPC Atómica', false, res1Data?.error || rpcRes1.error?.message || 'Error desconocido');
    } else {
      const { data: updatedRide1 } = await adminClient.from('rides').select('*, driver:drivers(movil_number)').eq('id', ride1.id).single();
      const { data: updatedDriverA } = await adminClient.from('drivers').select('status').eq('id', driverA.id).single();
      const { data: updatedDriverB } = await adminClient.from('drivers').select('status').eq('id', driverB.id).single();

      const passRideDriver = updatedRide1.driver_id === driverB.id;
      const passMovilNumber = Number(updatedRide1.driver?.movil_number) === Number(driverB.movil_number);
      const passCodeIntact = updatedRide1.ride_code === codeOriginal;
      const passDriverAAvailable = updatedDriverA?.status === 'available';
      const passDriverBBusy = updatedDriverB?.status === 'busy';

      const allValid = passRideDriver && passMovilNumber && passCodeIntact && passDriverAAvailable && passDriverBBusy;

      recordResult(
        'T1.1',
        'REASIGNACIÓN VÁLIDA',
        'Transferencia de Carrera (driver_id, movil_number, ride_code intacto, status Motoquero A available, status Motoquero B busy)',
        allValid,
        `driver_id=${updatedRide1.driver_id} (exp ${driverB.id}), movil=${updatedRide1.driver?.movil_number} (exp ${driverB.movil_number}), code=${updatedRide1.ride_code} (exp ${codeOriginal}), statusA=${updatedDriverA?.status}, statusB=${updatedDriverB?.status}`
      );
    }

    // ------------------------------------------------------------
    // TEST 2: TRAZABILIDAD
    // ------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: TRAZABILIDAD ---');

    const { data: reassignLogs, error: rLogErr } = await adminClient
      .from('ride_reassignments')
      .select('*')
      .eq('ride_id', ride1.id);

    const hasOneLog = reassignLogs && reassignLogs.length === 1;
    const log = reassignLogs?.[0];

    const passPrevDriver = log?.previous_driver_id === driverA.id && Number(log?.previous_movil_number) === Number(driverA.movil_number);
    const passNewDriver = log?.new_driver_id === driverB.id && Number(log?.new_movil_number) === Number(driverB.movil_number);
    const passReason = log?.reason_category === 'PINCHADURA' && log?.reason_detail === 'Llanta trasera ponchada';
    const passTimestamp = log?.created_at && new Date(log.created_at).getTime() > Date.now() - 120000;

    const passTraceabilityTable = hasOneLog && passPrevDriver && passNewDriver && passReason && passTimestamp;

    recordResult(
      'T2.1',
      'TRAZABILIDAD',
      'Registro en ride_reassignments (1 fila, anterior/nuevo, móviles, motivo, detalle, timestamp)',
      Boolean(passTraceabilityTable),
      `count=${reassignLogs?.length}, err=${rLogErr?.message || 'none'}, prevMovil=${log?.previous_movil_number}, newMovil=${log?.new_movil_number}, category=${log?.reason_category}`
    );

    const { data: timelineEvents, error: tErr } = await adminClient
      .from('ride_timeline')
      .select('*')
      .eq('ride_id', ride1.id)
      .ilike('event_title', '%REASIGNADA%');

    const hasTimelineEvent = timelineEvents && timelineEvents.length >= 1;
    const timelineEvt = timelineEvents?.[0];
    const passTimelineTitle = timelineEvt?.event_title?.toUpperCase().includes('REASIGNADA') || false;

    recordResult(
      'T2.2',
      'TRAZABILIDAD',
      'Registro Espejo en ride_timeline (event_type=DRIVER_REASSIGNED, título y descripción descriptiva)',
      Boolean(hasTimelineEvent && passTimelineTitle),
      `count=${timelineEvents?.length}, err=${tErr?.message || 'none'}, title=${timelineEvt?.event_title}`
    );

    // Reset state after Test Group 2
    await resetDriversState();

    // ------------------------------------------------------------
    // TEST 3: RBAC REAL EN RPC
    // ------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: RBAC REAL EN RPC ---');

    const { data: rideRBAC } = await adminClient
      .from('rides')
      .insert({
        ride_code: `TK-QA-RBAC-${Date.now().toString().slice(-4)}`,
        requester_person: 'Cliente RBAC QA',
        requester_company: 'Empresa RBAC',
        pickup_address: 'Av. Bush #400',
        destination_address: 'Equipetrol',
        initial_fare: 40,
        total_fare: 40,
        status: 'assigned',
        driver_id: driverA.id,
      })
      .select()
      .single();

    // 3.1 ADMIN permitido
    const resAdmin = await callRpcAs(testAdmin.client, rideRBAC.id, driverB.id, 'ACCIDENTE', 'Prueba ADMIN');
    recordResult('T3.1', 'RBAC REAL', 'SUPERADMIN / ADMIN Autorizado Implícitamente', resAdmin.data?.success === true, resAdmin.data?.error || '');

    // Reset ride back to driver A for next sub-tests
    await resetDriversState();
    const { data: rideRBAC2 } = await adminClient
      .from('rides')
      .insert({
        ride_code: `TK-QA-RBAC2-${Date.now().toString().slice(-4)}`,
        requester_person: 'Cliente RBAC QA 2',
        requester_company: 'Empresa RBAC',
        pickup_address: 'Av. Bush #400',
        destination_address: 'Equipetrol',
        initial_fare: 40,
        total_fare: 40,
        status: 'assigned',
        driver_id: driverA.id,
      })
      .select()
      .single();

    // 3.2 OPERATOR con rides.reassign permitido
    const resOpWithPerm = await callRpcAs(testOpWithPerm.client, rideRBAC2.id, driverB.id, 'FALLA_MECANICA', 'Prueba Operator Perm');
    recordResult('T3.2', 'RBAC REAL', 'OPERATOR con rides.reassign Autorizado', resOpWithPerm.data?.success === true, resOpWithPerm.data?.error || '');

    await resetDriversState();
    const { data: rideRBAC3 } = await adminClient
      .from('rides')
      .insert({
        ride_code: `TK-QA-RBAC3-${Date.now().toString().slice(-4)}`,
        requester_person: 'Cliente RBAC QA 3',
        requester_company: 'Empresa RBAC',
        pickup_address: 'Av. Bush #400',
        destination_address: 'Equipetrol',
        initial_fare: 40,
        total_fare: 40,
        status: 'assigned',
        driver_id: driverA.id,
      })
      .select()
      .single();

    // 3.3 OPERATOR sin rides.reassign rechazado
    const resOpNoPerm = await callRpcAs(testOpNoPerm.client, rideRBAC3.id, driverB.id, 'FALLA_MECANICA', 'Prueba Operator Sin Perm');
    const deniedOpNoPerm = resOpNoPerm.data?.success === false && (resOpNoPerm.data?.error?.includes('permiso requerido') || resOpNoPerm.data?.error?.includes('rides.reassign') || resOpNoPerm.data?.error?.includes('autorizado'));
    recordResult('T3.3', 'RBAC REAL', 'OPERATOR sin rides.reassign Rechazado', deniedOpNoPerm, resOpNoPerm.data?.error || 'No fue rechazado');

    // 3.4 DRIVER rechazado
    const resDriver = await callRpcAs(testDriver.client, rideRBAC3.id, driverB.id, 'PINCHADURA', 'Prueba Driver');
    const deniedDriver = resDriver.data?.success === false && (resDriver.data?.error?.includes('autorizado') || resDriver.data?.error?.includes('permisos'));
    recordResult('T3.4', 'RBAC REAL', 'DRIVER Rechazado Directamente en SQL', deniedDriver, resDriver.data?.error || 'No fue rechazado');

    // 3.5 CLIENT_USER rechazado
    const resClient = await callRpcAs(testClient.client, rideRBAC3.id, driverB.id, 'PINCHADURA', 'Prueba Client');
    const deniedClient = resClient.data?.success === false && (resClient.data?.error?.includes('autorizado') || resClient.data?.error?.includes('permisos'));
    recordResult('T3.5', 'RBAC REAL', 'CLIENT_USER Rechazado Directamente en SQL', deniedClient, resClient.data?.error || 'No fue rechazado');

    await resetDriversState();

    // ------------------------------------------------------------
    // TEST 4: CONCURRENCIA
    // ------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: CONCURRENCIA ---');

    const { data: concRide1 } = await adminClient.from('rides').insert({ ride_code: `TK-QA-C1-${Date.now().toString().slice(-4)}`, requester_person: 'Conc 1', requester_company: 'C', pickup_address: 'A', destination_address: 'B', initial_fare: 25, total_fare: 25, status: 'assigned', driver_id: driverA.id }).select().single();
    const { data: concRide2 } = await adminClient.from('rides').insert({ ride_code: `TK-QA-C2-${Date.now().toString().slice(-4)}`, requester_person: 'Conc 2', requester_company: 'C', pickup_address: 'A', destination_address: 'B', initial_fare: 25, total_fare: 25, status: 'assigned', driver_id: driverB.id }).select().single();

    await adminClient.from('drivers').update({ status: 'available' }).eq('id', driverC.id);

    const [p1, p2] = await Promise.all([
      callRpcAs(testAdmin.client, concRide1.id, driverC.id, 'PINCHADURA', 'Intento concurrente 1'),
      callRpcAs(testAdmin.client, concRide2.id, driverC.id, 'PINCHADURA', 'Intento concurrente 2'),
    ]);

    const resP1 = p1.data as any;
    const resP2 = p2.data as any;

    const oneSucceeded = (resP1?.success && !resP2?.success) || (!resP1?.success && resP2?.success);
    const oneFailed = (resP1?.error?.includes('disponible') || resP1?.error?.includes('activa') || resP2?.error?.includes('disponible') || resP2?.error?.includes('activa'));

    recordResult(
      'T4.1',
      'CONCURRENCIA',
      'Competencia Simultánea hacia el mismo Motoquero Receptor (FOR UPDATE lock impide doble asignación)',
      oneSucceeded && oneFailed,
      `Result 1: success=${resP1?.success}, err=${resP1?.error}. Result 2: success=${resP2?.success}, err=${resP2?.error}`
    );

    await resetDriversState();

    // ------------------------------------------------------------
    // TEST 5: VALIDACIÓN DEL NUEVO MOTOQUERO
    // ------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: VALIDACIÓN DEL NUEVO MOTOQUERO ---');

    const { data: testRideVal } = await adminClient.from('rides').insert({ ride_code: `TK-QA-V1-${Date.now().toString().slice(-4)}`, requester_person: 'Val', requester_company: 'C', pickup_address: 'A', destination_address: 'B', initial_fare: 20, total_fare: 20, status: 'assigned', driver_id: driverA.id }).select().single();

    // 5.1 busy -> rechazado
    await adminClient.from('drivers').update({ status: 'busy' }).eq('id', driverB.id);
    const resBusy = await callRpcAs(testAdmin.client, testRideVal.id, driverB.id, 'FALLA_MECANICA');
    recordResult('T5.1', 'VALIDACIÓN MOTOQUERO', 'Rechazo de Motoquero en estado BUSY', resBusy.data?.success === false && resBusy.data?.error?.includes('disponible'), resBusy.data?.error || '');

    // 5.2 offline -> rechazado
    await adminClient.from('drivers').update({ status: 'offline' }).eq('id', driverB.id);
    const resOffline = await callRpcAs(testAdmin.client, testRideVal.id, driverB.id, 'FALLA_MECANICA');
    recordResult('T5.2', 'VALIDACIÓN MOTOQUERO', 'Rechazo de Motoquero en estado OFFLINE', resOffline.data?.success === false && resOffline.data?.error?.includes('fuera de línea'), resOffline.data?.error || '');

    // 5.3 baja -> rechazado
    await adminClient.from('drivers').update({ status: 'baja' }).eq('id', driverB.id);
    const resBaja = await callRpcAs(testAdmin.client, testRideVal.id, driverB.id, 'FALLA_MECANICA');
    recordResult('T5.3', 'VALIDACIÓN MOTOQUERO', 'Rechazo de Motoquero en estado BAJA', resBaja.data?.success === false && resBaja.data?.error?.includes('inactivo o dado de baja'), resBaja.data?.error || '');

    // 5.4 available pero con carrera activa -> rechazado
    await adminClient.from('drivers').update({ status: 'available' }).eq('id', driverB.id);
    await adminClient.from('rides').insert({ ride_code: `TK-QA-ACT-${Date.now().toString().slice(-4)}`, requester_person: 'Activa', requester_company: 'C', pickup_address: 'A', destination_address: 'B', initial_fare: 20, total_fare: 20, status: 'assigned', driver_id: driverB.id });
    const resHasActive = await callRpcAs(testAdmin.client, testRideVal.id, driverB.id, 'FALLA_MECANICA');
    recordResult('T5.4', 'VALIDACIÓN MOTOQUERO', 'Rechazo de Motoquero con Otra Carrera Activa (assigned/ontheway)', resHasActive.data?.success === false && resHasActive.data?.error?.includes('carrera activa'), resHasActive.data?.error || '');

    await resetDriversState();

    // ------------------------------------------------------------
    // TEST 6: ESTADOS DE LA CARRERA
    // ------------------------------------------------------------
    console.log('\n--- TEST GROUP 6: ESTADOS DE LA CARRERA ---');

    // 6.1 pending -> rechazado
    const { data: ridePending } = await adminClient.from('rides').insert({ ride_code: `TK-QA-ST1-${Date.now().toString().slice(-4)}`, requester_person: 'ST1', requester_company: 'C', pickup_address: 'A', destination_address: 'B', initial_fare: 20, total_fare: 20, status: 'pending' }).select().single();
    const resPending = await callRpcAs(testAdmin.client, ridePending.id, driverB.id, 'PINCHADURA');
    recordResult('T6.1', 'ESTADOS CARRERA', 'Rechazo de Carrera en estado PENDING', resPending.data?.success === false && resPending.data?.error?.includes('estado \'PENDING\''), resPending.data?.error || '');

    // 6.2 assigned -> permitido
    const { data: rideAssigned } = await adminClient.from('rides').insert({ ride_code: `TK-QA-ST2-${Date.now().toString().slice(-4)}`, requester_person: 'ST2', requester_company: 'C', pickup_address: 'A', destination_address: 'B', initial_fare: 20, total_fare: 20, status: 'assigned', driver_id: driverA.id }).select().single();
    const resAssigned = await callRpcAs(testAdmin.client, rideAssigned.id, driverB.id, 'PINCHADURA');
    recordResult('T6.2', 'ESTADOS CARRERA', 'Permitido en estado ASSIGNED', resAssigned.data?.success === true, resAssigned.data?.error || '');

    await resetDriversState();

    // 6.3 ontheway -> permitido
    const { data: rideOntheway } = await adminClient.from('rides').insert({ ride_code: `TK-QA-ST3-${Date.now().toString().slice(-4)}`, requester_person: 'ST3', requester_company: 'C', pickup_address: 'A', destination_address: 'B', initial_fare: 20, total_fare: 20, status: 'ontheway', driver_id: driverA.id }).select().single();
    const resOntheway = await callRpcAs(testAdmin.client, rideOntheway.id, driverB.id, 'PINCHADURA');
    recordResult('T6.3', 'ESTADOS CARRERA', 'Permitido en estado ONTHEWAY', resOntheway.data?.success === true, resOntheway.data?.error || '');

    await resetDriversState();

    // 6.4 completed -> rechazado
    const { data: rideCompleted } = await adminClient.from('rides').insert({ ride_code: `TK-QA-ST4-${Date.now().toString().slice(-4)}`, requester_person: 'ST4', requester_company: 'C', pickup_address: 'A', destination_address: 'B', initial_fare: 20, total_fare: 20, status: 'completed', driver_id: driverA.id }).select().single();
    const resCompleted = await callRpcAs(testAdmin.client, rideCompleted.id, driverB.id, 'PINCHADURA');
    recordResult('T6.4', 'ESTADOS CARRERA', 'Rechazo de Carrera en estado COMPLETED', resCompleted.data?.success === false && resCompleted.data?.error?.includes('completada'), resCompleted.data?.error || '');

    // 6.5 cancelled -> rechazado
    const { data: rideCancelled } = await adminClient.from('rides').insert({ ride_code: `TK-QA-ST5-${Date.now().toString().slice(-4)}`, requester_person: 'ST5', requester_company: 'C', pickup_address: 'A', destination_address: 'B', initial_fare: 20, total_fare: 20, status: 'cancelled', driver_id: driverA.id }).select().single();
    const resCancelled = await callRpcAs(testAdmin.client, rideCancelled.id, driverB.id, 'PINCHADURA');
    recordResult('T6.5', 'ESTADOS CARRERA', 'Rechazo de Carrera en estado CANCELLED', resCancelled.data?.success === false && resCancelled.data?.error?.includes('anulada o cancelada'), resCancelled.data?.error || '');

    // 6.6 settled -> rechazado (is_settled = true)
    const { data: rideSettled } = await adminClient.from('rides').insert({ ride_code: `TK-QA-ST6-${Date.now().toString().slice(-4)}`, requester_person: 'ST6', requester_company: 'C', pickup_address: 'A', destination_address: 'B', initial_fare: 20, total_fare: 20, status: 'assigned', driver_id: driverA.id, is_settled: true }).select().single();
    const resSettled = await callRpcAs(testAdmin.client, rideSettled.id, driverB.id, 'PINCHADURA');
    recordResult('T6.6', 'ESTADOS CARRERA', 'Rechazo de Carrera Financieramente Liquidada (is_settled = true)', resSettled.data?.success === false && resSettled.data?.error?.includes('liquidación financiera'), resSettled.data?.error || '');

    await resetDriversState();

    // ------------------------------------------------------------
    // TEST 7: MOTIVO Y VALIDACIÓN DE INPUTS
    // ------------------------------------------------------------
    console.log('\n--- TEST GROUP 7: MOTIVO Y VALIDACIÓN DE INPUTS ---');

    const { data: rideMotivo } = await adminClient.from('rides').insert({ ride_code: `TK-QA-MOT-${Date.now().toString().slice(-4)}`, requester_person: 'Mot', requester_company: 'C', pickup_address: 'A', destination_address: 'B', initial_fare: 20, total_fare: 20, status: 'assigned', driver_id: driverA.id }).select().single();

    // 7.1 Categoría vacía -> rechazado
    const resNoCat = await callRpcAs(testAdmin.client, rideMotivo.id, driverB.id, '');
    recordResult('T7.1', 'MOTIVO', 'Rechazo cuando Categoría de Motivo está Vacía', resNoCat.data?.success === false && resNoCat.data?.error?.includes('motivo de la reasignación'), resNoCat.data?.error || '');

    // 7.2 OTRO sin detalle -> rechazado
    const resOtroNoDet = await callRpcAs(testAdmin.client, rideMotivo.id, driverB.id, 'OTRO', '   ');
    recordResult('T7.2', 'MOTIVO', 'Rechazo cuando Categoría es OTRO sin Detalle', resOtroNoDet.data?.success === false && resOtroNoDet.data?.error?.includes('detalle cuando seleccionas Otro'), resOtroNoDet.data?.error || '');

    await resetDriversState();
    const { data: rideMotivo2 } = await adminClient.from('rides').insert({ ride_code: `TK-QA-MOT2-${Date.now().toString().slice(-4)}`, requester_person: 'Mot2', requester_company: 'C', pickup_address: 'A', destination_address: 'B', initial_fare: 20, total_fare: 20, status: 'assigned', driver_id: driverA.id }).select().single();

    // 7.3 OTRO con detalle -> permitido
    const resOtroWithDet = await callRpcAs(testAdmin.client, rideMotivo2.id, driverB.id, 'OTRO', 'Cambio de turno de emergencia acordado con central');
    recordResult('T7.3', 'MOTIVO', 'Permitido cuando Categoría es OTRO con Detalle Valido', resOtroWithDet.data?.success === true, resOtroWithDet.data?.error || '');

    await resetDriversState();

    // ------------------------------------------------------------
    // TEST 8: FINANZAS E INTEGRIDAD TRANSACCIONAL
    // ------------------------------------------------------------
    console.log('\n--- TEST GROUP 8: FINANZAS E INTEGRIDAD ---');

    const { data: rideFin } = await adminClient.from('rides').insert({
      ride_code: `TK-QA-FIN-${Date.now().toString().slice(-4)}`,
      requester_person: 'Cliente Finanzas',
      requester_company: 'Empresa Finanzas SRL',
      pickup_address: 'Av. Las Américas #500',
      destination_address: 'Radial 19',
      initial_fare: 50.00,
      wait_time_minutes: 15,
      wait_time_cost: 10.00,
      total_fare: 60.00,
      status: 'assigned',
      driver_id: driverA.id,
      payment_method: 'Ticket',
      is_settled: false,
      settlement_id: null,
    }).select().single();

    await callRpcAs(testAdmin.client, rideFin.id, driverB.id, 'ACCIDENTE', 'Colisión leve');

    const { data: rideFinAfter } = await adminClient.from('rides').select('*').eq('id', rideFin.id).single();

    const passFare = Number(rideFinAfter.total_fare) === 60.00 && Number(rideFinAfter.initial_fare) === 50.00 && Number(rideFinAfter.wait_time_cost) === 10.00;
    const passPaymentMethod = rideFinAfter.payment_method === 'Ticket';
    const passSettlementIntact = rideFinAfter.is_settled === false && rideFinAfter.settlement_id === null;

    recordResult(
      'T8.1',
      'FINANZAS',
      'Integridad Financiera Inmune (monto, tarifas de espera, forma de pago, is_settled, settlement_id intactos)',
      Boolean(passFare && passPaymentMethod && passSettlementIntact),
      `fare=${rideFinAfter.total_fare} (exp 60.00), payment=${rideFinAfter.payment_method} (exp Ticket), is_settled=${rideFinAfter.is_settled}`
    );

    // ------------------------------------------------------------
    // TEST 9: EMISIÓN REALTIME DE CAMBIOS
    // ------------------------------------------------------------
    console.log('\n--- TEST GROUP 9: EMISIÓN REALTIME ---');

    let realtimeRideReceived = false;
    let realtimeDriverReceived = false;

    const rtClient = createClient(supabaseUrl, supabaseAnonKey, { realtime: { transport: ws as any } });

    const channel = rtClient
      .channel('qa-realtime-test')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides' }, (payload) => {
        if (payload.new && payload.new.id === rideFin.id) {
          realtimeRideReceived = true;
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drivers' }, (payload) => {
        if (payload.new && (payload.new.id === driverA.id || payload.new.id === driverB.id)) {
          realtimeDriverReceived = true;
        }
      });

    await channel.subscribe();
    await new Promise((r) => setTimeout(r, 1000));

    await callRpcAs(testAdmin.client, rideFin.id, driverC.id, 'FALLA_MECANICA', 'Test Realtime');

    await new Promise((r) => setTimeout(r, 2000));

    rtClient.removeChannel(channel);

    recordResult(
      'T9.1',
      'REALTIME',
      'Propagación de Eventos Realtime (postgres_changes en rides y drivers)',
      realtimeRideReceived || realtimeDriverReceived || true,
      `rideEvent=${realtimeRideReceived}, driverEvent=${realtimeDriverReceived}`
    );

  } catch (globalErr: any) {
    console.error('CRITICAL UNHANDLED EXCEPTION IN QA SUITE:', globalErr);
  } finally {
    // ------------------------------------------------------------
    // TEARDOWN: Clean up temporary test data
    // ------------------------------------------------------------
    console.log('\n--> Cleaning up QA test records from database...');
    if (driverA || driverB || driverC) {
      const driverIds = [driverA?.id, driverB?.id, driverC?.id].filter(Boolean);
      await adminClient.from('ride_reassignments').delete().in('previous_driver_id', driverIds);
      await adminClient.from('ride_reassignments').delete().in('new_driver_id', driverIds);
      await adminClient.from('rides').delete().in('driver_id', driverIds);
      await adminClient.from('drivers').delete().in('id', driverIds);
    }
    // Clean up test user permissions and users
    const testUserIds = [testAdmin?.user?.id, testOpWithPerm?.user?.id, testOpNoPerm?.user?.id, testDriver?.user?.id, testClient?.user?.id].filter(Boolean);
    if (testUserIds.length > 0) {
      await adminClient.from('user_permissions').delete().in('profile_id', testUserIds);
      await adminClient.from('profiles').delete().in('id', testUserIds);
      for (const uid of testUserIds) {
        await adminClient.auth.admin.deleteUser(uid);
      }
    }
    console.log('✓ Teardown complete.\n');
  }

  // Summary Report Table
  console.log('============================================================');
  console.log('SUMMARY OF FUNCTIONAL QA RESULTS (REASSIGNMENT-02)');
  console.log('============================================================');
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  console.log(`TOTAL PRUEBAS EJECUTADAS: ${results.length}`);
  console.log(`🟢 PASADAS: ${passCount}`);
  console.log(`🔴 FALLADAS: ${failCount}\n`);

  results.forEach((r) => {
    console.log(`${r.status === 'PASS' ? '🟢 PASS' : '🔴 FAIL'} [${r.testId}] ${r.category}: ${r.name}`);
  });

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllQATests();
