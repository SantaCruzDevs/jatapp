'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Topbar from '@/components/layout/Topbar';
import { getRides, createRide, assignDriverToRide, updateRideStatus, approveSurcharge, rejectSurcharge, reassignRideDriver, RideWithDetails } from '@/lib/services/rides';
import { isRideTicketEligible, cancelDigitalTicket } from '@/lib/services/tickets';
import { getUserPermissions } from '@/lib/services/permissions';
import { findCustomerByPhone, createCustomer, CustomerWithCompany, searchUnifiedRequesters, UnifiedRequesterItem } from '@/lib/services/customers';
import { getDrivers, DriverWithProfile } from '@/lib/services/drivers';
import { getCompanies } from '@/lib/services/companies';
import { getRideTimeline, RideTimelineWithActor } from '@/lib/services/ride-timeline';
import { Company, RideStatus, RidePriority, PaymentMethod, ReassignmentReasonCategory } from '@/types/database.types';
import { createClient } from '@/lib/supabase/client';
import { getDispatchSettings, saveDispatchSettings, DispatchSettings } from '@/lib/services/settings';
import {
  saveOfflineRide,
  getOfflineRides,
  enqueueOfflineOperation,
  getCachedDrivers,
  setCachedDrivers,
  OfflineRide,
} from '@/lib/offline/db';
import { 
  Headset, 
  Plus, 
  RefreshCw, 
  Search, 
  Bike, 
  Clock, 
  MapPin, 
  UserCheck, 
  Building2, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Loader2, 
  Phone, 
  DollarSign, 
  History, 
  ChevronRight,
  ShieldCheck,
  Ban,
  FileText,
  Banknote,
  QrCode,
  GripVertical,
  Settings,
  AlertTriangle,
  Star,
  User
} from 'lucide-react';

