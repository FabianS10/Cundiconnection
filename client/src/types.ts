export type User = {
  id: number;
  email: string;
  displayName: string;
  campus?: string;
  program?: string;
  semester?: string;
  bio?: string;
  interests?: string;
  avatarGradient?: string;
  avatarUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  role: 'student' | 'admin';
  adminNote?: string;
  createdAt?: string;
  approvedAt?: string;
  lastLoginAt?: string;
};

export type RegisterPayload = {
  email: string;
  password: string;
  displayName: string;
  campus: string;
  program: string;
  semester: string;
  bio: string;
  interests: string;
};

export type DailyStat = { day: string; count: number };

export type AdminStats = {
  users: { total: number; pending: number; approved: number; rejected: number };
  matches: number;
  swipes: { total: number; likes: number; passes: number; likeRate: number };
  daily: DailyStat[];
  campuses: { campus: string; count: number }[];
  programs: { program: string; count: number }[];
};

export type AuditEntry = {
  id: number;
  action: string;
  note: string;
  created_at: string;
  admin_name: string;
  admin_email: string;
  target_name: string;
  target_email: string;
};
