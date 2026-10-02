export type TicketFormat = 'detailed' | 'simple';

export interface SystemSettings {
  ticketFormat: TicketFormat;
  companyPortalEnabled: boolean;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  ticketFormat: 'detailed',
  companyPortalEnabled: false,
};

/**
 * Retrieves global system settings from server API.
 * Accessible publicly or server-side.
 */
export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const res = await fetch('/api/admin/settings', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return {
        ticketFormat: (data.ticketFormat === 'simple' || data.ticketFormat === 'detailed')
          ? data.ticketFormat
          : DEFAULT_SYSTEM_SETTINGS.ticketFormat,
        companyPortalEnabled: typeof data.companyPortalEnabled === 'boolean'
          ? data.companyPortalEnabled
          : DEFAULT_SYSTEM_SETTINGS.companyPortalEnabled,
      };
    }
  } catch (e) {
    console.warn('Error reading system settings from API, defaulting:', e);
  }
  return { ...DEFAULT_SYSTEM_SETTINGS };
}

/**
 * Retrieves global ticket format setting.
 */
export async function getTicketFormatSetting(): Promise<TicketFormat> {
  const settings = await getSystemSettings();
  return settings.ticketFormat;
}

/**
 * Retrieves COMPANY_PORTAL_ENABLED setting.
 * Default is FALSE.
 */
export async function getCompanyPortalEnabled(): Promise<boolean> {
  const settings = await getSystemSettings();
  return settings.companyPortalEnabled;
}

/**
 * Saves ticket format setting via admin API.
 * Enforces strict authorization (SUPERADMIN / Soporte only).
 */
export async function saveTicketFormatSetting(format: TicketFormat): Promise<{ success: boolean; error?: string }> {
  return saveSystemSettings({ ticketFormat: format });
}

/**
 * Saves COMPANY_PORTAL_ENABLED setting via admin API.
 * Enforces strict authorization (SUPERADMIN / Soporte only).
 */
export async function saveCompanyPortalSetting(enabled: boolean): Promise<{ success: boolean; error?: string }> {
  return saveSystemSettings({ companyPortalEnabled: enabled });
}

/**
 * Saves system settings via admin API.
 */
export async function saveSystemSettings(settings: Partial<SystemSettings>): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Error al guardar configuración.' };
    }

    return { success: true };
  } catch (e: unknown) {
    const error = e as Error;
    return { success: false, error: error.message || 'Error de conexión al guardar.' };
  }
}