export default function OperationsPage() {
  const [rides, setRides] = useState<RideWithDetails[]>([]);
  const [drivers, setDrivers] = useState<DriverWithProfile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Dispatch Settings, User Role & Realtime Ticker
  const [settings, setSettings] = useState<DispatchSettings>({
    unassignedYellowMin: 3,
    unassignedRedMin: 5,
    assignedYellowMin: 15,
    assignedRedMin: 20,
  });
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState<number>(Date.now());
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [tempSettings, setTempSettings] = useState<DispatchSettings>(settings);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Ticker for live dynamic timer calculations (recalculates every 10s without F5)
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTimestamp(Date.now());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch settings from Supabase Cloud
  const loadSettings = useCallback(async () => {
    try {
      const active = await getDispatchSettings();
      setSettings(active);
    } catch (e) {
      console.error('Error loading settings:', e);
    }
  }, []);

  // Drag & Drop States
  const [draggingRide, setDraggingRide] = useState<RideWithDetails | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  // Modal States
  const [isNewRideModalOpen, setIsNewRideModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [driverSearchQuery, setDriverSearchQuery] = useState('');

  // Active Selection for Modals
  const [selectedRideForAssign, setSelectedRideForAssign] = useState<RideWithDetails | null>(null);
  const [selectedRideForDetail, setSelectedRideForDetail] = useState<RideWithDetails | null>(null);
  const [selectedRideForCancel, setSelectedRideForCancel] = useState<RideWithDetails | null>(null);
  const [rideToComplete, setRideToComplete] = useState<RideWithDetails | null>(null);
  const [completionPaymentMethod, setCompletionPaymentMethod] = useState<PaymentMethod>('Efectivo');
  const [isTicketEligible, setIsTicketEligible] = useState<boolean>(true);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [isSubmittingCompletion, setIsSubmittingCompletion] = useState(false);
  const [hasCancelPermission, setHasCancelPermission] = useState<boolean>(false);
  const [hasReassignPermission, setHasReassignPermission] = useState<boolean>(false);
  const [isAnnullationModalOpen, setIsAnnullationModalOpen] = useState(false);
  const [rideToAnnul, setRideToAnnul] = useState<RideWithDetails | null>(null);
  const [annullationReason, setAnnullationReason] = useState('');
  const [isSubmittingAnnullation, setIsSubmittingAnnullation] = useState(false);

  // Reassignment Modal States
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [rideToReassign, setRideToReassign] = useState<RideWithDetails | null>(null);
  const [reassignDriverId, setReassignDriverId] = useState<string>('');
  const [reassignReasonCategory, setReassignReasonCategory] = useState<ReassignmentReasonCategory>('PINCHADURA');
  const [reassignReasonDetail, setReassignReasonDetail] = useState<string>('');
  const [isSubmittingReassign, setIsSubmittingReassign] = useState<boolean>(false);

  const [selectedRideTimeline, setSelectedRideTimeline] = useState<RideTimelineWithActor[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Cancellation Modal Handler
  const handleOpenCancelModal = (ride: RideWithDetails) => {
    setSelectedRideForCancel(ride);
    setCancelReason('');
    setIsCancelModalOpen(true);
  };

  const handleConfirmCancellation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRideForCancel) return;
    if (!cancelReason.trim()) {
      setErrorMsg('El motivo de cancelación es obligatorio.');
      return;
    }

    setIsSubmittingCancel(true);
    setErrorMsg(null);
    try {
      const { error } = await updateRideStatus(
        selectedRideForCancel.id,
        'cancelled',
        cancelReason.trim(),
        selectedRideForCancel.driver_id
      );

      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg(`Carrera ${selectedRideForCancel.ride_code} CANCELADA. Motivo registrado en timeline.`);
        setIsCancelModalOpen(false);
        setIsDetailModalOpen(false);
        setSelectedRideForCancel(null);
        setCancelReason('');
        await loadData(true);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  // Annullation Modal Handlers (Formal Ticket Invalidation)
  const handleOpenAnnullationModal = (ride: RideWithDetails) => {
    setErrorMsg(null);
    setRideToAnnul(ride);
    setAnnullationReason('');
    setIsAnnullationModalOpen(true);
  };

  const handleConfirmAnnullationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rideToAnnul) return;
    if (!annullationReason.trim()) {
      setErrorMsg('El motivo de anulación es obligatorio.');
      return;
    }

    setIsSubmittingAnnullation(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { success, error } = await cancelDigitalTicket(rideToAnnul.id, annullationReason.trim());
      if (error || !success) {
        setErrorMsg(error?.message || 'Error al anular el comprobante.');
      } else {
        setSuccessMsg(`Comprobante ${rideToAnnul.ride_code} ANULADO exitosamente.`);
        setIsAnnullationModalOpen(false);
        setIsDetailModalOpen(false);
        setRideToAnnul(null);
        setAnnullationReason('');
        await loadData(true);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsSubmittingAnnullation(false);
    }
  };

  // Reassignment Handlers
  const handleOpenReassignModal = (ride: RideWithDetails) => {
    setErrorMsg(null);
    setRideToReassign(ride);
    setReassignDriverId('');
    setReassignReasonCategory('PINCHADURA');
    setReassignReasonDetail('');
    setIsReassignModalOpen(true);
  };

  const handleConfirmReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rideToReassign) return;
    if (!reassignDriverId) {
      setErrorMsg('Debe seleccionar un nuevo motoquero receptor.');
      return;
    }
    if (reassignReasonCategory === 'OTRO' && !reassignReasonDetail.trim()) {
      setErrorMsg('Debe detallar el motivo cuando selecciona la categoría OTRO.');
      return;
    }

    setIsSubmittingReassign(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { success, error } = await reassignRideDriver({
        ride_id: rideToReassign.id,
        new_driver_id: reassignDriverId,
        reason_category: reassignReasonCategory,
        reason_detail: reassignReasonDetail.trim() || undefined,
      });

      if (error || !success) {
        setErrorMsg(error?.message || 'Error al reasignar la carrera.');
      } else {
        const newDrv = drivers.find((d) => d.id === reassignDriverId);
        const movilText = newDrv ? `Móvil #${newDrv.movil_number}` : 'nuevo motoquero';
        setSuccessMsg(`Carrera ${rideToReassign.ride_code} reasignada exitosamente a ${movilText}.`);
        setIsReassignModalOpen(false);
        setIsDetailModalOpen(false);
        setRideToReassign(null);
        setReassignDriverId('');
        setReassignReasonDetail('');
        await loadData(true);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsSubmittingReassign(false);
    }
  };

  // New Ride Form Fields
  const [phoneSearch, setPhoneSearch] = useState('');
  const [searchingPhone, setSearchingPhone] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<CustomerWithCompany | null>(null);
  const [customerNotFoundMessage, setCustomerNotFoundMessage] = useState<string | null>(null);

  // Unified Intelligent Search States
  const [unifiedSearchQuery, setUnifiedSearchQuery] = useState('');
  const [unifiedSearchResults, setUnifiedSearchResults] = useState<UnifiedRequesterItem[]>([]);
  const [isSearchingUnified, setIsSearchingUnified] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [selectedRequesterItem, setSelectedRequesterItem] = useState<UnifiedRequesterItem | null>(null);
  
  const [requesterPerson, setRequesterPerson] = useState('');
  const [requesterCompany, setRequesterCompany] = useState('Particular');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [initialFare, setInitialFare] = useState<number>(20);
  const [waitTimeMinutes, setWaitTimeMinutes] = useState<number>(0);
  const [waitTimeCost, setWaitTimeCost] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Efectivo');
  const [priority, setPriority] = useState<RidePriority>('high');
  const [observations, setObservations] = useState('');
  const [cargoDescription, setCargoDescription] = useState('');
  const [isSubmittingRide, setIsSubmittingRide] = useState(false);
  const [isProcessingSurcharge, setIsProcessingSurcharge] = useState(false);

  const handleApproveSurcharge = async (rideId: string) => {
    setIsProcessingSurcharge(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Optimistic state update
    setRides((prev) =>
      prev.map((r) => (r.id === rideId ? { ...r, surcharge_status: 'approved' as const } : r))
    );

    try {
      const { error } = await approveSurcharge(rideId);
      if (error) {
        setErrorMsg(error.message);
        await loadData(true);
      } else {
        setSuccessMsg('Sobrecargo APROBADO correctamente. Tarifa final actualizada.');
        await loadData(true);
        setIsDetailModalOpen(false);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
      await loadData(true);
    } finally {
      setIsProcessingSurcharge(false);
    }
  };

  const handleRejectSurcharge = async (rideId: string) => {
    setIsProcessingSurcharge(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Optimistic state update
    setRides((prev) =>
      prev.map((r) => (r.id === rideId ? { ...r, surcharge_status: 'rejected' as const } : r))
    );

    try {
      const { error } = await rejectSurcharge(rideId);
      if (error) {
        setErrorMsg(error.message);
        await loadData(true);
      } else {
        setSuccessMsg('Sobrecargo RECHAZADO. La tarifa se mantiene en el importe autorizado.');
        await loadData(true);
        setIsDetailModalOpen(false);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
      await loadData(true);
    } finally {
      setIsProcessingSurcharge(false);
    }
  };

  const driversRef = React.useRef<DriverWithProfile[]>(drivers);
  driversRef.current = drivers;

  // Fetch all initial data
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const supabase = createClient();
      let fetchedRides: RideWithDetails[] = [];
      let fetchedDrivers: DriverWithProfile[] = [];
      let fetchedCompanies: Company[] = [];

      try {
        const [ridesRes, driversRes, compData, authData, activeSettings] = await Promise.all([
          getRides({ search: searchQuery }),
          getDrivers(),
          getCompanies(),
          supabase.auth.getUser(),
          getDispatchSettings(),
        ]);

        if (ridesRes?.data) fetchedRides = ridesRes.data;
        if (driversRes?.data) {
          fetchedDrivers = driversRes.data;
          setCachedDrivers(
            fetchedDrivers.map((d) => ({
              id: d.id,
              movil_number: d.movil_number,
              full_name: d.profile?.full_name || `Móvil #${d.movil_number}`,
              phone: d.profile?.phone || null,
              vehicle_plate: d.vehicle_plate,
              vehicle_type: d.vehicle_type,
              status: d.status,
            }))
          );
        }
        if (compData) fetchedCompanies = compData;
        if (activeSettings) setSettings(activeSettings);

        if (authData.data.user?.id) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', authData.data.user.id)
            .single();
          if (prof?.role) setCurrentUserRole(prof.role);

          try {
            const perms = await getUserPermissions(authData.data.user.id);
            const canCancel = perms.some((p) => p.permission_key === 'tickets.cancel');
            setHasCancelPermission(canCancel);
            const canReassign = perms.some((p) => p.permission_key === 'rides.reassign');
            setHasReassignPermission(canReassign);
          } catch (permErr) {
            console.warn('Error fetching permissions:', permErr);
          }
        }
      } catch (networkErr) {
        console.warn('Network unavailable during loadData, falling back to IndexedDB local cache:', networkErr);
      }

      // Load cached drivers if network failed
      if (fetchedDrivers.length === 0) {
        const cachedDrv = await getCachedDrivers();
        if (cachedDrv.length > 0) {
          fetchedDrivers = cachedDrv.map((d) => ({
            id: d.id,
            profile_id: d.id,
            movil_number: d.movil_number,
            vehicle_type: d.vehicle_type,
            vehicle_plate: d.vehicle_plate,
            zone: 'Santa Cruz',
            rating: 5.0,
            status: d.status as any,
            is_active: true,
            is_available: d.status === 'available',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            profile: { full_name: d.full_name, phone: d.phone, avatar_url: null },
          })) as unknown as DriverWithProfile[];
        }
      }

      // Merge offline rides from IndexedDB
      const offRides = await getOfflineRides();
      const mappedOffline: RideWithDetails[] = offRides.map((o) => {
        const drv = fetchedDrivers.find((d) => d.id === o.driver_id);
        return {
          id: o.offline_id,
          ride_code: o.ride_code,
          customer_id: o.customer_id,
          company_id: o.company_id,
          requester_company: o.requester_company,
          requester_person: o.requester_person,
          pickup_address: o.pickup_address,
          destination_address: o.destination_address,
          initial_fare: o.initial_fare,
          wait_time_minutes: o.wait_time_minutes,
          wait_time_cost: o.wait_time_cost,
          total_fare: o.total_fare,
          status: o.status,
          priority: o.priority,
          driver_id: o.driver_id,
          payment_method: o.payment_method,
          observations: o.observations,
          cargo_description: o.cargo_description,
          created_at: o.created_at,
          updated_at: o.updated_at,
          driver: drv || null,
          customer: null,
          company: o.company_id ? { id: o.company_id, business_name: o.requester_company } : null,
        } as RideWithDetails;
      });

      const combinedRides = [...mappedOffline];
      fetchedRides.forEach((fr) => {
        if (!combinedRides.some((r) => r.id === fr.id)) {
          combinedRides.push(fr);
        }
      });

      setRides(combinedRides);
      setDrivers(fetchedDrivers);
      setCompanies(fetchedCompanies);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error al cargar datos del Centro de Operaciones');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery]);

  const [isRealtimeSubscribed, setIsRealtimeSubscribed] = useState<boolean>(false);

  // Adaptive Polling Ticker as fallback for WebSockets (60s when connected, 10s emergency when disconnected)
  useEffect(() => {
    loadData();
    const intervalMs = isRealtimeSubscribed ? 60000 : 10000;
    const pollInterval = setInterval(() => {
      loadData(true);
    }, intervalMs);
    return () => clearInterval(pollInterval);
  }, [loadData, isRealtimeSubscribed]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // 1. Initial auth token set
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
    });

    // 2. Instantiate channel and attach event listeners ONCE before subscribe()
    channel = supabase
      .channel('realtime-rides-kanban')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rides' },
        (payload) => {
          const newRide = payload.new as Partial<RideWithDetails> | null;
          const oldRide = payload.old as Partial<RideWithDetails> | null;

          setRides((prevRides) => {
            let updated = [...prevRides];

            if (payload.eventType === 'INSERT' && newRide) {
              if (!updated.some((r) => r.id === newRide.id)) {
                const drv = newRide.driver_id
                  ? driversRef.current.find((d) => d.id === newRide.driver_id)
                  : null;
                updated.unshift({
                  ...newRide,
                  driver: drv || null,
                  customer: null,
                  company: null,
                  _local_updated_at: Date.now(),
                } as RideWithDetails);
              }
            } else if (payload.eventType === 'UPDATE' && newRide) {
              const index = updated.findIndex((r) => r.id === newRide.id);
              if (index !== -1) {
                const existing = updated[index];
                const updatedDriver = newRide.driver_id
                  ? driversRef.current.find((d) => d.id === newRide.driver_id) || existing.driver
                  : newRide.driver_id === null
                  ? null
                  : existing.driver;

                updated[index] = {
                  ...existing,
                  ...newRide,
                  // Preserve existing join objects (customer, company, driver)
                  driver: updatedDriver,
                  customer: existing.customer,
                  company: existing.company,
                  _local_updated_at: Date.now(),
                } as RideWithDetails;
              } else {
                const drv = newRide.driver_id
                  ? driversRef.current.find((d) => d.id === newRide.driver_id)
                  : null;
                updated.unshift({
                  ...newRide,
                  driver: drv || null,
                  _local_updated_at: Date.now(),
                } as RideWithDetails);
              }
            } else if (payload.eventType === 'DELETE' && oldRide?.id) {
              updated = updated.filter((r) => r.id !== oldRide.id);
            }

            return updated;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_permissions' },
        () => {
          loadSettings();
        }
      );

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setIsRealtimeSubscribed(true);
        loadSettings();
        loadData(true);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setIsRealtimeSubscribed(false);
        console.warn('[Realtime Operations] Channel subscription issue:', status);
      }
    });

    // 3. Dynamic token updates on auth state changes without recreating channel callbacks
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadSettings();
        loadData(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      authSubscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadData, loadSettings]);

  // 2. Drag & Drop Handler for Kanban Columns
  const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    setDragOverColumnId(null);

    if (!draggingRide) return;
    const ride = draggingRide;
    setDraggingRide(null);
    setErrorMsg(null);

    // Target: Nuevas (col-new) or Pendientes de Asignación (col-pending-assign)
    if (targetColumnId === 'col-new' || targetColumnId === 'col-pending-assign') {
      if (ride.status === 'pending') return; // already pending
      setErrorMsg('No es posible regresar una carrera activa a estado PENDING.');
      return;
    }

    // Target: Asignadas (col-assigned)
    if (targetColumnId === 'col-assigned') {
      if (ride.status === 'assigned') return;
      if (ride.status !== 'pending') {
        setErrorMsg(`No se puede mover a ASIGNADAS una carrera en estado ${ride.status.toUpperCase()}.`);
        return;
      }
      // Open assignment modal to select driver
      handleOpenAssignModal(ride);
      return;
    }

    // Target: En Curso (col-ontheway)
    if (targetColumnId === 'col-ontheway') {
      if (ride.status === 'ontheway') return;
      if (ride.status !== 'assigned') {
        setErrorMsg('Debe asignar un conductor (Móvil) antes de mover la carrera a EN CURSO.');
        return;
      }
      await handleTransitionStatus(ride, 'ontheway');
      return;
    }

    // Target: Finalizadas (col-completed)
    if (targetColumnId === 'col-completed') {
      if (ride.status === 'completed' || ride.status === 'cancelled') return;
      if (ride.status !== 'ontheway' && ride.status !== 'assigned') {
        setErrorMsg('Solo se pueden finalizar carreras que estén asignadas o en curso.');
        return;
      }
      if (ride.surcharge_status === 'pending') {
        setErrorMsg('Existe un sobrecargo pendiente de aprobación. El operador debe aprobarlo o rechazarlo antes de finalizar la carrera.');
        return;
      }
      handleOpenCompletionModal(ride);
      return;
    }
  };

  // Debounced Unified Search Handler (300ms, min 2 chars)
  useEffect(() => {
    const query = unifiedSearchQuery.trim();
    if (query.length < 2) {
      setUnifiedSearchResults([]);
      setIsSearchingUnified(false);
      setShowSearchDropdown(false);
      return;
    }

    setIsSearchingUnified(true);
    const timer = setTimeout(async () => {
      const { data, error } = await searchUnifiedRequesters(query);
      setIsSearchingUnified(false);
      if (error) {
        console.error('Error executing unified search:', error);
        setUnifiedSearchResults([]);
      } else {
        setUnifiedSearchResults(data || []);
        setShowSearchDropdown(true);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [unifiedSearchQuery]);

  const handleSelectRequesterItem = (item: UnifiedRequesterItem) => {
    setSelectedRequesterItem(item);
    setRequesterPerson(item.full_name);

    const customerObj: CustomerWithCompany = {
      id: item.customer_id,
      full_name: item.full_name,
      phone: item.phone,
      ci: item.ci,
      area: item.area,
      position: item.contact_position,
      email: null,
      address: null,
      user_id: null,
      company_id: item.company_id,
      is_active: item.is_active,
      uses_ticket_contract: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      companies: item.company_id && item.company_business_name ? {
        id: item.company_id,
        business_name: item.company_business_name,
        primary_contact_customer_id: item.is_primary_contact ? item.customer_id : null,
      } : null,
      is_primary_contact: item.is_primary_contact,
    };

    setFoundCustomer(customerObj);

    if (item.company_id && item.company_business_name) {
      setSelectedCompanyId(item.company_id);
      setRequesterCompany(item.company_business_name);
    } else {
      setSelectedCompanyId('');
      setRequesterCompany('Particular');
    }

    setCustomerNotFoundMessage(null);
    setShowSearchDropdown(false);
  };

  // Group results into Corporate Companies vs Particular Requesters
  const particularItems = unifiedSearchResults.filter((item) => !item.company_id);
  const corporateItems = unifiedSearchResults.filter((item) => Boolean(item.company_id));

  const corporateGroups = React.useMemo(() => {
    const map = new Map<string, {
      company_id: string;
      business_name: string;
      nit: string | null;
      status: string | null;
      contacts: UnifiedRequesterItem[];
    }>();

    for (const item of corporateItems) {
      if (!item.company_id) continue;
      if (!map.has(item.company_id)) {
        map.set(item.company_id, {
          company_id: item.company_id,
          business_name: item.company_business_name || 'Empresa',
          nit: item.company_nit,
          status: item.company_status,
          contacts: [],
        });
      }
      map.get(item.company_id)!.contacts.push(item);
    }

    return Array.from(map.values());
  }, [corporateItems]);

  // Phone Lookup Logic (Retained for backward compatibility)
  const handlePhoneSearch = async () => {
    if (!phoneSearch.trim()) return;
    setSearchingPhone(true);
    setFoundCustomer(null);
    setCustomerNotFoundMessage(null);

    const { customer, error } = await findCustomerByPhone(phoneSearch);
    setSearchingPhone(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    if (customer) {
      setFoundCustomer(customer);
      setRequesterPerson(customer.full_name);
      if (customer.company_id && customer.companies?.business_name) {
        setSelectedCompanyId(customer.company_id);
        setRequesterCompany(customer.companies.business_name);
      } else {
        setSelectedCompanyId('');
        setRequesterCompany('Particular');
      }
    } else {
      setCustomerNotFoundMessage(`No se encontró cliente con el teléfono "${phoneSearch}". Puedes ingresar el nombre abajo para registrar la solicitud.`);
      setRequesterPerson('');
    }
  };

  // Create Customer On-the-Fly if desired
  const handleQuickCreateCustomer = async () => {
    if (!requesterPerson.trim() || !phoneSearch.trim()) {
      setErrorMsg('Ingresa un nombre y teléfono para guardar el nuevo cliente.');
      return;
    }

    const { customer, error } = await createCustomer({
      full_name: requesterPerson,
      phone: phoneSearch,
      company_id: selectedCompanyId || null,
    });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    if (customer) {
      setFoundCustomer(customer as CustomerWithCompany);
      setSuccessMsg(`Cliente "${customer.full_name}" registrado correctamente en el maestro.`);
      setCustomerNotFoundMessage(null);
    }
  };

  // Submit New Ride
  const handleCreateRideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requesterPerson.trim() || !pickupAddress.trim() || !destinationAddress.trim()) {
      setErrorMsg('Por favor completa los campos obligatorios: Solicitante, Origen y Destino.');
      return;
    }

    setIsSubmittingRide(true);
    setErrorMsg(null);

    const totalFare = Number(initialFare) + Number(waitTimeCost);
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isOffline) {
      const offlineUuid = `off_ride_${crypto.randomUUID()}`;
      const offlineRideCode = `JAT-OFF-${Math.floor(100000 + Math.random() * 900000)}`;
      const nowIso = new Date().toISOString();

      const offRide: OfflineRide = {
        offline_id: offlineUuid,
        ride_code: offlineRideCode,
        customer_id: foundCustomer?.id || null,
        company_id: selectedCompanyId || null,
        requester_company: requesterCompany || 'Particular',
        requester_person: requesterPerson.trim(),
        pickup_address: pickupAddress.trim(),
        destination_address: destinationAddress.trim(),
        initial_fare: Number(initialFare),
        wait_time_minutes: Number(waitTimeMinutes),
        wait_time_cost: Number(waitTimeCost),
        total_fare: totalFare,
        status: 'pending',
        priority,
        driver_id: null,
        payment_method: paymentMethod,
        observations: observations?.trim() || null,
        cargo_description: cargoDescription?.trim() || null,
        created_at: nowIso,
        updated_at: nowIso,
        is_offline_only: true,
      };

      try {
        await saveOfflineRide(offRide);
        await enqueueOfflineOperation({
          operation_id: `op_${crypto.randomUUID()}`,
          offline_ride_id: offlineUuid,
          operation_type: 'CREATE_RIDE',
          created_at: nowIso,
          payload: offRide as unknown as Record<string, unknown>,
          status: 'PENDING',
          retry_count: 0,
        });

        setSuccessMsg(`Carrera ${offlineRideCode} CREADA EN MODO CONTINGENCIA (Almacenada localmente en IndexedDB).`);
        setIsNewRideModalOpen(false);
        resetNewRideForm();
        await loadData(true);
      } catch (offErr) {
        setErrorMsg(`Error guardando en contingencia local: ${(offErr as Error).message}`);
      } finally {
        setIsSubmittingRide(false);
      }
      return;
    }

    const { ride, error } = await createRide({
      customer_id: foundCustomer?.id || null,
      company_id: selectedCompanyId || null,
      requester_company: requesterCompany || 'Particular',
      requester_person: requesterPerson,
      pickup_address: pickupAddress,
      destination_address: destinationAddress,
      initial_fare: Number(initialFare),
      wait_time_minutes: Number(waitTimeMinutes),
      wait_time_cost: Number(waitTimeCost),
      total_fare: totalFare,
      priority,
      payment_method: paymentMethod,
      observations,
      cargo_description: cargoDescription,
    });

    setIsSubmittingRide(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    if (ride) {
      setSuccessMsg(`Carrera ${ride.ride_code} creada exitosamente en estado PENDING.`);
      setIsNewRideModalOpen(false);
      resetNewRideForm();
      loadData(true);
    }
  };

  const resetNewRideForm = () => {
    setPhoneSearch('');
    setUnifiedSearchQuery('');
    setUnifiedSearchResults([]);
    setSelectedRequesterItem(null);
    setShowSearchDropdown(false);
    setFoundCustomer(null);
    setCustomerNotFoundMessage(null);
    setRequesterPerson('');
    setRequesterCompany('Particular');
    setSelectedCompanyId('');
    setPickupAddress('');
    setDestinationAddress('');
    setInitialFare(20);
    setWaitTimeMinutes(0);
    setWaitTimeCost(0);
    setPaymentMethod('Efectivo');
    setPriority('high');
    setObservations('');
    setCargoDescription('');
  };

  // Driver Assignment Action
  const handleOpenAssignModal = (r: RideWithDetails) => {
    setSelectedRideForAssign(r);
    setDriverSearchQuery('');
    setIsAssignModalOpen(true);
  };

  const handleAssignDriver = async (driver: DriverWithProfile) => {
    if (!selectedRideForAssign) return;

    setErrorMsg(null);
    const assignedRideId = selectedRideForAssign.id;
    const nowIso = new Date().toISOString();

    // Optimistic local state update
    setRides((prev) =>
      prev.map((r) =>
        r.id === assignedRideId
          ? {
              ...r,
              driver_id: driver.id,
              status: 'assigned' as const,
              driver: {
                id: driver.id,
                movil_number: driver.movil_number,
                vehicle_type: driver.vehicle_type,
                vehicle_plate: driver.vehicle_plate,
                profile: driver.profile ? { full_name: driver.profile.full_name, phone: driver.profile.phone } : null,
              },
            }
          : r
      )
    );

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isOffline) {
      try {
        const offRides = await getOfflineRides();
        const existing = offRides.find((r) => r.offline_id === assignedRideId);
        if (existing) {
          existing.driver_id = driver.id;
          existing.status = 'assigned';
          existing.updated_at = nowIso;
          await saveOfflineRide(existing);
        }

        await enqueueOfflineOperation({
          operation_id: `op_${crypto.randomUUID()}`,
          offline_ride_id: assignedRideId,
          operation_type: 'ASSIGN_DRIVER',
          created_at: nowIso,
          payload: { driver_id: driver.id, movil_number: driver.movil_number },
          status: 'PENDING',
          retry_count: 0,
        });

        setSuccessMsg(`Móvil #${driver.movil_number} (${driver.profile?.full_name || 'Motoquero'}) asignado LOCALMENTE (Modo Contingencia).`);
        setIsAssignModalOpen(false);
        setSelectedRideForAssign(null);
        await loadData(true);
      } catch (offErr) {
        setErrorMsg(`Error guardando asignación local: ${(offErr as Error).message}`);
      }
      return;
    }

    const { error } = await assignDriverToRide(assignedRideId, driver.id, driver.movil_number);

    if (error) {
      setErrorMsg(error.message);
      await loadData(true);
      return;
    }

    setSuccessMsg(`Móvil #${driver.movil_number} (${driver.profile?.full_name || 'Motoquero'}) asignado a la carrera ${selectedRideForAssign.ride_code}.`);
    setIsAssignModalOpen(false);
    setSelectedRideForAssign(null);
    loadData(true);
  };

  // Completion Modal Handlers (Central Operations)
  const handleOpenCompletionModal = async (ride: RideWithDetails) => {
    setErrorMsg(null);
    if (ride.surcharge_status === 'pending') {
      setErrorMsg('Existe un sobrecargo pendiente de aprobación. El operador debe aprobarlo o rechazarlo antes de finalizar la carrera.');
      return;
    }
    setRideToComplete(ride);
    const eligible = await isRideTicketEligible(ride);
    setIsTicketEligible(eligible);
    setCompletionPaymentMethod(eligible ? 'Ticket' : 'Efectivo');
    setIsCompletionModalOpen(true);
  };

  const handleConfirmCompletionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rideToComplete) return;

    if (!completionPaymentMethod) {
      setErrorMsg('Selecciona la forma de pago antes de finalizar.');
      return;
    }

    setIsSubmittingCompletion(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const targetRide = rideToComplete;
    const nowIso = new Date().toISOString();

    // Optimistic local state update
    setRides((prev) =>
      prev.map((r) => (r.id === targetRide.id ? { ...r, status: 'completed' as const, payment_method: completionPaymentMethod } : r))
    );

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isOffline) {
      try {
        const offRides = await getOfflineRides();
        const existing = offRides.find((r) => r.offline_id === targetRide.id);
        if (existing) {
          existing.status = 'completed';
          existing.payment_method = completionPaymentMethod;
          existing.updated_at = nowIso;
          await saveOfflineRide(existing);
        }

        await enqueueOfflineOperation({
          operation_id: `op_${crypto.randomUUID()}`,
          offline_ride_id: targetRide.id,
          operation_type: 'COMPLETE_RIDE',
          created_at: nowIso,
          payload: { status: 'completed', payment_method: completionPaymentMethod },
          status: 'PENDING',
          retry_count: 0,
        });

        setSuccessMsg(`Carrera ${targetRide.ride_code} finalizada LOCALMENTE en modo contingencia.`);
        setIsCompletionModalOpen(false);
        setIsDetailModalOpen(false);
        setRideToComplete(null);
        await loadData(true);
      } catch (offErr) {
        setErrorMsg(`Error guardando finalización local: ${(offErr as Error).message}`);
      } finally {
        setIsSubmittingCompletion(false);
      }
      return;
    }

    const { error } = await updateRideStatus(
      targetRide.id,
      'completed',
      undefined,
      targetRide.driver_id,
      completionPaymentMethod
    );

    setIsSubmittingCompletion(false);

    if (error) {
      setErrorMsg(error.message);
      await loadData(true);
      return;
    }

    setSuccessMsg(`Carrera ${targetRide.ride_code} finalizada exitosamente desde Central (${completionPaymentMethod}).`);
    setIsCompletionModalOpen(false);
    setIsDetailModalOpen(false);
    setRideToComplete(null);
    loadData(true);
  };

  // State Transitions
  const handleTransitionStatus = async (ride: RideWithDetails, newStatus: RideStatus) => {
    setErrorMsg(null);
    const nowIso = new Date().toISOString();

    // Optimistic local state update
    setRides((prev) =>
      prev.map((r) => (r.id === ride.id ? { ...r, status: newStatus } : r))
    );

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isOffline) {
      try {
        const offRides = await getOfflineRides();
        const existing = offRides.find((r) => r.offline_id === ride.id);
        if (existing) {
          existing.status = newStatus;
          existing.updated_at = nowIso;
          await saveOfflineRide(existing);
        }

        const opType =
          newStatus === 'completed'
            ? 'COMPLETE_RIDE'
            : newStatus === 'cancelled'
            ? 'CANCEL_RIDE'
            : 'UPDATE_STATUS';

        await enqueueOfflineOperation({
          operation_id: `op_${crypto.randomUUID()}`,
          offline_ride_id: ride.id,
          operation_type: opType,
          created_at: nowIso,
          payload: { status: newStatus },
          status: 'PENDING',
          retry_count: 0,
        });

        setSuccessMsg(`Estado de carrera ${ride.ride_code} actualizado LOCALMENTE a ${newStatus.toUpperCase()}.`);
        await loadData(true);
      } catch (offErr) {
        setErrorMsg(`Error guardando cambio de estado local: ${(offErr as Error).message}`);
      }
      return;
    }

    const { error } = await updateRideStatus(
      ride.id,
      newStatus,
      undefined,
      ride.driver_id,
      undefined
    );

    if (error) {
      setErrorMsg(error.message);
      await loadData(true);
      return;
    }

    setSuccessMsg(`Estado de carrera ${ride.ride_code} actualizado a ${newStatus.toUpperCase()}.`);
    loadData(true);

    if (selectedRideForDetail && selectedRideForDetail.id === ride.id) {
      handleOpenDetailModal({ ...ride, status: newStatus });
    }
  };

  // View Detail & Timeline Modal
  const handleOpenDetailModal = async (r: RideWithDetails) => {
    setSelectedRideForDetail(r);
    setIsDetailModalOpen(true);
    setLoadingTimeline(true);

    const { data } = await getRideTimeline(r.id);
    setSelectedRideTimeline(data || []);
    setLoadingTimeline(false);
  };

  // Calculate wait time & priority level for pending rides
  const getPendingWaitInfo = useCallback((ride: RideWithDetails) => {
    const created = new Date(ride.created_at).getTime();
    const elapsedMinutes = Math.max(0, Math.floor((nowTimestamp - created) / (60 * 1000)));

    let level: 'green' | 'yellow' | 'red' = 'green';
    if (elapsedMinutes >= settings.unassignedRedMin) {
      level = 'red';
    } else if (elapsedMinutes >= settings.unassignedYellowMin) {
      level = 'yellow';
    }

    return { elapsedMinutes, level };
  }, [nowTimestamp, settings.unassignedRedMin, settings.unassignedYellowMin]);

  // Calculate wait time & priority level for assigned rides
  const getAssignedWaitInfo = useCallback((ride: RideWithDetails) => {
    const assignedTime = new Date(ride.updated_at || ride.created_at).getTime();
    const elapsedMinutes = Math.max(0, Math.floor((nowTimestamp - assignedTime) / (60 * 1000)));

    let level: 'green' | 'yellow' | 'red' = 'green';
    if (elapsedMinutes >= settings.assignedRedMin) {
      level = 'red';
    } else if (elapsedMinutes >= settings.assignedYellowMin) {
      level = 'yellow';
    }

    return { elapsedMinutes, level };
  }, [nowTimestamp, settings.assignedRedMin, settings.assignedYellowMin]);

  // Render timer badge for Kanban card
  const renderTimerBadge = (level: 'green' | 'yellow' | 'red', minutes: number, type: 'unassigned' | 'assigned') => {
    if (level === 'red') {
      const label = type === 'unassigned' ? 'esperando asignación' : 'asignada';
      return (
        <div className="px-2 py-1 bg-rose-500/20 border border-rose-500/50 text-rose-300 text-[10px] font-extrabold rounded-md flex items-center gap-1.5 animate-pulse">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
          <span>{minutes} min {label} ⚠️ REQUIERE ATENCIÓN</span>
        </div>
      );
    }
    if (level === 'yellow') {
      return (
        <div className="px-2 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold rounded-md flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span>{minutes} min</span>
        </div>
      );
    }
    return (
      <div className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-medium rounded-md flex items-center gap-1">
        <Clock className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
        <span>{minutes} min</span>
      </div>
    );
  };

  // 4 Consolidated Kanban Columns Mapping with Intelligent Sorting:
  // Red rides first (highest elapsed time) -> Yellow rides -> Green rides
  const rawPendingRides = rides.filter((r) => r.status === 'pending');
  const pendingAssignRides = [...rawPendingRides].sort((a, b) => {
    const infoA = getPendingWaitInfo(a);
    const infoB = getPendingWaitInfo(b);
    const rankOrder = { red: 2, yellow: 1, green: 0 };
    if (rankOrder[infoA.level] !== rankOrder[infoB.level]) {
      return rankOrder[infoB.level] - rankOrder[infoA.level];
    }
    return infoB.elapsedMinutes - infoA.elapsedMinutes;
  });

  const rawAssignedRides = rides.filter((r) => r.status === 'assigned');
  const assignedRides = [...rawAssignedRides].sort((a, b) => {
    const infoA = getAssignedWaitInfo(a);
    const infoB = getAssignedWaitInfo(b);
    const rankOrder = { red: 2, yellow: 1, green: 0 };
    if (rankOrder[infoA.level] !== rankOrder[infoB.level]) {
      return rankOrder[infoB.level] - rankOrder[infoA.level];
    }
    return infoB.elapsedMinutes - infoA.elapsedMinutes;
  });

  const onthewayRides = rides.filter((r) => r.status === 'ontheway');
  const finalizedRides = rides.filter((r) => r.status === 'completed' || r.status === 'cancelled');

  // Warning counts
  const pendingRedCount = pendingAssignRides.filter((r) => getPendingWaitInfo(r).level === 'red').length;
  const pendingYellowCount = pendingAssignRides.filter((r) => getPendingWaitInfo(r).level === 'yellow').length;
  const assignedRedCount = assignedRides.filter((r) => getAssignedWaitInfo(r).level === 'red').length;

  const getPriorityBadge = (p: RidePriority) => {
    if (p === 'urgent') return <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded text-[10px] font-bold uppercase">URGENTE</span>;
    if (p === 'high') return <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded text-[10px] font-bold uppercase">ALTA</span>;
    if (p === 'medium') return <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/30 rounded text-[10px] font-bold uppercase">MEDIA</span>;
    return <span className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-[10px] font-medium uppercase">BAJA</span>;
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
      <Topbar
        title="Centro de Operaciones MotoJAT"
        subtitle="Tablero Kanban de despacho express, monitoreo de flotas y auditoría en tiempo real"
      />

      <main className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 flex-1 flex flex-col max-w-[1700px] w-full mx-auto">
        {/* Banner Feedback */}
        {errorMsg && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Dashboard Header Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-[#1E293B] p-5 rounded-2xl border border-[#334155] shadow-lg">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
              <Headset className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-heading flex items-center gap-2">
                <span>Tablero Operativo de Carreras</span>
                {refreshing && <Loader2 className="w-4 h-4 animate-spin text-[#FDDE12]" />}
              </h2>
              <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                <span>Total Carreras: <strong className="text-white">{rides.length}</strong></span>
                <span>Pendientes de Asignación: <strong className="text-amber-400">{pendingAssignRides.length}</strong>
                  {(pendingRedCount > 0 || pendingYellowCount > 0) && (
                    <span className="ml-1 text-[10px] font-bold text-rose-400">
                      ({pendingRedCount > 0 ? `🔴 ${pendingRedCount}` : ''} {pendingYellowCount > 0 ? `🟡 ${pendingYellowCount}` : ''})
                    </span>
                  )}
                </span>
                <span>Asignadas: <strong className="text-sky-400">{assignedRides.length}</strong>
                  {assignedRedCount > 0 && (
                    <span className="ml-1 text-[10px] font-bold text-rose-400">(🔴 {assignedRedCount})</span>
                  )}
                </span>
                <span>En Camino: <strong className="text-purple-400">{onthewayRides.length}</strong></span>
                <span>Finalizadas: <strong className="text-emerald-400">{finalizedRides.length}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar código, origen, solicitante..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0F172A] border border-[#334155] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
              />
            </div>

            <button
              onClick={() => {
                setTempSettings(settings);
                setIsSettingsModalOpen(true);
              }}
              title="Configuración de tiempos de espera"
              className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors flex items-center gap-1 text-xs"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline font-medium">Tiempos</span>
            </button>

            <button
              onClick={() => loadData(true)}
              title="Refrescar carreras"
              className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                resetNewRideForm();
                setIsNewRideModalOpen(true);
              }}
              className="px-4 py-2.5 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Solicitud</span>
            </button>
          </div>
        </div>

        {/* 4-COLUMN KANBAN BOARD */}
        {loading ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3 flex-1">
            <Loader2 className="w-10 h-10 animate-spin text-[#FDDE12]" />
            <span className="text-xs">Cargando Tablero Kanban de Despacho...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
            {/* COLUMN 1: PENDIENTES DE ASIGNACIÓN */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverColumnId('col-pending-assign');
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOverColumnId(null);
              }}
              onDrop={(e) => handleDrop(e, 'col-pending-assign')}
              className={`border rounded-2xl flex flex-col overflow-hidden transition-all ${
                dragOverColumnId === 'col-pending-assign'
                  ? 'bg-[#1E293B] border-[#FDDE12] ring-2 ring-[#FDDE12]/40 shadow-xl'
                  : 'bg-[#1E293B]/70 border-[#334155]'
              }`}
            >
              <div className="p-3 bg-[#0F172A] border-b border-[#334155] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                  <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider">
                    Pendientes de Asignación
                  </h3>
                </div>
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-full text-[11px] font-bold">
                  {pendingAssignRides.length}
                </span>
              </div>

              <div className="p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)] flex-1">
                {pendingAssignRides.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-[#334155]/50 rounded-xl">
                    <p className="text-[11px] text-slate-500">Sin carreras pendientes</p>
                  </div>
                ) : (
                  pendingAssignRides.map((ride) => {
                    const info = getPendingWaitInfo(ride);
                    return (
                      <RideCard
                        key={ride.id}
                        ride={ride}
                        timerBadge={renderTimerBadge(info.level, info.elapsedMinutes, 'unassigned')}
                        onDragStart={() => setDraggingRide(ride)}
                        onDragEnd={() => { setDraggingRide(null); setDragOverColumnId(null); }}
                        onAssign={() => handleOpenAssignModal(ride)}
                        onCancel={() => handleOpenCancelModal(ride)}
                        onViewDetail={() => handleOpenDetailModal(ride)}
                        getPriorityBadge={getPriorityBadge}
                      />
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUMN 2: ASIGNADAS */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverColumnId('col-assigned');
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOverColumnId(null);
              }}
              onDrop={(e) => handleDrop(e, 'col-assigned')}
              className={`border rounded-2xl flex flex-col overflow-hidden transition-all ${
                dragOverColumnId === 'col-assigned'
                  ? 'bg-[#1E293B] border-[#FDDE12] ring-2 ring-[#FDDE12]/40 shadow-xl'
                  : 'bg-[#1E293B]/70 border-[#334155]'
              }`}
            >
              <div className="p-3 bg-[#0F172A] border-b border-[#334155] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                  <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider">
                    Asignadas
                  </h3>
                </div>
                <span className="px-2 py-0.5 bg-sky-500/20 text-sky-400 rounded-full text-[11px] font-bold">
                  {assignedRides.length}
                </span>
              </div>

              <div className="p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)] flex-1">
                {assignedRides.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-[#334155]/50 rounded-xl">
                    <p className="text-[11px] text-slate-500">Arrastra aquí para asignar móvil</p>
                  </div>
                ) : (
                  assignedRides.map((ride) => {
                    const info = getAssignedWaitInfo(ride);
                    return (
                      <RideCard
                        key={ride.id}
                        ride={ride}
                        timerBadge={renderTimerBadge(info.level, info.elapsedMinutes, 'assigned')}
                        onDragStart={() => setDraggingRide(ride)}
                        onDragEnd={() => { setDraggingRide(null); setDragOverColumnId(null); }}
                        onStartOnTheWay={() => handleTransitionStatus(ride, 'ontheway')}
                        onReassign={
                          ['SUPERADMIN', 'ADMIN'].includes((currentUserRole || '').toUpperCase()) || hasReassignPermission
                            ? () => handleOpenReassignModal(ride)
                            : undefined
                        }
                        onCancel={() => handleOpenCancelModal(ride)}
                        onViewDetail={() => handleOpenDetailModal(ride)}
                        getPriorityBadge={getPriorityBadge}
                      />
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUMN 3: EN CURSO */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverColumnId('col-ontheway');
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOverColumnId(null);
              }}
              onDrop={(e) => handleDrop(e, 'col-ontheway')}
              className={`border rounded-2xl flex flex-col overflow-hidden transition-all ${
                dragOverColumnId === 'col-ontheway'
                  ? 'bg-[#1E293B] border-[#FDDE12] ring-2 ring-[#FDDE12]/40 shadow-xl'
                  : 'bg-[#1E293B]/70 border-[#334155]'
              }`}
            >
              <div className="p-3 bg-[#0F172A] border-b border-[#334155] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                  <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider">
                    En Curso
                  </h3>
                </div>
                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full text-[11px] font-bold">
                  {onthewayRides.length}
                </span>
              </div>

              <div className="p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)] flex-1">
                {onthewayRides.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-[#334155]/50 rounded-xl">
                    <p className="text-[11px] text-slate-500">Arrastra aquí para iniciar carrera</p>
                  </div>
                ) : (
                  onthewayRides.map((ride) => (
                    <RideCard
                      key={ride.id}
                      ride={ride}
                      onDragStart={() => setDraggingRide(ride)}
                      onDragEnd={() => { setDraggingRide(null); setDragOverColumnId(null); }}
                      onComplete={() => handleOpenCompletionModal(ride)}
                      onReassign={
                        ['SUPERADMIN', 'ADMIN'].includes((currentUserRole || '').toUpperCase()) || hasReassignPermission
                          ? () => handleOpenReassignModal(ride)
                          : undefined
                      }
                      onCancel={() => handleOpenCancelModal(ride)}
                      onViewDetail={() => handleOpenDetailModal(ride)}
                      getPriorityBadge={getPriorityBadge}
                    />
                  ))
                )}
              </div>
            </div>

            {/* COLUMN 4: FINALIZADAS */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverColumnId('col-completed');
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOverColumnId(null);
              }}
              onDrop={(e) => handleDrop(e, 'col-completed')}
              className={`border rounded-2xl flex flex-col overflow-hidden transition-all ${
                dragOverColumnId === 'col-completed'
                  ? 'bg-[#1E293B] border-[#FDDE12] ring-2 ring-[#FDDE12]/40 shadow-xl'
                  : 'bg-[#1E293B]/70 border-[#334155]'
              }`}
            >
              <div className="p-3 bg-[#0F172A] border-b border-[#334155] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider">
                    Finalizadas
                  </h3>
                </div>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-[11px] font-bold">
                  {finalizedRides.length}
                </span>
              </div>

              <div className="p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)] flex-1">
                {finalizedRides.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-[#334155]/50 rounded-xl">
                    <p className="text-[11px] text-slate-500">Arrastra aquí para completar servicio</p>
                  </div>
                ) : (
                  finalizedRides.map((ride) => (
                    <RideCard
                      key={ride.id}
                      ride={ride}
                      onDragStart={() => setDraggingRide(ride)}
                      onDragEnd={() => { setDraggingRide(null); setDragOverColumnId(null); }}
                      onViewDetail={() => handleOpenDetailModal(ride)}
                      getPriorityBadge={getPriorityBadge}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: NUEVA SOLICITUD DE CARRERA (RECEPCIÓN DE PEDIDOS) */}
      {isNewRideModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-5 animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
                  <Bike className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">
                    Recepción de Solicitud de Carrera Express
                  </h3>
                  <p className="text-xs text-slate-400">Paso 1 al 6: Identificar cliente, tarifa y despacho</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewRideModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRideSubmit} className="space-y-4 text-xs">
              {/* Step 1: Intelligent Unified Search */}
              <div className="p-4 bg-[#0F172A] border border-[#334155] rounded-xl space-y-3 relative">
                <h4 className="font-bold text-slate-200 text-xs flex items-center gap-2">
                  <Search className="w-4 h-4 text-[#FDDE12]" />
                  <span>Paso 1: Buscar cliente / empresa</span>
                </h4>

                <div className="relative">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Teléfono, nombre, empresa o NIT..."
                        value={unifiedSearchQuery}
                        onChange={(e) => setUnifiedSearchQuery(e.target.value)}
                        onFocus={() => {
                          if (unifiedSearchResults.length > 0) setShowSearchDropdown(true);
                        }}
                        className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3.5 py-2 pl-9 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                      />
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      {isSearchingUnified && (
                        <Loader2 className="w-4 h-4 text-[#FDDE12] animate-spin absolute right-3 top-2.5" />
                      )}
                    </div>

                    {unifiedSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setUnifiedSearchQuery('');
                          setUnifiedSearchResults([]);
                          setShowSearchDropdown(false);
                        }}
                        className="p-2 text-slate-400 hover:text-white bg-[#1E293B] border border-[#334155] rounded-xl hover:bg-slate-800"
                        title="Limpiar búsqueda"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Autocomplete Dropdown */}
                  {showSearchDropdown && unifiedSearchQuery.trim().length >= 2 && (
                    <div className="absolute left-0 right-0 top-full mt-2 bg-[#1E293B] border border-[#334155] rounded-xl shadow-2xl z-50 max-h-80 overflow-y-auto divide-y divide-[#334155]">
                      {unifiedSearchResults.length === 0 ? (
                        <div className="p-4 text-center text-slate-400 text-xs space-y-2">
                          <p>No se encontraron resultados para &quot;{unifiedSearchQuery}&quot;</p>
                          <p className="text-[11px] text-slate-500">
                            Puedes ingresar el nombre del cliente abajo para registrar la solicitud.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Corporate Groups */}
                          {corporateGroups.map((group) => (
                            <div key={group.company_id} className="p-2 space-y-1 bg-[#0F172A]/40">
                              <div className="px-2 py-1 flex items-center justify-between text-[11px] font-bold text-[#FDDE12]">
                                <div className="flex items-center gap-1.5 truncate">
                                  <Building2 className="w-3.5 h-3.5 flex-shrink-0 text-[#FDDE12]" />
                                  <span className="truncate">{group.business_name}</span>
                                  {group.nit && <span className="text-[10px] text-slate-400 font-normal">(NIT: {group.nit})</span>}
                                </div>
                                {group.status && group.status !== 'active' && (
                                  <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[9px] font-bold">
                                    ⚠️ Empresa suspendida
                                  </span>
                                )}
                              </div>

                              <div className="space-y-0.5 pl-2">
                                {group.contacts.map((item) => (
                                  <button
                                    key={item.customer_id}
                                    type="button"
                                    onClick={() => handleSelectRequesterItem(item)}
                                    className="w-full text-left p-2 rounded-lg hover:bg-slate-700/60 transition-colors flex items-center justify-between text-xs text-slate-200 group"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                                        👤
                                      </div>
                                      <div className="truncate">
                                        <div className="font-semibold text-white group-hover:text-[#FDDE12] flex items-center gap-1.5">
                                          <span className="truncate">{item.full_name}</span>
                                          {item.is_primary_contact && (
                                            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[9px] font-bold flex items-center gap-0.5">
                                              ★ Principal
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                                          <span>Tel: {item.phone}</span>
                                          {item.area && <span>· {item.area}</span>}
                                          {item.contact_position && <span>· {item.contact_position}</span>}
                                        </div>
                                      </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white flex-shrink-0" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}

                          {/* Particular Requesters */}
                          {particularItems.length > 0 && (
                            <div className="p-2 space-y-1 bg-[#0F172A]/20">
                              <div className="px-2 py-1 text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                                <span>Clientes Particulares (Sin Empresa)</span>
                              </div>
                              {particularItems.map((item) => (
                                <button
                                  key={item.customer_id}
                                  type="button"
                                  onClick={() => handleSelectRequesterItem(item)}
                                  className="w-full text-left p-2 rounded-lg hover:bg-slate-700/60 transition-colors flex items-center justify-between text-xs text-slate-200 group"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-6 h-6 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                                      👤
                                    </div>
                                    <div className="truncate">
                                      <div className="font-semibold text-white group-hover:text-[#FDDE12]">
                                        {item.full_name}
                                      </div>
                                      <div className="text-[10px] text-slate-400">
                                        Cliente Particular · Tel: {item.phone} {item.ci ? `· CI: ${item.ci}` : ''}
                                      </div>
                                    </div>
                                  </div>
                                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white flex-shrink-0" />
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Selected Customer Card Badge */}
                {foundCustomer && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 font-semibold">
                        <span>✓ Seleccionado: {foundCustomer.full_name}</span>
                        <span className="text-[10px] text-emerald-400">Tel: {foundCustomer.phone}</span>
                      </div>
                      {foundCustomer.companies?.business_name ? (
                        <p className="text-[11px] text-indigo-300 font-medium">
                          Empresa: {foundCustomer.companies.business_name} {foundCustomer.is_primary_contact ? '(Contacto Principal ★)' : ''}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400">Cliente Particular</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFoundCustomer(null);
                        setRequesterPerson('');
                        setRequesterCompany('Particular');
                        setSelectedCompanyId('');
                        setUnifiedSearchQuery('');
                      }}
                      className="text-xs text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
                      title="Cambiar cliente"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Step 2: Customer Name & Corporate Company */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Nombre del Solicitante <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. María Gutiérrez"
                    value={requesterPerson}
                    onChange={(e) => setRequesterPerson(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Tipo / Empresa Solicitante</label>
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => {
                      const cid = e.target.value;
                      setSelectedCompanyId(cid);
                      if (!cid) setRequesterCompany('Particular');
                      else {
                        const found = companies.find((c) => c.id === cid);
                        setRequesterCompany(found?.business_name || 'Particular');
                      }
                    }}
                    className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-[#FDDE12]"
                  >
                    <option value="">Particular (Cliente Individual)</option>
                    {companies.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.business_name} {comp.nit ? `(NIT: ${comp.nit})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Step 3: Addresses */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Dirección de Origen / Recojo <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Calle Murillo #450, Zona Central"
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Dirección de Destino / Entrega <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Av. Ballivián Calle 12, Calacoto"
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                  />
                </div>
              </div>

              {/* Step 4: Fare Calculation */}
              <div className="p-4 bg-[#0F172A] border border-[#334155] rounded-xl space-y-3">
                <h4 className="font-bold text-slate-200 text-xs flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span>Paso 4: Estructura Financiera & Tarifa (Bs.)</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Tarifa Base (Bs.)</label>
                    <input
                      type="number"
                      step="0.50"
                      min="0"
                      value={initialFare}
                      onChange={(e) => setInitialFare(Number(e.target.value))}
                      className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-[#FDDE12]"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Costo Espera (Bs.)</label>
                    <input
                      type="number"
                      step="0.50"
                      min="0"
                      value={waitTimeCost}
                      onChange={(e) => setWaitTimeCost(Number(e.target.value))}
                      className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-[#FDDE12]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#FDDE12] font-bold text-[11px] mb-1">Total Tarifa (Bs.)</label>
                    <div className="bg-[#1E293B] border border-[#FDDE12]/50 text-[#FDDE12] font-bold text-sm rounded-xl px-3 py-1.5">
                      Bs. {(Number(initialFare) + Number(waitTimeCost)).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 5 & 6: Payment Method, Priority & Observations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Forma de Pago</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-[#FDDE12]"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="QR">Pago QR</option>
                    <option value="Ticket">Ticket</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Nivel de Prioridad</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as RidePriority)}
                    className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-[#FDDE12]"
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">¿Qué Lleva? / Contenido o Carga</label>
                <input
                  type="text"
                  placeholder="Ej. Documentos confidenciales, paquete repuestos 3kg, caja médica..."
                  value={cargoDescription}
                  onChange={(e) => setCargoDescription(e.target.value)}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Observaciones / Instrucciones Específicas</label>
                <textarea
                  rows={2}
                  placeholder="Ej. Preguntar por recepción o llevar factura a nombre de empresa..."
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div className="pt-3 border-t border-[#334155] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsNewRideModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRide}
                  className="px-5 py-2 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-bold rounded-xl flex items-center gap-2 transition-all disabled:opacity-50 shadow-md"
                >
                  {isSubmittingRide && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Registrar Carrera (PENDING)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ASIGNACIÓN DE MOTOQUERO */}
      {isAssignModalOpen && selectedRideForAssign && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4 animate-scaleUp max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 rounded-xl">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">
                    Asignar / Preasignar Motoquero — Carrera {selectedRideForAssign.ride_code}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Solicitante: <strong className="text-slate-200">{selectedRideForAssign.requester_person}</strong> ({selectedRideForAssign.requester_company})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Smart Search Bar */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Buscar por móvil o nombre..."
                  value={driverSearchQuery}
                  onChange={(e) => setDriverSearchQuery(e.target.value)}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl pl-10 pr-10 py-2.5 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-sky-400"
                />
                {driverSearchQuery && (
                  <button
                    onClick={() => setDriverSearchQuery('')}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white p-0.5 rounded"
                    title="Limpiar búsqueda"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Flota MotoJAT:</span>
                <span>
                  Regla de carga: <strong className="text-white">Max 1 en curso + Max 1 en espera (Total 2)</strong>
                </span>
              </div>

              {drivers.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No hay conductores registrados en la flota.</p>
              ) : (() => {
                const searchClean = driverSearchQuery.trim().toLowerCase();
                const filteredList = drivers.filter((driver) => {
                  if (!searchClean) return true;
                  const movilStr = driver.movil_number ? `#${driver.movil_number}` : '';
                  const movilNumOnly = driver.movil_number ? String(driver.movil_number) : '';
                  const fullName = (driver.profile?.full_name || '').toLowerCase();
                  const vehicle = (driver.vehicle_type || '').toLowerCase();
                  const plate = (driver.vehicle_plate || '').toLowerCase();
                  const zone = (driver.zone || '').toLowerCase();

                  return (
                    movilStr.includes(searchClean) ||
                    movilNumOnly.includes(searchClean) ||
                    fullName.includes(searchClean) ||
                    vehicle.includes(searchClean) ||
                    plate.includes(searchClean) ||
                    zone.includes(searchClean)
                  );
                });

                if (filteredList.length === 0) {
                  return (
                    <div className="p-6 text-center bg-[#0F172A] border border-[#334155] rounded-xl text-slate-400 text-xs space-y-1">
                      <p className="font-semibold text-white">Sin resultados para &quot;{driverSearchQuery}&quot;</p>
                      <p className="text-slate-500 text-[11px]">Intenta buscar por número de móvil, nombre o apellido.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {filteredList.map((driver) => {
                      const countOnTheWay = rides.filter((r) => r.driver_id === driver.id && r.status === 'ontheway').length;
                      const countAssigned = rides.filter((r) => r.driver_id === driver.id && r.status === 'assigned').length;
                      const totalActive = countOnTheWay + countAssigned;

                      const isBaja = driver.status === 'baja';
                      const isOffline = driver.status === 'offline';
                      const isFullyOccupied = countAssigned >= 1 || totalActive >= 2;
                      const canPreassign = countOnTheWay === 1 && countAssigned === 0;
                      const canAssignDirect = countOnTheWay === 0 && countAssigned === 0;

                      let statusBadgeLabel = 'Disponible';
                      let statusBadgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
                      if (isBaja) {
                        statusBadgeLabel = 'Baja';
                        statusBadgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
                      } else if (isOffline) {
                        statusBadgeLabel = 'Fuera de línea';
                        statusBadgeColor = 'bg-slate-700/50 text-slate-400 border-slate-600';
                      } else if (totalActive > 0) {
                        statusBadgeLabel = 'Ocupado';
                        statusBadgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
                      }

                      return (
                        <div
                          key={driver.id}
                          className="p-3 bg-[#0F172A] border border-[#334155] rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-slate-500 transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-[#FDDE12] font-extrabold flex items-center justify-center text-sm flex-shrink-0">
                              #{driver.movil_number}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-white text-xs">
                                  {driver.profile?.full_name || `Motoquero #${driver.movil_number}`}
                                </h4>
                                <span className={`px-2 py-0.5 border text-[10px] font-bold rounded ${statusBadgeColor}`}>
                                  {statusBadgeLabel}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {driver.vehicle_type} ({driver.vehicle_plate}) • Zona: {driver.zone}
                              </p>
                              {/* Active Rides Breakdown */}
                              <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 font-mono">
                                <span>En curso: <strong className={countOnTheWay > 0 ? "text-purple-400" : "text-slate-300"}>{countOnTheWay}</strong></span>
                                <span>•</span>
                                <span>En espera: <strong className={countAssigned > 0 ? "text-amber-400" : "text-slate-300"}>{countAssigned}</strong></span>
                              </div>
                            </div>
                          </div>

                          <div className="w-full sm:w-auto flex justify-end">
                            {isBaja || isOffline ? (
                              <span className="px-3 py-1.5 bg-slate-800 text-slate-500 border border-slate-700 font-semibold text-xs rounded-lg">
                                No disponible
                              </span>
                            ) : isFullyOccupied ? (
                              <span className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold text-[11px] rounded-lg text-right max-w-[220px]">
                                Ya tiene una carrera en curso y una carrera en espera.
                              </span>
                            ) : canPreassign ? (
                              <button
                                onClick={() => handleAssignDriver(driver)}
                                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-md flex items-center gap-1.5"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>Preasignar</span>
                              </button>
                            ) : canAssignDirect ? (
                              <button
                                onClick={() => handleAssignDriver(driver)}
                                className="px-3.5 py-1.5 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-lg transition-all shadow-md flex items-center gap-1.5"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Asignar</span>
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: DETALLE DE CARRERA & TIMELINE AUDITABLE */}
      {isDetailModalOpen && selectedRideForDetail && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-3xl p-6 shadow-2xl space-y-5 animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white font-heading">
                      Expediente de Carrera {selectedRideForDetail.ride_code}
                    </h3>
                    {getPriorityBadge(selectedRideForDetail.priority)}
                  </div>
                  <p className="text-xs text-slate-400">
                    Estado Actual: <strong className="text-white uppercase">{selectedRideForDetail.status}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ride Metadata Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-[#0F172A] border border-[#334155] rounded-xl space-y-2">
                <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-sky-400" />
                  <span>Datos del Solicitante</span>
                </h4>
                <p className="text-slate-300">Persona: <strong className="text-white">{selectedRideForDetail.requester_person}</strong></p>
                <p className="text-slate-300">Empresa: <strong className="text-indigo-300">{selectedRideForDetail.requester_company}</strong></p>
                {selectedRideForDetail.customer?.phone && (
                  <p className="text-slate-300">Teléfono: <strong className="font-mono text-sky-400">{selectedRideForDetail.customer.phone}</strong></p>
                )}
              </div>

              <div className="p-3 bg-[#0F172A] border border-[#334155] rounded-xl space-y-2">
                <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Bike className="w-4 h-4 text-[#FDDE12]" />
                  <span>Conductor & Financiero</span>
                </h4>
                <p className="text-slate-300">
                  Motoquero: {selectedRideForDetail.driver ? (
                    <strong className="text-emerald-400">Móvil #{selectedRideForDetail.driver.movil_number} ({selectedRideForDetail.driver.profile?.full_name || 'Asignado'})</strong>
                  ) : (
                    <span className="text-amber-400 italic">Sin Asignar</span>
                  )}
                </p>
                <p className="text-slate-300">Forma de Pago: <strong className="text-white">{selectedRideForDetail.payment_method || 'Efectivo'}</strong></p>
                <p className="text-[#FDDE12] font-bold text-sm">Tarifa Total: Bs. {Number(selectedRideForDetail.total_fare).toFixed(2)}</p>
              </div>

              <div className="sm:col-span-2 p-3 bg-[#0F172A] border border-[#334155] rounded-xl space-y-2">
                <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-rose-400" />
                  <span>Ruta de Despacho</span>
                </h4>
                <p className="text-slate-300"><span className="text-slate-500">ORIGEN:</span> {selectedRideForDetail.pickup_address}</p>
                <p className="text-slate-300"><span className="text-slate-500">DESTINO:</span> {selectedRideForDetail.destination_address}</p>
                {selectedRideForDetail.cargo_description && (
                  <p className="text-amber-300 font-medium bg-amber-500/10 border border-amber-500/30 p-2 rounded-lg text-[11px]">
                    📦 Contenido / ¿Qué lleva?: &quot;{selectedRideForDetail.cargo_description}&quot;
                  </p>
                )}
                {selectedRideForDetail.observations && (
                  <p className="text-slate-400 italic bg-slate-900/60 p-2 rounded-lg text-[11px]">
                    Obs: &quot;{selectedRideForDetail.observations}&quot;
                  </p>
                )}
              </div>
            </div>

            {/* PENDING SURCHARGE APPROVAL SECTION */}
            {selectedRideForDetail.surcharge_status === 'pending' && (
              <div className="p-4 bg-amber-500/10 border-2 border-amber-500/50 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-400 animate-pulse flex-shrink-0" />
                    <div>
                      <h4 className="font-bold text-amber-300 text-xs uppercase tracking-wide">
                        Sobrecargo Pendiente de Aprobación
                      </h4>
                      <p className="text-[11px] text-amber-200/80">
                        El motoquero solicitó un cargo adicional por motivo operativo.
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-extrabold rounded uppercase">
                    PENDING
                  </span>
                </div>

                <div className="text-xs text-slate-300 bg-[#0F172A] p-3 rounded-lg border border-[#334155] space-y-1">
                  <p><strong>Monto Solicitado:</strong> <span className="text-[#FDDE12] font-mono font-bold text-sm">Bs. {Number(selectedRideForDetail.surcharge_amount || 0).toFixed(2)}</span></p>
                  <p><strong>Motivo:</strong> {selectedRideForDetail.surcharge_reason || 'Sin motivo especificado'}</p>
                  <p><strong>Carrera:</strong> {selectedRideForDetail.ride_code}</p>
                  <p><strong>Motoquero:</strong> {selectedRideForDetail.driver ? `Móvil #${selectedRideForDetail.driver.movil_number}` : 'No asignado'}</p>
                  <p><strong>Tarifa Base Actual:</strong> Bs. {Number(selectedRideForDetail.initial_fare + (selectedRideForDetail.wait_time_cost || 0)).toFixed(2)}</p>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={() => handleApproveSurcharge(selectedRideForDetail.id)}
                    disabled={isProcessingSurcharge}
                    className="flex-1 py-2 px-4 bg-emerald-500 hover:bg-emerald-400 text-[#0F172A] font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
                  >
                    {isProcessingSurcharge ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>[ Aprobar sobrecargo ]</span>
                  </button>

                  <button
                    onClick={() => handleRejectSurcharge(selectedRideForDetail.id)}
                    disabled={isProcessingSurcharge}
                    className="flex-1 py-2 px-4 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isProcessingSurcharge ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                    <span>[ Rechazar sobrecargo ]</span>
                  </button>
                </div>
              </div>
            )}

            {/* TIMELINE AUDIT SECTION */}
            <div className="p-4 bg-[#0F172A] border border-[#334155] rounded-xl space-y-3 text-xs">
              <h4 className="font-bold text-slate-200 flex items-center gap-2">
                <History className="w-4 h-4 text-purple-400" />
                <span>Auditoría de Eventos (Timeline)</span>
              </h4>

              {loadingTimeline ? (
                <div className="py-4 text-center text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#FDDE12]" />
                  <span>Cargando eventos del historial...</span>
                </div>
              ) : selectedRideTimeline.length === 0 ? (
                <p className="text-slate-500 text-center py-4">Sin registro de eventos en el timeline</p>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#334155]">
                  {selectedRideTimeline.map((evt) => (
                    <div key={evt.id} className="relative flex items-start justify-between gap-3">
                      <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-[#FDDE12] border-2 border-[#0F172A]" />
                      <div>
                        <p className="font-bold text-white text-xs">{evt.event_title}</p>
                        <p className="text-slate-400 text-[11px]">{evt.event_description}</p>
                        {evt.actor && (
                          <span className="text-[10px] text-slate-500">
                            Por: {evt.actor.full_name} ({evt.actor.role})
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                        {new Date(evt.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* STATE TRANSITION ACTION BUTTONS */}
            <div className="pt-3 border-t border-[#334155] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition-colors text-xs"
              >
                Cerrar Expediente
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {selectedRideForDetail.status === 'pending' && (
                  <>
                    <button
                      onClick={() => {
                        setIsDetailModalOpen(false);
                        handleOpenAssignModal(selectedRideForDetail);
                      }}
                      className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Asignar Motoquero</span>
                    </button>
                    <button
                      onClick={() => handleOpenCancelModal(selectedRideForDetail)}
                      className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold rounded-xl text-xs flex items-center gap-1"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Cancelar Carrera</span>
                    </button>
                  </>
                )}

                {selectedRideForDetail.status === 'assigned' && (
                  <>
                    <button
                      onClick={() => handleTransitionStatus(selectedRideForDetail, 'ontheway')}
                      className="px-4 py-2 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md"
                    >
                      <ChevronRight className="w-4 h-4" />
                      <span>Iniciar En Camino</span>
                    </button>
                    {(['SUPERADMIN', 'ADMIN'].includes((currentUserRole || '').toUpperCase()) || hasReassignPermission) && (
                      <button
                        onClick={() => {
                          setIsDetailModalOpen(false);
                          handleOpenReassignModal(selectedRideForDetail);
                        }}
                        className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Reasignar Carrera</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenCompletionModal(selectedRideForDetail)}
                      disabled={selectedRideForDetail.surcharge_status === 'pending'}
                      className={`px-4 py-2 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md ${
                        selectedRideForDetail.surcharge_status === 'pending'
                          ? 'bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600'
                          : 'bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A]'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Finalizar Carrera (Central)</span>
                    </button>
                    <button
                      onClick={() => handleOpenCancelModal(selectedRideForDetail)}
                      className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold rounded-xl text-xs flex items-center gap-1"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Cancelar Carrera</span>
                    </button>
                  </>
                )}

                {selectedRideForDetail.status === 'ontheway' && (
                  <>
                    {(['SUPERADMIN', 'ADMIN'].includes((currentUserRole || '').toUpperCase()) || hasReassignPermission) && (
                      <button
                        onClick={() => {
                          setIsDetailModalOpen(false);
                          handleOpenReassignModal(selectedRideForDetail);
                        }}
                        className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Reasignar Carrera</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenCompletionModal(selectedRideForDetail)}
                      disabled={selectedRideForDetail.surcharge_status === 'pending'}
                      className={`px-4 py-2 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md ${
                        selectedRideForDetail.surcharge_status === 'pending'
                          ? 'bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-[#0F172A]'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Finalizar Carrera (Central)</span>
                    </button>
                    <button
                      onClick={() => handleOpenCancelModal(selectedRideForDetail)}
                      className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold rounded-xl text-xs flex items-center gap-1"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Cancelar Carrera</span>
                    </button>
                  </>
                )}

                {selectedRideForDetail.status === 'completed' &&
                  !['DRIVER', 'CLIENT_USER'].includes((currentUserRole || '').toUpperCase()) &&
                  (['SUPERADMIN', 'ADMIN'].includes((currentUserRole || '').toUpperCase()) || hasCancelPermission) && (
                    <button
                      onClick={() => handleOpenAnnullationModal(selectedRideForDetail)}
                      className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Anular Comprobante</span>
                    </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: CONFIGURACIÓN DE TIEMPOS DE ESPERA Y ALERTAS (CENTRALIZADO EN SUPABASE) */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
                  <Settings className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">
                    Configuración Centralizada de Tiempos y Alertas
                  </h3>
                  <p className="text-xs text-slate-400">Umbrales compartidos en Supabase Cloud para toda la plataforma</p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!['CEO', 'SUPERADMIN', 'SUPERVISOR', 'ADMIN'].includes((currentUserRole || '').toUpperCase()) && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>Modo Solo Lectura: La configuración centralizada es administrada por Soporte, Administradores y Supervisores.</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div className="p-4 bg-[#0F172A] border border-[#334155] rounded-xl space-y-3">
                <h4 className="font-bold text-amber-400 text-xs flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>Carreras Pendientes de Asignación</span>
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Alerta Amarilla (min)
                    </label>
                    <input
                      type="number"
                      min="1"
                      disabled={!['CEO', 'SUPERADMIN', 'SUPERVISOR', 'ADMIN'].includes((currentUserRole || '').toUpperCase())}
                      value={tempSettings.unassignedYellowMin}
                      onChange={(e) =>
                        setTempSettings({ ...tempSettings, unassignedYellowMin: Math.max(1, Number(e.target.value)) })
                      }
                      className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#FDDE12] disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Alerta Roja / Prioridad (min)
                    </label>
                    <input
                      type="number"
                      min="1"
                      disabled={!['CEO', 'SUPERADMIN', 'SUPERVISOR', 'ADMIN'].includes((currentUserRole || '').toUpperCase())}
                      value={tempSettings.unassignedRedMin}
                      onChange={(e) =>
                        setTempSettings({ ...tempSettings, unassignedRedMin: Math.max(1, Number(e.target.value)) })
                      }
                      className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#FDDE12] disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-[#0F172A] border border-[#334155] rounded-xl space-y-3">
                <h4 className="font-bold text-sky-400 text-xs flex items-center gap-2">
                  <Bike className="w-4 h-4" />
                  <span>Carreras Asignadas</span>
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Alerta Amarilla (min)
                    </label>
                    <input
                      type="number"
                      min="1"
                      disabled={!['CEO', 'SUPERADMIN', 'SUPERVISOR', 'ADMIN'].includes((currentUserRole || '').toUpperCase())}
                      value={tempSettings.assignedYellowMin}
                      onChange={(e) =>
                        setTempSettings({ ...tempSettings, assignedYellowMin: Math.max(1, Number(e.target.value)) })
                      }
                      className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#FDDE12] disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Alerta Roja / Prioridad (min)
                    </label>
                    <input
                      type="number"
                      min="1"
                      disabled={!['CEO', 'SUPERADMIN', 'SUPERVISOR', 'ADMIN'].includes((currentUserRole || '').toUpperCase())}
                      value={tempSettings.assignedRedMin}
                      onChange={(e) =>
                        setTempSettings({ ...tempSettings, assignedRedMin: Math.max(1, Number(e.target.value)) })
                      }
                      className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#FDDE12] disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#334155] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-colors"
              >
                Cerrar
              </button>

              {['CEO', 'SUPERADMIN', 'SUPERVISOR', 'ADMIN'].includes((currentUserRole || '').toUpperCase()) && (
                <button
                  type="button"
                  disabled={isSavingSettings}
                  onClick={async () => {
                    setIsSavingSettings(true);
                    setErrorMsg(null);
                    const { settings: saved, error } = await saveDispatchSettings(tempSettings);
                    setIsSavingSettings(false);

                    if (error) {
                      setErrorMsg(error.message);
                    } else {
                      setSettings(saved);
                      setIsSettingsModalOpen(false);
                      setSuccessMsg('Configuración de tiempos centralizada guardada en Supabase.');
                    }
                  }}
                  className="px-5 py-2.5 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSavingSettings && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Guardar en Supabase</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: FINALIZACIÓN Y MÉTODO DE PAGO */}
      {isCompletionModalOpen && rideToComplete && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">
                    Finalización de Carrera y Cobro
                  </h3>
                  <p className="text-xs text-slate-400">
                    Selecciona el método de pago para registrar la finalización desde Central
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsCompletionModalOpen(false);
                  setRideToComplete(null);
                  setErrorMsg(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#0F172A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Banner de Error Contextual DENTRO del Modal */}
            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center justify-between gap-2 animate-fadeIn">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  className="text-rose-400 hover:text-white p-0.5 rounded transition-colors flex-shrink-0"
                  title="Cerrar advertencia"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Resumen de Carrera */}
            <div className="bg-[#0F172A] border border-[#334155] rounded-xl p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Código Carrera:</span>
                <span className="font-mono font-bold text-sky-400">{rideToComplete.ride_code}</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Cliente / Solicitante:</span>
                <span className="font-semibold text-white">
                  {rideToComplete.requester_person} ({rideToComplete.requester_company})
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Origen:</span>
                <span className="font-medium text-slate-200 line-clamp-1 max-w-[240px]">{rideToComplete.pickup_address}</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Destino:</span>
                <span className="font-medium text-slate-200 line-clamp-1 max-w-[240px]">{rideToComplete.destination_address}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#334155] text-sm">
                <span className="font-bold text-slate-300">Monto Total a Cobrar:</span>
                <span className="font-bold text-[#FDDE12] font-mono text-base">
                  Bs. {Number(rideToComplete.total_fare).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Selección de Método de Pago */}
            <form onSubmit={handleConfirmCompletionSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Forma de Pago <span className="text-rose-400">*</span>
                </label>
                <div className={`grid ${isTicketEligible ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
                  {isTicketEligible && (
                    <button
                      type="button"
                      onClick={() => {
                        setCompletionPaymentMethod('Ticket');
                        setErrorMsg(null);
                      }}
                      className={`py-3 px-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1.5 transition-all ${
                        completionPaymentMethod === 'Ticket'
                          ? 'bg-[#FDDE12]/10 border-[#FDDE12] text-[#FDDE12] ring-2 ring-[#FDDE12]/30'
                          : 'bg-[#0F172A] border-[#334155] text-slate-400 hover:text-white hover:border-slate-500'
                      }`}
                    >
                      <FileText className="w-5 h-5" />
                      <span>Ticket</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setCompletionPaymentMethod('Efectivo');
                      setErrorMsg(null);
                    }}
                    className={`py-3 px-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1.5 transition-all ${
                      completionPaymentMethod === 'Efectivo'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 ring-2 ring-emerald-500/30'
                        : 'bg-[#0F172A] border-[#334155] text-slate-400 hover:text-white hover:border-slate-500'
                    }`}
                  >
                    <Banknote className="w-5 h-5" />
                    <span>Efectivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCompletionPaymentMethod('QR');
                      setErrorMsg(null);
                    }}
                    className={`py-3 px-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1.5 transition-all ${
                      completionPaymentMethod === 'QR'
                        ? 'bg-sky-500/10 border-sky-500 text-sky-400 ring-2 ring-sky-500/30'
                        : 'bg-[#0F172A] border-[#334155] text-slate-400 hover:text-white hover:border-slate-500'
                    }`}
                  >
                    <QrCode className="w-5 h-5" />
                    <span>QR</span>
                  </button>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#334155]">
                <button
                  type="button"
                  onClick={() => {
                    setIsCompletionModalOpen(false);
                    setRideToComplete(null);
                    setErrorMsg(null);
                  }}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-colors text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCompletion}
                  className="px-5 py-2.5 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 text-xs disabled:opacity-50"
                >
                  {isSubmittingCompletion && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Confirmar Finalización</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: ANULACIÓN CONTROLADA DE COMPROBANTES */}
      {isAnnullationModalOpen && rideToAnnul && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl">
                  <Ban className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">
                    Anular Comprobante Digital
                  </h3>
                  <p className="text-xs text-slate-400">
                    Mecanismo formal de invalidación transaccional
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsAnnullationModalOpen(false);
                  setRideToAnnul(null);
                  setErrorMsg(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#0F172A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  className="text-rose-400 hover:text-white p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Resumen de Comprobante a Anular */}
            <div className="bg-[#0F172A] border border-[#334155] rounded-xl p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Comprobante:</span>
                <span className="font-mono font-bold text-rose-400">{rideToAnnul.ride_code}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Cliente:</span>
                <span className="font-semibold text-white">
                  {rideToAnnul.requester_person} ({rideToAnnul.requester_company})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Forma de Pago:</span>
                <span className="font-bold text-slate-200">{(rideToAnnul.payment_method || 'Efectivo').toUpperCase()}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#334155]">
                <span className="font-bold text-slate-300">Importe Total:</span>
                <span className="font-bold text-[#FDDE12] font-mono text-base">
                  Bs. {Number(rideToAnnul.total_fare).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <span>
                Esta acción no se puede deshacer. El número del comprobante quedará anulado y no podrá reutilizarse.
              </span>
            </div>

            <form onSubmit={handleConfirmAnnullationSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Motivo de Anulación <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={annullationReason}
                  onChange={(e) => setAnnullationReason(e.target.value)}
                  placeholder="Ej. Forma de pago incorrecta, registrado por error..."
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl p-3 text-white text-xs focus:outline-none focus:border-rose-400"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#334155]">
                <button
                  type="button"
                  onClick={() => {
                    setIsAnnullationModalOpen(false);
                    setRideToAnnul(null);
                    setErrorMsg(null);
                  }}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-colors text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAnnullation}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 text-xs disabled:opacity-50"
                >
                  {isSubmittingAnnullation && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Anular Comprobante</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 8: REASIGNACIÓN DE CARRERA / MOTOQUERO */}
      {isReassignModalOpen && rideToReassign && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
                  <RefreshCw className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">
                    Reasignar Carrera a Otro Motoquero
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cambio operativo de móvil manteniendo la identidad de la carrera
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsReassignModalOpen(false);
                  setRideToReassign(null);
                  setErrorMsg(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#0F172A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  className="text-rose-400 hover:text-white p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Context Notice Banner */}
            <div className="p-3 bg-sky-500/10 border border-sky-500/30 rounded-xl text-sky-300 text-xs flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">Información al Cliente:</p>
                <p>
                  El código <strong className="font-mono text-sky-400">{rideToReassign.ride_code}</strong> NO cambiará. El comprobante y seguimiento mostrarán únicamente al motoquero receptor.
                </p>
              </div>
            </div>

            {/* Current Ride & Driver Summary */}
            <div className="bg-[#0F172A] border border-[#334155] rounded-xl p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Código de Carrera:</span>
                <span className="font-mono font-bold text-sky-400">{rideToReassign.ride_code}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Solicitante:</span>
                <span className="font-semibold text-white">
                  {rideToReassign.requester_person} ({rideToReassign.requester_company})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Motoquero Actual (Reemplazado):</span>
                <span className="font-semibold text-amber-400">
                  {rideToReassign.driver
                    ? `Móvil #${rideToReassign.driver.movil_number} (${rideToReassign.driver.profile?.full_name || 'Asignado'})`
                    : 'Sin asignar'}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#334155]">
                <span className="font-bold text-slate-300">Monto Carrera:</span>
                <span className="font-bold text-[#FDDE12] font-mono text-base">
                  Bs. {Number(rideToReassign.total_fare).toFixed(2)}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmReassignSubmit} className="space-y-4 text-xs">
              {/* Candidate Driver Selection with Preassignment Capacity Awareness */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nuevo Motoquero Receptor <span className="text-rose-400">*</span>
                </label>
                {(() => {
                  const candidateDrivers = drivers.filter((d) => {
                    if (d.id === rideToReassign?.driver_id) return false;
                    if (d.status === 'baja' || d.status === 'offline') return false;

                    const countOnTheWay = rides.filter((r) => r.driver_id === d.id && r.status === 'ontheway').length;
                    const countAssigned = rides.filter((r) => r.driver_id === d.id && r.status === 'assigned').length;
                    const totalActive = countOnTheWay + countAssigned;

                    if (rideToReassign?.status === 'ontheway') {
                      return countOnTheWay === 0 && countAssigned === 0 && totalActive === 0;
                    } else { // assigned (en espera)
                      return countAssigned === 0 && totalActive < 2;
                    }
                  });

                  if (candidateDrivers.length === 0) {
                    return (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs">
                        ⚠️ No hay otros motoqueros activos con capacidad disponible para recibir esta carrera.
                      </div>
                    );
                  }

                  return (
                    <select
                      required
                      value={reassignDriverId}
                      onChange={(e) => setReassignDriverId(e.target.value)}
                      className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-400 text-xs"
                    >
                      <option value="">-- Seleccionar Motoquero Receptor --</option>
                      {candidateDrivers.map((drv) => {
                        const countOnTheWay = rides.filter((r) => r.driver_id === drv.id && r.status === 'ontheway').length;
                        const isPreassignCandidate = countOnTheWay > 0;
                        return (
                          <option key={drv.id} value={drv.id}>
                            Móvil #{drv.movil_number} - {drv.profile?.full_name || 'Sin Nombre'} ({drv.vehicle_type || 'Moto'}) {isPreassignCandidate ? '— [Preasignación]' : '— [Disponible]'}
                          </option>
                        );
                      })}
                    </select>
                  );
                })()}
              </div>

              {/* Reassignment Reason Category */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Motivo Operativo de Reasignación <span className="text-rose-400">*</span>
                </label>
                <select
                  required
                  value={reassignReasonCategory}
                  onChange={(e) => setReassignReasonCategory(e.target.value as ReassignmentReasonCategory)}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-400 text-xs"
                >
                  <option value="PINCHADURA">🔧 Pinchadura de llanta / neumático</option>
                  <option value="ACCIDENTE">🚨 Percance / Accidente de tránsito</option>
                  <option value="FALLA_MECANICA">⚙️ Falla mecánica del vehículo</option>
                  <option value="INDISPONIBILIDAD_MOTOQUERO">👤 Indisposición / Urgencia del motoquero</option>
                  <option value="PROBLEMA_MOVIL">📱 Problema técnico con el dispositivo/móvil</option>
                  <option value="OTRO">📋 Otro motivo operativo (requiere detalle obligatorio)</option>
                </select>
              </div>

              {/* Reason Detail Textarea */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Detalle Adicional del Motivo {reassignReasonCategory === 'OTRO' && <span className="text-rose-400">*</span>}
                </label>
                <textarea
                  rows={2}
                  required={reassignReasonCategory === 'OTRO'}
                  value={reassignReasonDetail}
                  onChange={(e) => setReassignReasonDetail(e.target.value)}
                  placeholder={
                    reassignReasonCategory === 'OTRO'
                      ? 'Describa detalladamente la razón operativa...'
                      : 'Observación opcional para auditoría interna...'
                  }
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl p-3 text-white text-xs focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#334155]">
                <button
                  type="button"
                  onClick={() => {
                    setIsReassignModalOpen(false);
                    setRideToReassign(null);
                    setErrorMsg(null);
                  }}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-colors text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmittingReassign ||
                    drivers.filter((d) => d.status === 'available' && d.id !== rideToReassign?.driver_id).length === 0
                  }
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-[#0F172A] font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 text-xs disabled:opacity-50"
                >
                  {isSubmittingReassign && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Confirmar Reasignación</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Subcomponent for rendering individual Ride Cards inside Kanban Columns
 */
interface RideCardProps {
  ride: RideWithDetails;
  timerBadge?: React.ReactNode;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onAssign?: () => void;
  onStartOnTheWay?: () => void;
  onComplete?: () => void;
  onReassign?: () => void;
  onCancel?: () => void;
  onViewDetail: () => void;
  getPriorityBadge: (p: RidePriority) => React.ReactNode;
}

function RideCard({
  ride,
  timerBadge,
  onDragStart,
  onDragEnd,
  onAssign,
  onStartOnTheWay,
  onComplete,
  onReassign,
  onCancel,
  onViewDetail,
  getPriorityBadge,
}: RideCardProps) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      draggable={true}
      onDragStart={(e) => {
        setIsDragging(true);
        e.dataTransfer.setData('text/plain', ride.id);
        if (onDragStart) onDragStart(e);
      }}
      onDragEnd={(e) => {
        setIsDragging(false);
        if (onDragEnd) onDragEnd(e);
      }}
      className={`p-3 bg-[#0F172A] border rounded-xl space-y-2.5 shadow-md transition-all group cursor-grab active:cursor-grabbing ${
        isDragging
          ? 'opacity-40 border-[#FDDE12] ring-2 ring-[#FDDE12]/50 scale-[0.98]'
          : 'border-[#334155] hover:border-[#FDDE12]/50'
      }`}
    >
      {/* Header Badge & Drag Handle */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <GripVertical className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#FDDE12] transition-colors" />
          <span
            onClick={onViewDetail}
            className="font-mono font-bold text-sky-400 cursor-pointer hover:underline flex items-center gap-1"
          >
            {ride.ride_code}
          </span>
        </div>
        {getPriorityBadge(ride.priority)}
      </div>

      {/* Dynamic Wait Timer Badge */}
      {timerBadge}

      {/* Surcharge Pending Warning Badge */}
      {ride.surcharge_status === 'pending' && (
        <div className="px-2 py-1 bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] font-extrabold rounded-md flex items-center gap-1 animate-pulse">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span>Sobrecargo Pendiente: +Bs. {Number(ride.surcharge_amount || 0).toFixed(2)}</span>
        </div>
      )}

      {/* Customer / Company */}
      <div onClick={onViewDetail} className="cursor-pointer space-y-0.5">
        <h4 className="font-bold text-white text-xs group-hover:text-[#FDDE12] transition-colors">
          {ride.requester_person}
        </h4>
        <p className="text-[11px] text-indigo-300 font-medium">
          {ride.requester_company}
        </p>
      </div>

      {/* Route */}
      <div onClick={onViewDetail} className="cursor-pointer space-y-1 text-[11px] text-slate-300">
        <div className="flex items-start gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <span className="line-clamp-1">{ride.pickup_address}</span>
        </div>
        <div className="flex items-start gap-1.5">
          <ChevronRight className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
          <span className="line-clamp-1">{ride.destination_address}</span>
        </div>
      </div>

      {/* Driver Badge */}
      <div className="pt-2 border-t border-[#334155]/60 flex items-center justify-between text-[11px]">
        {ride.driver ? (
          <div className="flex items-center gap-1 text-emerald-400 font-semibold">
            <Bike className="w-3.5 h-3.5" />
            <span>Móvil #{ride.driver.movil_number}</span>
          </div>
        ) : (
          <span className="text-amber-400 italic text-[10px]">Sin Motoquero</span>
        )}

        <div className="font-bold text-white font-mono">
          Bs. {Number(ride.total_fare).toFixed(2)}
        </div>
      </div>

      {/* Card Action Buttons */}
      <div className="pt-1 flex items-center justify-between gap-2">
        <button
          onClick={onViewDetail}
          className="text-[10px] text-slate-400 hover:text-white underline"
        >
          Detalles
        </button>

        <div className="flex items-center gap-1">
          {ride.status === 'pending' && onAssign && (
            <button
              onClick={onAssign}
              className="px-2 py-1 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded text-[10px]"
            >
              Asignar
            </button>
          )}

          {ride.status === 'assigned' && onStartOnTheWay && (
            <button
              onClick={onStartOnTheWay}
              className="px-2 py-1 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded text-[10px]"
            >
              En Camino
            </button>
          )}

          {onReassign && (ride.status === 'assigned' || ride.status === 'ontheway') && (
            <button
              type="button"
              onClick={onReassign}
              title="Reasignar carrera a otro motoquero"
              className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold rounded text-[10px] flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reasignar</span>
            </button>
          )}

          {ride.status === 'ontheway' && onComplete && (
            <button
              onClick={onComplete}
              className="px-2 py-1 bg-emerald-500 hover:bg-emerald-400 text-[#0F172A] font-bold rounded text-[10px]"
            >
              Completar
            </button>
          )}

          {onCancel && (ride.status === 'pending' || ride.status === 'assigned' || ride.status === 'ontheway') && (
            <button
              onClick={onCancel}
              title="Cancelar carrera"
              className="p-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
