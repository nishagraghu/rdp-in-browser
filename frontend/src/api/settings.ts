import api from '../api/client';

export interface CustomerLogoSettings {
  hasLogo: boolean;
  logoUrl: string | null;
  originalName: string | null;
  mimeType: string | null;
  updatedAt: string;
  updatedById: string | null;
}

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
