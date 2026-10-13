import api from '../api/client';
import { SmtpEncryption, SmtpSettingsDto } from '@rdp/shared';

export interface CustomerLogoSettings {
  hasLogo: boolean;
  logoUrl: string | null;
  originalName: string | null;
  mimeType: string | null;
  updatedAt: string;
  updatedById: string | null;
}

export type SmtpSettings = SmtpSettingsDto;

export async function fetchCustomerLogoSettings(): Promise<CustomerLogoSettings> {
  const res = await api.get('/settings/logo');
  if (!res.data?.success) {
    throw new Error(res.data?.error || 'Failed to load logo settings');
  }
  return res.data.data as CustomerLogoSettings;
}

export async function uploadCustomerLogo(file: File): Promise<CustomerLogoSettings> {
  const formData = new FormData();
  formData.append('logo', file);
  const res = await api.post('/settings/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  if (!res.data?.success) {
    throw new Error(res.data?.error || 'Failed to upload logo');
  }
  return res.data.data as CustomerLogoSettings;
}

export async function deleteCustomerLogo(): Promise<CustomerLogoSettings> {
  const res = await api.delete('/settings/logo');
  if (!res.data?.success) {
    throw new Error(res.data?.error || 'Failed to remove logo');
  }
  return res.data.data as CustomerLogoSettings;
}

export async function fetchSmtpSettings(): Promise<SmtpSettings> {
  const res = await api.get('/settings/smtp');
  if (!res.data?.success) {
    throw new Error(res.data?.error || 'Failed to load SMTP settings');
  }
  return res.data.data as SmtpSettings;
}

export async function saveSmtpSettings(payload: {
  host: string;
  port: number;
  username: string;
  password?: string;
  encryption: SmtpEncryption;
  fromEmail: string;
  fromName?: string;
}): Promise<SmtpSettings> {
  const res = await api.put('/settings/smtp', payload);
  if (!res.data?.success) {
    throw new Error(res.data?.error || 'Failed to save SMTP settings');
  }
  return res.data.data as SmtpSettings;
}

export async function testSmtpSettings(payload: {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  encryption?: SmtpEncryption;
  fromEmail?: string;
  fromName?: string;
  testRecipient?: string;
}): Promise<{ recipient: string; message?: string }> {
  const res = await api.post('/settings/smtp/test', payload);
  if (!res.data?.success) {
    throw new Error(res.data?.error || 'SMTP test failed');
  }
  return {
    recipient: res.data.data?.recipient,
    message: res.data.message,
  };
}
