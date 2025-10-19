'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { getSession } from '@/lib/session';
import { getPendingReviews, getAllReports, reviewBan, getReportStats, getAdminEventSettings, updateEventSettings, getAdminEventAttendance } from '@/lib/api';
import { API_BASE } from '@/lib/config';

interface Report {
  reportId: string;
  reportedUserId: string;
  reportedUserName: string;
  reportedUserSelfie?: string;
  reportedUserVideo?: string;
  reporterUserId: string;
  reporterName: string;
  reporterIp: string;
  reason?: string;
  timestamp: number;
  roomId?: string;
}

interface BanRecord {
  userId: string;
  userName: string;
  userSelfie?: string;
  userVideo?: string;
  banStatus: 'temporary' | 'permanent';
  bannedAt: number;
  bannedReason: string;
  reportCount: number;
  reviewStatus: string;
  reports: Report[];
}

interface Stats {
  totalReports: number;
  totalBans: number;
  pendingReviews: number;
  permanentBans: number;
  temporaryBans: number;
  vindicated: number;
}

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [pendingReviews, setPendingReviews] = useState<BanRecord[]>([]);
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedUser, setSelectedUser] = useState<BanRecord | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'reports' | 'qrcodes' | 'event'>('pending');
  const [qrCodes, setQrCodes] = useState<any[]>([]);
  const [generatingQR, setGeneratingQR] = useState(false);
  const [qrLabel, setQrLabel] = useState('');
  
  // Event mode state
  const [eventSettings, setEventSettings] = useState<any>(null);
  const [eventModeEnabled, setEventModeEnabled] = useState(false);
  const [eventStartTime, setEventStartTime] = useState('15:00:00');
  const [eventEndTime, setEventEndTime] = useState('18:00:00');
  const [eventTimezone, setEventTimezone] = useState('America/Los_Angeles');
  const [eventDays, setEventDays] = useState<number[]>([]);
  const [savingEvent, setSavingEvent] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<any>(null);

  useEffect(() => {
    // Check for admin authentication
    const adminToken = localStorage.getItem('napalmsky_admin_token');
    
    if (!adminToken) {
      // No admin token, redirect to admin login
      console.log('[Admin] No admin token found, redirecting to login');
      router.push('/admin-login');
      return;
    }

    // Verify admin token is valid
    console.log('[Admin] Verifying admin session...');
    fetch(`${API_BASE}/admin/verify`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    })
      .then(res => {
        if (!res.ok) {
          console.warn('[Admin] Session verification failed with status:', res.status);
          throw new Error('Invalid admin session');
        }
        return res.json();
      })
      .then((data) => {
        // Admin authenticated, load data
        console.log('[Admin] Session verified for:', data.username);
        loadData();
      })
      .catch((error) => {
        // Invalid token, show error and redirect
        console.error('[Admin] Session validation error:', error);
        setSessionError(true);
        setLoading(false);
        
        // Wait 2 seconds then redirect to login
        setTimeout(() => {
          localStorage.removeItem('napalmsky_admin_token');
          router.push('/admin-login');
        }, 2000);
      });
  }, [router]);

  const loadData = async () => {
    // Use admin token for all admin API calls
    const adminToken = localStorage.getItem('napalmsky_admin_token');

    if (!adminToken) {
      router.push('/admin-login');
      return;
    }

    try {
      setLoading(true);
      const [pending, reports, statsData, codes, evtSettings] = await Promise.all([
        // ALL admin endpoints use adminToken (not user session)
        fetch(`${API_BASE}/report/pending`, {
          headers: { 'Authorization': `Bearer ${adminToken}` },
        }).then(r => r.ok ? r.json() : { pending: [] }).catch(() => ({ pending: [] })),
        
        fetch(`${API_BASE}/report/all`, {
          headers: { 'Authorization': `Bearer ${adminToken}` },
        }).then(r => r.ok ? r.json() : { reports: [] }).catch(() => ({ reports: [] })),
        
        fetch(`${API_BASE}/report/stats`, {
          headers: { 'Authorization': `Bearer ${adminToken}` },
        }).then(r => r.ok ? r.json() : null).catch(() => null),
        
        fetch(`${API_BASE}/payment/admin/codes`, {
          headers: { 'Authorization': `Bearer ${adminToken}` },
        }).then(r => r.ok ? r.json() : { codes: [] }).catch(() => ({ codes: [] })),
        
        getAdminEventSettings(adminToken).catch(() => null),
      ]);

      setPendingReviews(pending.pending || []);
      setAllReports(reports.reports || []);
      setStats(statsData);
      setQrCodes(codes.codes || []);
      
      // Load event settings
      if (evtSettings) {
        setEventSettings(evtSettings);
        setEventModeEnabled(evtSettings.eventModeEnabled || false);
        setEventStartTime(evtSettings.eventStartTime || '15:00:00');
        setEventEndTime(evtSettings.eventEndTime || '18:00:00');
        setEventTimezone(evtSettings.timezone || 'America/Los_Angeles');
        setEventDays(evtSettings.eventDays || []);
        
        // Load today's attendance
        const today = new Date().toISOString().split('T')[0];
        try {
          // FIXED: Use admin token
          const attendance = await getAdminEventAttendance(adminToken, today);
          setTodayAttendance(attendance);
        } catch (err) {
          console.log('[Admin] No attendance data for today');
        }
      }
    } catch (error) {
      console.error('[Admin] Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQRCode = async () => {
    const adminToken = localStorage.getItem('napalmsky_admin_token');
    if (!adminToken || !qrLabel.trim()) return;

    setGeneratingQR(true);
    try {
      const res = await fetch(`${API_BASE}/payment/admin/generate-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ label: qrLabel || 'Admin QR Code' }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to generate code');
      }

      const data = await res.json();
      console.log('[Admin] Generated QR code:', data.code);
      
      // Reload codes
      await loadData();
      setQrLabel('');
      alert(`QR Code generated: ${data.code}`);
    } catch (error: any) {
      console.error('[Admin] Failed to generate QR code:', error);
      alert(error.message || 'Failed to generate QR code');
    } finally {
      setGeneratingQR(false);
    }
  };

  const handleDeactivateCode = async (code: string) => {
    const adminToken = localStorage.getItem('napalmsky_admin_token');
    if (!adminToken) return;

    if (!confirm(`Deactivate code ${code}?`)) return;

    try {
      await fetch(`${API_BASE}/payment/admin/deactivate-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      await loadData();
    } catch (error) {
      console.error('[Admin] Failed to deactivate code:', error);
      alert('Failed to deactivate code');
    }
  };

  const handleReview = async (userId: string, decision: 'permanent' | 'vindicated') => {
    const adminToken = localStorage.getItem('napalmsky_admin_token');
    if (!adminToken) return;

    try {
      setReviewing(true);
      
      // Call review endpoint with adminToken
      const res = await fetch(`${API_BASE}/report/review/${userId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision }),
      });
      
      if (!res.ok) {
        throw new Error('Failed to review ban');
      }
      
      // Reload data
      await loadData();
      setSelectedUser(null);
    } catch (error) {
      console.error('[Admin] Failed to review ban:', error);
      alert('Failed to submit review');
    } finally {
      setReviewing(false);
    }
  };

  const handleSaveEventSettings = async () => {
    // FIXED: Use admin token for admin API calls
    const adminToken = localStorage.getItem('napalmsky_admin_token');
    if (!adminToken) return;

    try {
      setSavingEvent(true);
      // FIXED: Use admin token instead of session token
      await updateEventSettings(adminToken, {
        eventModeEnabled,
        eventStartTime,
        eventEndTime,
        timezone: eventTimezone,
        eventDays,
      });
      
      alert('Event settings saved successfully!');
      await loadData();
    } catch (error: any) {
      console.error('[Admin] Failed to save event settings:', error);
      alert(error.message || 'Failed to save event settings');
    } finally {
      setSavingEvent(false);
    }
  };

  const toggleEventDay = (day: number) => {
    setEventDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  if (sessionError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="text-center">
          <div className="mb-4 text-6xl">🔒</div>
          <h2 className="font-playfair text-2xl font-bold text-[#eaeaf0] mb-2">
            Admin Session Expired
          </h2>
          <p className="text-[#eaeaf0]/70 mb-4">
            Your admin session has been lost (backend restarted).
          </p>
          <p className="text-sm text-[#eaeaf0]/50">
            Redirecting to login in 2 seconds...
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="text-center">
          <div className="mb-4 text-4xl">⏳</div>
          <p className="text-[#eaeaf0]/70">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0c] p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-playfair text-3xl font-bold text-[#eaeaf0] sm:text-4xl">
              Admin Panel
            </h1>
            <p className="mt-2 text-[#eaeaf0]/70">
              Review reports and manage banned users
            </p>
          </div>
          <button
            onClick={() => router.push('/main')}
            className="focus-ring rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
          >
            Back to Dashboard
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="rounded-xl bg-white/5 p-4">
            <p className="text-sm text-[#eaeaf0]/50">Total Reports</p>
            <p className="mt-1 text-2xl font-bold text-[#eaeaf0]">{stats.totalReports}</p>
          </div>
          <div className="rounded-xl bg-orange-500/10 p-4">
            <p className="text-sm text-orange-300/70">Pending</p>
            <p className="mt-1 text-2xl font-bold text-orange-400">{stats.pendingReviews}</p>
          </div>
          <div className="rounded-xl bg-red-500/10 p-4">
            <p className="text-sm text-red-300/70">Permanent Bans</p>
            <p className="mt-1 text-2xl font-bold text-red-400">{stats.permanentBans}</p>
          </div>
          <div className="rounded-xl bg-yellow-500/10 p-4">
            <p className="text-sm text-yellow-300/70">Temporary Bans</p>
            <p className="mt-1 text-2xl font-bold text-yellow-400">{stats.temporaryBans}</p>
          </div>
          <div className="rounded-xl bg-green-500/10 p-4">
            <p className="text-sm text-green-300/70">Vindicated</p>
            <p className="mt-1 text-2xl font-bold text-green-400">{stats.vindicated}</p>
          </div>
          <div className="rounded-xl bg-white/5 p-4">
            <p className="text-sm text-[#eaeaf0]/50">Total Bans</p>
            <p className="mt-1 text-2xl font-bold text-[#eaeaf0]">{stats.totalBans}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-white/10 overflow-x-auto">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'pending'
              ? 'border-b-2 border-[#ff9b6b] text-[#ff9b6b]'
              : 'text-[#eaeaf0]/50 hover:text-[#eaeaf0]/70'
          }`}
        >
          Pending Reviews ({pendingReviews.length})
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'reports'
              ? 'border-b-2 border-[#ff9b6b] text-[#ff9b6b]'
              : 'text-[#eaeaf0]/50 hover:text-[#eaeaf0]/70'
          }`}
        >
          All Reports ({allReports.length})
        </button>
        <button
          onClick={() => setActiveTab('qrcodes')}
          className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'qrcodes'
              ? 'border-b-2 border-[#ff9b6b] text-[#ff9b6b]'
              : 'text-[#eaeaf0]/50 hover:text-[#eaeaf0]/70'
          }`}
        >
          QR Codes ({qrCodes.filter(c => c.type === 'admin').length})
        </button>
        <button
          onClick={() => setActiveTab('event')}
          className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'event'
              ? 'border-b-2 border-[#ff9b6b] text-[#ff9b6b]'
              : 'text-[#eaeaf0]/50 hover:text-[#eaeaf0]/70'
          }`}
        >
          Event Settings {eventModeEnabled && '🎉'}
        </button>
      </div>

      {/* Content */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {pendingReviews.length === 0 ? (
            <div className="rounded-xl bg-white/5 p-8 text-center">
              <p className="text-[#eaeaf0]/70">No pending reviews</p>
            </div>
          ) : (
            pendingReviews.map((record) => (
              <div
                key={record.userId}
                className="rounded-xl bg-white/5 p-6 transition-all hover:bg-white/10"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4">
                      {record.userSelfie && (
                        <Image
                          src={record.userSelfie || ''}
                          alt={record.userName}
                          width={64}
                          height={64}
                          className="h-16 w-16 rounded-full object-cover"
                        />
                      )}
                      <div>
                        <h3 className="text-xl font-bold text-[#eaeaf0]">{record.userName}</h3>
                        <p className="text-sm text-[#eaeaf0]/50">
                          {record.reportCount} reports • Banned {new Date(record.bannedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg bg-white/5 p-4">
                      <p className="text-sm font-medium text-[#eaeaf0]/70">Ban Reason:</p>
                      <p className="mt-1 text-[#eaeaf0]">{record.bannedReason}</p>
                    </div>

                    <div className="mt-4">
                      <p className="mb-2 text-sm font-medium text-[#eaeaf0]/70">
                        Reports ({record.reports.length}):
                      </p>
                      <div className="space-y-2">
                        {record.reports.slice(0, 5).map((report) => (
                          <div
                            key={report.reportId}
                            className="rounded-lg bg-white/5 p-3 text-sm"
                          >
                            <div className="flex justify-between">
                              <span className="text-[#eaeaf0]">By: {report.reporterName}</span>
                              <span className="text-[#eaeaf0]/50">
                                {new Date(report.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            {report.reason && (
                              <p className="mt-1 text-[#eaeaf0]/70">{report.reason}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => handleReview(record.userId, 'permanent')}
                    disabled={reviewing}
                    className="focus-ring flex-1 rounded-xl bg-red-500/80 px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {reviewing ? 'Processing...' : 'Permanent Ban'}
                  </button>
                  <button
                    onClick={() => handleReview(record.userId, 'vindicated')}
                    disabled={reviewing}
                    className="focus-ring flex-1 rounded-xl bg-green-500/80 px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {reviewing ? 'Processing...' : 'Vindicate'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-4">
          {allReports.length === 0 ? (
            <div className="rounded-xl bg-white/5 p-8 text-center">
              <p className="text-[#eaeaf0]/70">No reports found</p>
            </div>
          ) : (
            allReports.map((report) => (
              <div
                key={report.reportId}
                className="rounded-xl bg-white/5 p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-[#eaeaf0]">
                          {report.reportedUserName}
                        </h3>
                        <p className="text-sm text-[#eaeaf0]/50">
                          Reported by {report.reporterName}
                        </p>
                      </div>
                      <span className="text-sm text-[#eaeaf0]/50">
                        {new Date(report.timestamp).toLocaleString()}
                      </span>
                    </div>
                    
                    {report.reason && (
                      <div className="mt-3 rounded-lg bg-white/5 p-3">
                        <p className="text-sm text-[#eaeaf0]/70">{report.reason}</p>
                      </div>
                    )}
                    
                    <div className="mt-3 flex gap-4 text-xs text-[#eaeaf0]/50">
                      <span>Reporter IP: {report.reporterIp}</span>
                      {report.roomId && <span>Room: {report.roomId.substring(0, 8)}...</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'qrcodes' && (
        <div className="space-y-6">
          {/* Generate New Admin Code */}
          <div className="rounded-xl bg-purple-500/10 border border-purple-500/30 p-6">
            <h3 className="text-lg font-bold text-purple-300 mb-3">
              Generate Permanent QR Code
            </h3>
            <p className="text-sm text-[#eaeaf0]/70 mb-4">
              Create unlimited-use QR codes for events, trusted locations, etc.
            </p>
            
            <div className="flex gap-3">
              <input
                type="text"
                value={qrLabel}
                onChange={(e) => setQrLabel(e.target.value)}
                placeholder="Label (e.g., 'Campus Event 2025')"
                className="flex-1 rounded-lg bg-white/10 px-4 py-2.5 text-sm text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={handleGenerateQRCode}
                disabled={generatingQR}
                className="focus-ring rounded-lg bg-purple-500 px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {generatingQR ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>

          {/* Admin Codes Only */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-[#eaeaf0]">Permanent QR Codes</h3>
            
            {qrCodes.filter(c => c.type === 'admin').length === 0 ? (
              <div className="rounded-xl bg-white/5 p-6 text-center">
                <p className="text-sm text-[#eaeaf0]/70">No permanent codes yet</p>
              </div>
            ) : (
              qrCodes.filter(c => c.type === 'admin').map((code) => (
                <div
                  key={code.code}
                  className={`rounded-xl p-5 ${
                    code.isActive ? 'bg-white/5' : 'bg-red-500/5 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* QR Code */}
                    <div className="rounded-lg bg-white p-2 flex-shrink-0">
                      <Image 
                        src={`${API_BASE}/payment/qr/${code.code}`}
                        alt="QR Code"
                        width={96}
                        height={96}
                        className="w-24 h-24"
                        unoptimized
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-mono text-sm font-bold text-purple-300">
                          {code.code}
                        </h4>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-300">
                          UNLIMITED
                        </span>
                        {!code.isActive && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-300">
                            INACTIVE
                          </span>
                        )}
                      </div>
                      
                      <div className="text-xs text-[#eaeaf0]/50 mb-3">
                        {code.createdBy} • {new Date(code.createdAt).toLocaleDateString()} • {code.totalUsed} uses
                      </div>

                      <div className="flex gap-2">
                        <a
                          href={`${API_BASE}/payment/qr/${code.code}`}
                          download={`qr-${code.code}.png`}
                          className="focus-ring flex-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-center font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
                        >
                          Download
                        </a>
                        {code.isActive && (
                          <button
                            onClick={() => handleDeactivateCode(code.code)}
                            className="focus-ring flex-1 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-300 transition-all hover:bg-red-500/30"
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'event' && (
        <div className="space-y-6">
          {/* Event Mode Toggle */}
          <div className="rounded-xl bg-gradient-to-r from-[#ff9b6b]/10 to-[#ff7a45]/10 border border-[#ff9b6b]/30 p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-[#ff9b6b] mb-2">
                  Event Mode {eventModeEnabled ? 'ON' : 'OFF'}
                </h3>
                <p className="text-sm text-[#eaeaf0]/70 mb-4">
                  {eventModeEnabled 
                    ? 'Matchmaking is restricted to scheduled event hours'
                    : 'Users can access matchmaking 24/7 (normal operation)'}
                </p>
              </div>
              <button
                onClick={() => setEventModeEnabled(!eventModeEnabled)}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                  eventModeEnabled ? 'bg-[#ff9b6b]' : 'bg-white/20'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    eventModeEnabled ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Event Window Settings */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-6">
            <h3 className="text-lg font-bold text-[#eaeaf0] mb-4">Event Window</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Start Time */}
              <div>
                <label className="block text-sm font-medium text-[#eaeaf0] mb-2">
                  Start Time
                </label>
                <input
                  type="time"
                  value={eventStartTime.substring(0, 5)}
                  onChange={(e) => setEventStartTime(`${e.target.value}:00`)}
                  step="1800"
                  className="w-full rounded-lg bg-white/10 border border-white/20 px-4 py-2.5 text-[#eaeaf0] focus:outline-none focus:ring-2 focus:ring-[#ff9b6b]"
                />
              </div>

              {/* End Time */}
              <div>
                <label className="block text-sm font-medium text-[#eaeaf0] mb-2">
                  End Time
                </label>
                <input
                  type="time"
                  value={eventEndTime.substring(0, 5)}
                  onChange={(e) => setEventEndTime(`${e.target.value}:00`)}
                  step="1800"
                  className="w-full rounded-lg bg-white/10 border border-white/20 px-4 py-2.5 text-[#eaeaf0] focus:outline-none focus:ring-2 focus:ring-[#ff9b6b]"
                />
              </div>
            </div>

            {/* Timezone */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[#eaeaf0] mb-2">
                Timezone
              </label>
              <select
                value={eventTimezone}
                onChange={(e) => setEventTimezone(e.target.value)}
                className="w-full rounded-lg bg-white/10 border border-white/20 px-4 py-2.5 text-[#eaeaf0] focus:outline-none focus:ring-2 focus:ring-[#ff9b6b]"
              >
                <option value="America/Los_Angeles">Pacific (PST/PDT)</option>
                <option value="America/Denver">Mountain (MST/MDT)</option>
                <option value="America/Chicago">Central (CST/CDT)</option>
                <option value="America/New_York">Eastern (EST/EDT)</option>
              </select>
            </div>

            {/* Active Days */}
            <div>
              <label className="block text-sm font-medium text-[#eaeaf0] mb-3">
                Active Days (leave empty for all days)
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { day: 0, label: 'Sun' },
                  { day: 1, label: 'Mon' },
                  { day: 2, label: 'Tue' },
                  { day: 3, label: 'Wed' },
                  { day: 4, label: 'Thu' },
                  { day: 5, label: 'Fri' },
                  { day: 6, label: 'Sat' },
                ].map(({ day, label }) => (
                  <button
                    key={day}
                    onClick={() => toggleEventDay(day)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      eventDays.includes(day)
                        ? 'bg-[#ff9b6b] text-[#0a0a0c]'
                        : 'bg-white/10 text-[#eaeaf0] hover:bg-white/20'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-[#eaeaf0]/50">
                {eventDays.length === 0 
                  ? 'Event active every day' 
                  : `Event active on: ${eventDays.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}`}
              </p>
            </div>
          </div>

          {/* Today's Attendance */}
          {todayAttendance && todayAttendance.totalRSVPs > 0 && (
            <div className="rounded-xl bg-white/5 border border-white/10 p-6">
              <h3 className="text-lg font-bold text-[#eaeaf0] mb-3">
                Today&apos;s RSVPs
              </h3>
              <p className="text-3xl font-bold text-[#ff9b6b] mb-2">
                {todayAttendance.totalRSVPs}
              </p>
              <p className="text-sm text-[#eaeaf0]/70">
                {todayAttendance.totalRSVPs === 1 ? 'person has' : 'people have'} indicated when they&apos;ll join today
              </p>
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveEventSettings}
              disabled={savingEvent}
              className="rounded-xl bg-[#ff9b6b] px-8 py-3 font-medium text-[#0a0a0c] hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {savingEvent ? 'Saving...' : 'Save Event Settings'}
            </button>
          </div>

          {/* Info Box */}
          <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 p-4">
            <p className="text-sm text-blue-300">
              <strong>How it works:</strong> When Event Mode is ON, users will be redirected to a wait page outside of event hours. 
              They can RSVP for specific time slots and see expected attendance. When the event window opens, they&apos;ll automatically get access to matchmaking.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

