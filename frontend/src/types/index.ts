export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  picture?: string | null;
  photoUrl?: string | null;
}

export interface EmailSchedulePayload {
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
}

export interface EmailRecord {
  id: string;
  userId: string;
  recipient: string;
  subject: string;
  body: string;
  status: 'PENDING' | 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED';
  scheduledAt: string;
  sentAt?: string;
  etherealPreviewUrl?: string;
  createdAt: string;
  updatedAt: string;
}
