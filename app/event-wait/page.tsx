'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { getSession } from '@/lib/session';
import { getEventSettings, getEventStatus, getUserRSVP, submitEventRSVP, getEventAttendance } from '@/lib/api';
import { AttendanceGraph } from '@/components/AttendanceGraph';
import { TimeSlotPicker } from '@/components/TimeSlotPicker';
import { connectSocket } from '@/lib/socket';

export default function EventWaitPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [attendance, setAttendance] = useState<Record<string, number>>({});
  const [selectedTime, setSelectedTime] = useState<string>('15:00:00'); // Default 3pm
  const [hasRSVP, setHasRSVP] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [timeUntilStart, setTimeUntilStart] = useState<string>('');
  const [countdown, setCountdown] = useState<{ hours: number; minutes: number; seconds: number } | null>(null);
  const [navigatingToRefilm, setNavigatingToRefilm] = useState(false);

  const session = getSession();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  useEffect(() => {
    if (!session) {
      router.push('/');
      return;
    }

    loadData();

    // REAL-TIME: Listen for event settings changes
    const socket = connectSocket(session.sessionToken);
    
    const handleSettingsChanged = (data: any) => {
      console.log('[EventWait] Event settings changed:', data);
      
      // Check if event mode was disabled or we can now access
      getEventStatus(session.sessionToken).then(status => {
        // If event mode is OFF or we have access, go to main
        if (!status.eventModeEnabled || status.canAccess) {
          console.log('[EventWait] Event mode OFF or event started! Redirecting to main...');
          router.push('/main');
        } else {
          // Still blocked - reload data
          loadData();
        }
      }).catch(err => {
        console.error('[EventWait] Status check failed:', err);
      });
    };
    
    socket.on('event:settings-changed', handleSettingsChanged);

    return () => {
      socket.off('event:settings-changed', handleSettingsChanged);
    };
  }, []); // Empty deps - only run once on mount

  const loadData = async () => {
    if (!session) return;

    try {
      setLoading(true);
      
      // Load event settings, status, and user's RSVP in parallel
      const [settingsData, statusData, rsvpData, attendanceData] = await Promise.all([
        getEventSettings(),
        getEventStatus(session.sessionToken),
        getUserRSVP(session.sessionToken, today),
        getEventAttendance(today),
      ]);

      setSettings(settingsData);
      setStatus(statusData);
      setAttendance(attendanceData.attendance || {});

      // If user already has RSVP, use that time
      if (rsvpData.hasRSVP) {
        setSelectedTime(rsvpData.rsvp.preferredTime);
        setHasRSVP(true);
      } else {
        // Default to event start time (3pm)
        setSelectedTime(settingsData.eventStartTime || '15:00:00');
      }

      // If user can access (VIP or event is active), redirect to main
      if (statusData.canAccess) {
        router.push('/main');
        return;
      }
    } catch (error) {
      console.error('[EventWait] Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate countdown to event start
  useEffect(() => {
    if (!settings) return;

    const updateCountdown = () => {
      const now = new Date();
      const [hours, minutes] = settings.eventStartTime.split(':').map(Number);
      
      const eventStart = new Date();
      eventStart.setHours(hours, minutes, 0, 0);
      
      // If event start has passed today, set to tomorrow
      if (now >= eventStart) {
        eventStart.setDate(eventStart.getDate() + 1);
      }
      
      const diff = eventStart.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeUntilStart('Event starting now!');
        setCountdown({ hours: 0, minutes: 0, seconds: 0 });
        // Reload status to check if event started
        getEventStatus(session?.sessionToken).then(s => {
          if (s.canAccess) {
            router.push('/main');
          }
        });
        return;
      }
      
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      
      setCountdown({ hours: h, minutes: m, seconds: s });
      
      if (h > 0) {
        setTimeUntilStart(`${h}h ${m}m`);
      } else {
        setTimeUntilStart(`${m}m ${s}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [settings, session, router]);

  const handleSubmitRSVP = async () => {
    if (!session) return;

    try {
      setSubmitting(true);
      await submitEventRSVP(session.sessionToken, selectedTime, today);
      setHasRSVP(true);
      
      // Reload attendance data
      const attendanceData = await getEventAttendance(today);
      setAttendance(attendanceData.attendance || {});
    } catch (error) {
      console.error('[EventWait] Failed to submit RSVP:', error);
      alert('Failed to save your time preference. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!session) {
      console.error('[EventWait] No session found');
      alert('Session not found. Please refresh the page.');
      return;
    }

    console.log('[EventWait] Button clicked - starting navigation to /refilm');
    console.log('[EventWait] Session token exists:', !!session.sessionToken);
    console.log('[EventWait] User ID:', session.userId?.substring(0, 8));
    
    setNavigatingToRefilm(true);
    
    try {
      console.log('[EventWait] Calling router.push...');
      // Use window.location as fallback if router.push doesn't work
      window.location.href = '/refilm';
    } catch (error) {
      console.error('[EventWait] Navigation error:', error);
      setNavigatingToRefilm(false);
      alert('Navigation failed. Please try again or refresh the page.');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="text-center">
          <div className="mb-4 text-4xl">⏳</div>
          <p className="text-[#eaeaf0]/70">Loading event info...</p>
        </div>
      </div>
    );
  }

  if (!settings || !status) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="text-center">
          <p className="text-[#eaeaf0]">Unable to load event information.</p>
          <button
            onClick={() => router.push('/main')}
            className="mt-4 rounded-xl bg-[#ff9b6b] px-6 py-2 text-sm font-medium text-[#0a0a0c] hover:opacity-90"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0c] py-8 px-4">
      <div className="container mx-auto max-w-3xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="mb-4 text-6xl">⏰</div>
          <h1 className="font-playfair text-4xl font-bold text-[#eaeaf0] mb-3">
            {settings.eventTitle || 'Event Mode Active'}
          </h1>
          <p className="text-[#eaeaf0]/70 text-lg">
            Matchmaking is only available during scheduled event hours
          </p>
        </motion.div>

        {/* Event Window Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl bg-gradient-to-r from-[#ff9b6b]/20 to-[#ff7a45]/20 border border-[#ff9b6b]/30 p-6 mb-6"
        >
          <div className="text-center">
            <p className="text-sm text-[#eaeaf0]/70 mb-2">Today&apos;s Event Window</p>
            <p className="font-playfair text-3xl font-bold text-[#ff9b6b] mb-1">
              {settings.eventStartTime.substring(0, 5)} - {settings.eventEndTime.substring(0, 5)}
            </p>
            <p className="text-sm text-[#eaeaf0]/70">
              {settings.timezone?.replace('America/', '')} Time
            </p>
          </div>
        </motion.div>

        {/* Countdown */}
        {countdown && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl bg-white/5 border border-white/10 p-8 mb-6"
          >
            <p className="text-center text-sm text-[#eaeaf0]/70 mb-4">Event starts in</p>
            <div className="flex justify-center gap-4">
              <div className="text-center">
                <div className="rounded-lg bg-white/5 px-6 py-4 min-w-[80px]">
                  <p className="font-playfair text-4xl font-bold text-[#ff9b6b]">
                    {String(countdown.hours).padStart(2, '0')}
                  </p>
                </div>
                <p className="mt-2 text-xs text-[#eaeaf0]/70">Hours</p>
              </div>
              <div className="text-center">
                <div className="rounded-lg bg-white/5 px-6 py-4 min-w-[80px]">
                  <p className="font-playfair text-4xl font-bold text-[#ff9b6b]">
                    {String(countdown.minutes).padStart(2, '0')}
                  </p>
                </div>
                <p className="mt-2 text-xs text-[#eaeaf0]/70">Minutes</p>
              </div>
              <div className="text-center">
                <div className="rounded-lg bg-white/5 px-6 py-4 min-w-[80px]">
                  <p className="font-playfair text-4xl font-bold text-[#ff9b6b]">
                    {String(countdown.seconds).padStart(2, '0')}
                  </p>
                </div>
                <p className="mt-2 text-xs text-[#eaeaf0]/70">Seconds</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* RSVP Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl bg-white/5 border border-white/10 p-6 mb-6"
        >
          <h2 className="text-xl font-bold text-[#eaeaf0] mb-4">
            When will you join today?
          </h2>
          <p className="text-sm text-[#eaeaf0]/70 mb-4">
            Let others know when you&apos;re planning to be online. You can update this anytime.
          </p>

          <TimeSlotPicker
            startTime={settings.eventStartTime}
            endTime={settings.eventEndTime}
            selectedTime={selectedTime}
            onChange={setSelectedTime}
          />

          <button
            onClick={handleSubmitRSVP}
            disabled={submitting}
            className="mt-4 w-full rounded-xl bg-[#ff9b6b] px-6 py-3 font-medium text-[#0a0a0c] hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? 'Saving...' : hasRSVP ? 'Update Time' : 'Save Time'}
          </button>

          {hasRSVP && (
            <p className="mt-3 text-center text-sm text-green-400">
              ✓ Your time preference has been saved
            </p>
          )}
        </motion.div>

        {/* Attendance Graph */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-6"
        >
          <AttendanceGraph
            attendance={attendance}
            startTime={settings.eventStartTime}
            endTime={settings.eventEndTime}
          />
        </motion.div>

        {/* Profile Update Options */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-xl bg-white/5 border border-white/10 p-6"
        >
          <h3 className="text-lg font-bold text-[#eaeaf0] mb-3">
            While You Wait...
          </h3>
          <p className="text-sm text-[#eaeaf0]/70 mb-4">
            Make sure your profile is ready for the event. Update your photo and intro video to make a great first impression!
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleUpdateProfile}
              disabled={navigatingToRefilm}
              className="flex-1 rounded-xl bg-[#ff9b6b] px-6 py-3 text-sm font-medium text-[#0a0a0c] hover:opacity-90 transition-all cursor-pointer active:scale-95 transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {navigatingToRefilm ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Opening...
                </span>
              ) : (
                'Update Photo & Video'
              )}
            </button>
          </div>
          <p className="mt-3 text-xs text-[#eaeaf0]/50 text-center">
            Note: Available for paid users and QR verified accounts
          </p>
        </motion.div>

        {/* Info Message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-6 text-center"
        >
          <p className="text-sm text-[#eaeaf0]/50">
            This page will automatically refresh when the event starts
          </p>
        </motion.div>
      </div>
    </main>
  );
}

