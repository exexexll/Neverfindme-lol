'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Container } from '@/components/Container';
import { createGuestAccount, uploadSelfie, uploadVideo, linkAccount, getReferralInfo } from '@/lib/api';
import { saveSession, getSession } from '@/lib/session';
import { PasswordInput } from '@/components/PasswordInput';
import { EmailVerification } from '@/components/EmailVerification';
import { compressImage } from '@/lib/imageCompression';
import { USCWelcomePopup } from '@/components/usc-verification/USCWelcomePopup';
import { USCCardScanner } from '@/components/usc-verification/USCCardScanner';

type Step = 'usc-welcome' | 'usc-scan' | 'name' | 'email-verify' | 'selfie' | 'video' | 'permanent' | 'introduction';
type Gender = 'female' | 'male' | 'nonbinary' | 'unspecified';

function OnboardingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('unspecified');
  const [sessionToken, setSessionToken] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [targetUser, setTargetUser] = useState<any>(null);
  const [targetOnline, setTargetOnline] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null); // QR code from URL
  const [agreedToTerms, setAgreedToTerms] = useState(false); // Legal consent
  
  // USC Card verification
  const [uscId, setUscId] = useState<string | null>(null); // From card scan
  const [needsUSCCard, setNeedsUSCCard] = useState(false); // Admin QR requires card scan

  // Step 2: Selfie
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Step 3: Video
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  
  // Upload progress
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadProgress, setShowUploadProgress] = useState(false);

  // Step 4: Permanent
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordValid, setPasswordValid] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<string>('weak');
  const [showPermanentEmailVerify, setShowPermanentEmailVerify] = useState(false);
  
  // USC Email for admin QR codes
  const [uscEmail, setUscEmail] = useState('');
  const [needsUSCEmail, setNeedsUSCEmail] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  
  // Onboarding completion tracking
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  // CRITICAL: Load USC ID from sessionStorage into state
  useEffect(() => {
    const tempUscId = sessionStorage.getItem('temp_usc_id');
    if (tempUscId) {
      console.log('[Onboarding] Loading USC ID from sessionStorage:', '******' + tempUscId.slice(-4));
      setUscId(tempUscId);
    }
  }, []);

  // CRITICAL: Waitlist protection - require invite code or valid session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteParam = params.get('inviteCode');
    const session = getSession();
    const storedInvite = sessionStorage.getItem('onboarding_invite_code');
    const tempUsc = sessionStorage.getItem('temp_usc_id');
    const uscEmailForVerification = sessionStorage.getItem('usc_email_for_verification');
    
    // STRICT: Must have EITHER invite code OR valid verified session OR USC email for verification
    const hasInviteCode = inviteParam || storedInvite;
    const hasUscScan = tempUsc;
    const hasEmailToVerify = uscEmailForVerification;
    
    // If user has USC email to verify, set it up and trigger verification
    if (hasEmailToVerify && !hasInviteCode) {
      console.log('[Onboarding] USC email verification signup detected');
      setUscEmail(uscEmailForVerification);
      setNeedsUSCEmail(true);
      setStep('email-verify');
      return;
    }
    
    if (!hasInviteCode && !hasUscScan && !session && !hasEmailToVerify) {
      console.log('[Onboarding] BLOCKED - No access method found');
      console.log('[Onboarding] hasInviteCode:', hasInviteCode);
      console.log('[Onboarding] hasUscScan:', hasUscScan);
      console.log('[Onboarding] session:', !!session);
      console.log('[Onboarding] hasEmailToVerify:', hasEmailToVerify);
      console.log('[Onboarding] Redirecting to waitlist');
      router.push('/waitlist');
      return;
    }
    
    console.log('[Onboarding] ACCESS GRANTED');
    console.log('[Onboarding] Method:', hasInviteCode ? 'inviteCode' : hasUscScan ? 'uscScan' : hasEmailToVerify ? 'email' : 'session');
    
    // If has session but no invite code, verify session has access
    if (session && !hasInviteCode && !hasUscScan) {
      fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'}/payment/status`, {
        headers: { 'Authorization': `Bearer ${session.sessionToken}` },
      })
        .then(res => res.json())
        .then(data => {
          // CRITICAL: If email verification is pending, ALLOW access to complete it
          if (data.pendingEmail && !data.emailVerified) {
            console.log('[Onboarding] Pending email verification found - allowing access to complete');
            // Set the USC email and step to email-verify
            if (data.pendingEmail.endsWith('@usc.edu')) {
              setUscEmail(data.pendingEmail);
              setNeedsUSCEmail(true);
              setStep('email-verify');
            }
            return; // Stay on onboarding to complete verification
          }
          
          const hasAccess = data.paidStatus === 'paid' || 
                           data.paidStatus === 'qr_verified' || 
                           data.paidStatus === 'qr_grace_period';
          
          if (!hasAccess) {
            console.log('[Onboarding] Session exists but no access - redirecting to waitlist');
            router.push('/waitlist');
          }
        })
        .catch(() => {
          console.log('[Onboarding] Session verification failed - redirecting to waitlist');
          router.push('/waitlist');
        });
    }
  }, [router, setUscEmail, setNeedsUSCEmail, setStep]);

  // Prevent tab closing/navigation during onboarding (strengthened)
  useEffect(() => {
    if (onboardingComplete) return; // Allow leaving after complete
    
    // 1. Prevent tab close/refresh
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      const message = 'Your profile is not complete yet. Are you sure you want to leave?';
      e.returnValue = message;
      return e.returnValue;
    };
    
    // 2. Prevent back/forward navigation
    const handlePopState = (e: PopStateEvent) => {
      if (!onboardingComplete) {
        e.preventDefault();
        // Push state again to trap user
        window.history.pushState(null, '', window.location.href);
        alert('Please complete your profile before navigating away.');
      }
    };
    
    // 3. Intercept keyboard shortcuts (Backspace, Cmd+W, etc.)
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent Backspace navigation (but allow in input fields)
      if (e.key === 'Backspace' && 
          document.activeElement?.tagName !== 'INPUT' && 
          document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
      }
      
      // Prevent Cmd+W (close tab) - shows browser warning
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault();
        alert('Please complete your profile before closing.');
      }
    };
    
    // 4. Add multiple history entries to trap back button
    // (Makes it harder to escape by pressing back multiple times)
    window.history.pushState(null, '', window.location.href);
    window.history.pushState(null, '', window.location.href);
    window.history.pushState(null, '', window.location.href);
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);
    
    // 5. Continuous history trap (re-add every 500ms)
    const historyTrap = setInterval(() => {
      if (!onboardingComplete) {
        window.history.pushState(null, '', window.location.href);
      }
    }, 500);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
      clearInterval(historyTrap);
    };
  }, [onboardingComplete]);
  
  // Check for referral code and invite code in URL - RUN FIRST
  useEffect(() => {
    const ref = searchParams.get('ref');
    const invite = searchParams.get('inviteCode');
    
    console.log('[Onboarding] ===== URL PARAMS CHECK =====');
    console.log('[Onboarding] Full URL:', window.location.href);
    console.log('[Onboarding] ref:', ref);
    console.log('[Onboarding] inviteCode from URL:', invite);
    
    // IMPORTANT: Extract invite code FIRST before any session checks
    if (invite) {
      console.log('[Onboarding] ✅ Setting inviteCode state to:', invite);
      setInviteCode(invite);
      
      // Store in sessionStorage immediately
      sessionStorage.setItem('onboarding_invite_code', invite);
      
      // CRITICAL: Check if admin code SYNCHRONOUSLY by checking known format
      // Admin codes start with specific prefix (TCZIOIXWDZLEFQZC)
      const isAdminCode = invite.startsWith('TCZIOIXWDZLEFQZC');
      
      if (isAdminCode) {
        console.log('[Onboarding] ✅✅✅ ADMIN CODE DETECTED - Bypassing regular flow');
        console.log('[Onboarding] Setting step to usc-welcome IMMEDIATELY');
        setNeedsUSCCard(true);
        setNeedsUSCEmail(false);
        setStep('usc-welcome'); // Show USC welcome IMMEDIATELY
      } else {
        console.log('[Onboarding] Regular invite code - normal flow');
      }
      
      // Still validate in background for logging
      fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'}/payment/validate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: invite }),
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.valid) {
            console.log('[Onboarding] ✅ Code validated on server:', data.type);
          }
        })
        .catch(err => {
          console.error('[Onboarding] Validation error:', err);
        });
    }
    
    if (ref) {
      setReferralCode(ref);
      // Store in sessionStorage so we don't lose it across redirects
      sessionStorage.setItem('onboarding_ref_code', ref);
      console.log('[Onboarding] Referral code from URL:', ref);
    } else {
      // Check sessionStorage in case we lost URL params
      const storedRef = sessionStorage.getItem('onboarding_ref_code');
      if (storedRef) {
        setReferralCode(storedRef);
        console.log('[Onboarding] Referral code from sessionStorage:', storedRef);
      }
    }
    
    // Check if user is already registered (has session)
    const existingSession = getSession();
    
    // IMPORTANT: Validate session is actually valid before redirecting
    // (Server restart clears sessions, but localStorage still has old tokens)
    if (existingSession) {
      // CRITICAL FIX: If user has session AND referral/invite link, skip all onboarding!
      // Redirect directly to matchmaking with the target user
      if (ref || invite) {
        console.log('[Onboarding] Existing session with referral/invite - redirecting to matchmaking');
        // Go to main with query params to open matchmaking
        if (ref) {
          router.push(`/main?openMatchmaking=true&ref=${ref}`);
        } else {
          router.push('/main'); // Invite code users just go to main
        }
        return;
      }
      
      // No referral/invite - normal flow
      // Verify session is valid by checking with server
      fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'}/user/me`, {
        headers: { 'Authorization': `Bearer ${existingSession.sessionToken}` },
      })
        .then(res => res.json())
        .then(data => {
          // Check if profile is complete (has selfie AND video)
          const hasCompletedProfile = data.selfieUrl && data.videoUrl;
          
          // Check payment status (includes grace period users)
          const hasPaid = data.paidStatus === 'paid' || data.paidStatus === 'qr_verified' || data.paidStatus === 'qr_grace_period';
          
          if (hasCompletedProfile && hasPaid) {
            // Profile complete AND paid - redirect to main
            console.log('[Onboarding] Complete profile + paid - redirecting to main');
            router.push('/main');
          } else if (hasCompletedProfile && !hasPaid) {
            // Profile complete but NOT paid - redirect to paywall
            console.log('[Onboarding] Complete profile but unpaid - redirecting to paywall');
            sessionStorage.setItem('redirecting_to_paywall', 'true');
            router.push('/paywall');
          } else {
            // Profile incomplete - resume onboarding
            console.log('[Onboarding] Incomplete profile - resuming onboarding');
            setSessionToken(existingSession.sessionToken);
            setUserId(existingSession.userId);
            
            // Determine which step to resume from
            if (!data.selfieUrl) {
              console.log('[Onboarding] No selfie - starting from selfie step');
              setStep('selfie');
            } else if (!data.videoUrl) {
              console.log('[Onboarding] No video - starting from video step');
              setStep('video');
            } else {
              setStep('permanent');
            }
          }
        })
        .catch(err => {
          // Network error or session invalid - clear and allow onboarding
          console.log('[Onboarding] Session validation failed - clearing', err);
          localStorage.removeItem('bumpin_session');
        });
      return;
    }
    
    // User is NOT registered - proceed with signup flow
    // (inviteCode and referralCode already extracted above)
    
    // Fetch referral info if needed
    if (ref) {
      getReferralInfo(ref)
        .then(data => {
          setReferrerName(data.targetUserName); // The person you're being introduced to
          setTargetUser(data.targetUser); // Store target user for later
          console.log('[Onboarding] Being introduced to:', data.targetUserName, 'by', data.introducedBy);
        })
        .catch(err => {
          console.error('[Onboarding] Failed to fetch referral info:', err);
        });
    }
  }, [searchParams, router]);

  /**
   * Step 1: Name + Gender
   */
  const handleNameSubmit = async () => {
    console.log('[Onboarding] ===== SUBMITTING NAME/GENDER =====');
    console.log('[Onboarding] uscId state:', uscId);
    console.log('[Onboarding] temp_usc_id in sessionStorage:', sessionStorage.getItem('temp_usc_id'));
    console.log('[Onboarding] inviteCode state:', inviteCode);
    console.log('[Onboarding] Will call:', uscId ? '/auth/guest-usc' : '/auth/guest');
    
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    
    // CRITICAL: If USC card was scanned, SKIP all USC email checks
    if (!uscId) {
      // Only check USC email if NO card was scanned
    if (needsUSCEmail && !uscEmail.trim()) {
      setError('USC email is required for this QR code');
      return;
    }
    
    // Validate USC email format if provided
    if (needsUSCEmail && uscEmail.trim()) {
      if (!/^[^\s@]+@usc\.edu$/i.test(uscEmail.trim())) {
        setError('Please enter a valid @usc.edu email address');
        return;
        }
      }
    }

    if (!agreedToTerms) {
      setError('You must agree to the Terms of Service, Privacy Policy, and Content Policy to continue');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let response;
      
      // USC CARD PATH: Create guest account WITHOUT USC card (card saved later)
      const currentUscId = uscId || sessionStorage.getItem('temp_usc_id');
      console.log('[Onboarding] uscId state:', uscId);
      console.log('[Onboarding] sessionStorage temp_usc_id:', sessionStorage.getItem('temp_usc_id'));
      console.log('[Onboarding] currentUscId (combined):', currentUscId);
      
      if (currentUscId) {
        console.log('[Onboarding] ✅ USC CARD USER - Calling /auth/guest-usc');
        console.log('[Onboarding] DEBUG - name:', name, '| gender:', gender, '| uscId:', currentUscId?.slice(-4));
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'}/auth/guest-usc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            gender,
            inviteCode: inviteCode || undefined,
            // USC card will be saved later after onboarding complete
          }),
        });
        
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to create account');
        }
        
        response = await res.json();
        console.log('[Onboarding] ✅ USC guest account created, will link USC card after onboarding');
      } else {
        // NORMAL PATH: Call API with USC email if provided
        console.log('[Onboarding] ❌ NOT USC USER - Calling /auth/guest with inviteCode:', inviteCode);
        console.log('[Onboarding] Full params:', {
          name, gender,
          referralCode: referralCode || 'none',
          inviteCode: inviteCode || 'MISSING',
          uscEmail: uscEmail || 'none'
        });
        
        response = await createGuestAccount(
        name, 
        gender, 
        referralCode || undefined, 
        inviteCode || undefined,
        uscEmail || undefined // Pass USC email for admin code validation
      );
      }
      setSessionToken(response.sessionToken);
      setUserId(response.userId);
      
      // ALWAYS save session - needed for navigation
      saveSession({
        sessionToken: response.sessionToken,
        userId: response.userId,
        accountType: response.accountType,
      });
      console.log('[Onboarding] Session saved');
      
      // If was referred, set target user for introduction screen later
      if (response.wasReferred) {
        console.log('[Onboarding] Successfully signed up via referral to', response.introducedTo);
        setTargetUser(response.targetUser);
        setTargetOnline(response.targetOnline);
      }
      
      // CRITICAL: USC card users bypass paywall (admin QR code verified)
      // Check if user needs to pay (SKIP for USC card users)
      if (!uscId && response.paidStatus === 'unpaid' && !response.inviteCodeUsed) {
        console.log('[Onboarding] User needs to pay - redirecting to paywall');
        sessionStorage.setItem('redirecting_to_paywall', 'true');
        sessionStorage.setItem('return_to_onboarding', 'true');
        router.push('/paywall');
        return;
      }
      
      // USC card users already verified via admin QR
      if (uscId) {
        console.log('[Onboarding] USC card user - payment bypassed (admin QR verified)');
      }
      
      // SKIP EMAIL VERIFICATION if USC card was scanned
      if (uscId) {
        console.log('[Onboarding] USC card scanned - skipping email verification');
        setStep('selfie');
        return;
      }
      
      // NEW: If USC email was provided, verify it before proceeding
      if (needsUSCEmail && uscEmail && !emailVerified) {
        console.log('[Onboarding] USC email needs verification - moving to email-verify step');
        setStep('email-verify');
        return;
      }
      
      // User is verified (QR code or will pay later) - proceed to profile
      console.log('[Onboarding] Proceeding to profile setup');
      setStep('selfie');
    } catch (err: any) {
      // Check if error is USC email requirement (ONLY if no card was scanned)
      if (!uscId && (err.message?.includes('@usc.edu') || err.requiresUSCEmail)) {
        setNeedsUSCEmail(true);
        setError('This QR code requires a USC email address');
        return; // Stay on name step to collect email
      }
      
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Step 2: Selfie - Camera ONLY
   */
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user',
          aspectRatio: { ideal: 1 }, // Square aspect ratio for better full-face capture
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 640, ideal: 1280, max: 1920 },
        },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error('[Onboarding] Camera error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera permission in your browser settings, then click "Start camera" again.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found. Please connect a camera and try again.');
      } else {
        setError('Camera error: ' + (err.message || 'Unable to access camera'));
      }
    }
  };

  const captureSelfie = async () => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;

    // Capture at full camera resolution first
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      
      // Convert to data URL for preview
      const photoDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setCapturedPhoto(photoDataUrl);
      
      // Pause camera stream (don't stop yet, user might retake)
      if (stream) {
        stream.getTracks().forEach(track => track.enabled = false);
      }
    }
  };

  const confirmPhoto = async () => {
    if (!capturedPhoto || !canvasRef.current) return;
    
    setUploadingPhoto(true);
    setError('');
    
          try {
      // Convert canvas directly to blob (more reliable than data URL fetch)
      await new Promise<void>((resolve, reject) => {
        canvasRef.current?.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error('Failed to create image blob'));
            return;
          }
          
          try {
            console.log('[Selfie] Original size:', (blob.size / 1024).toFixed(0), 'KB');
            
            // Compress
            const compressed = await compressImage(blob, 800, 800, 0.85);
            console.log('[Selfie] WebP compressed:', (compressed.compressedSize / 1024).toFixed(0), 'KB',
                       `(${compressed.reductionPercent.toFixed(1)}% reduction)`);
            
            // Upload
            await uploadSelfie(sessionToken, compressed.blob);
            
            // Stop camera completely
            stream?.getTracks().forEach(track => track.stop());
            setStream(null);
            setCapturedPhoto(null);
            setStep('video');
            resolve();
          } catch (err: any) {
            reject(err);
          }
        }, 'image/jpeg', 0.95);
      });
    } catch (err: any) {
      console.error('[Selfie] Upload error:', err);
      setError(err.message || 'Failed to upload photo');
          } finally {
      setUploadingPhoto(false);
          }
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    // Stop old stream and restart camera completely
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    // Restart camera
    setTimeout(() => {
      startCamera();
    }, 100);
  };

  /**
   * Step 3: Video Recording (≤60s)
   */
  const startVideoRecording = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // OPTIMIZED: Use VP9 codec with low bitrate for faster uploads
      // VP9 is 40-60% smaller than VP8 at same quality
      // 1 Mbps = ~7.5 MB per 60s video (vs 20-30 MB default)
      let options: MediaRecorderOptions | undefined;
      
      // Try VP9 first (best compression)
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        options = {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 1000000,  // 1 Mbps (optimized for mobile)
          audioBitsPerSecond: 64000,    // 64 kbps (sufficient for voice)
        };
        console.log('[Video] Using VP9 codec at 1 Mbps');
      } 
      // Fallback to VP8 if VP9 not supported
      else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        options = {
          mimeType: 'video/webm;codecs=vp8',
          videoBitsPerSecond: 1500000,  // 1.5 Mbps for VP8
          audioBitsPerSecond: 64000,
        };
        console.log('[Video] Using VP8 codec at 1.5 Mbps');
      }
      // Final fallback to default (no bitrate control)
      else if (MediaRecorder.isTypeSupported('video/webm')) {
        options = {
          mimeType: 'video/webm',
        };
        console.warn('[Video] Using default WebM codec (no bitrate control)');
      }
      
      // Create MediaRecorder with or without options
      const mediaRecorder = options 
        ? new MediaRecorder(mediaStream, options)
        : new MediaRecorder(mediaStream);
      mediaRecorderRef.current = mediaRecorder;
      setRecordedChunks([]);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setRecordedChunks(prev => [...prev, event.data]);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // CRITICAL: Clear any existing timer first to prevent double-counting
      // (React Strict Mode can cause duplicate mounts in development)
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // Ensure no other intervals are running (defense in depth)
      const intervalId = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          if (newTime >= 60) {
            stopVideoRecording();
            return 60;
          }
          return newTime;
        });
      }, 1000);
      
      timerRef.current = intervalId;
    } catch (err) {
      setError('Camera/microphone access denied. Please allow access to continue.');
    }
  };

  const stopVideoRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    // CRITICAL FIX: Stop camera stream when recording stops
    if (stream) {
      console.log('[Onboarding] Stopping camera/mic after recording');
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  // Handle recorded video - Show preview instead of auto-upload
  useEffect(() => {
    if (recordedChunks.length > 0 && !isRecording) {
      const blob = new Blob(recordedChunks, { 
        type: mediaRecorderRef.current?.mimeType || 'video/webm' 
      });

      console.log('[Onboarding] Video recorded, size:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
      console.log('[Onboarding] Video type:', blob.type);
      
      // Create preview URL
      const previewUrl = URL.createObjectURL(blob);
      console.log('[Onboarding] Preview URL created:', previewUrl);
      setVideoPreviewUrl(previewUrl);
      
      // Ensure video element loads
      setTimeout(() => {
        if (videoPreviewRef.current) {
          console.log('[Onboarding] Video element ready, duration:', videoPreviewRef.current.duration);
          videoPreviewRef.current.load(); // Force reload
        }
      }, 100);
    }
  }, [recordedChunks, isRecording]);

  const confirmVideo = async () => {
    if (recordedChunks.length === 0) return;
    
    const blob = new Blob(recordedChunks, { 
      type: mediaRecorderRef.current?.mimeType || 'video/webm' 
    });
      
    setUploadingVideo(true);
      setUploadProgress(0);
    setShowUploadProgress(true);
      
    console.log('[Onboarding] 🎬 Uploading video...');
      
    try {
      const data: any = await uploadVideo(sessionToken, blob, (percent) => {
        setUploadProgress(percent);
      });
      
      console.log('[Onboarding] ✅ Video uploaded');
          
          setUploadProgress(100);
          setTimeout(() => {
            setShowUploadProgress(false);
            setUploadProgress(0);
          }, 500);
          
      // Clean up
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
        setVideoPreviewUrl(null);
          }
          
          setStep('permanent');
    } catch (err: any) {
          setError(err.message);
    } finally {
      setUploadingVideo(false);
    }
  };

  const retakeVideo = () => {
    setRecordedChunks([]);
    setRecordingTime(0);
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl(null);
    }
    // Camera already stopped, user will click record again
  };

  /**
   * Skip Video - Allow completing onboarding without video
   */
  const handleSkipVideo = () => {
    console.log('[Onboarding] User skipped video upload');
    
    // Stop camera if running
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    // Go to permanent step (can upload video later from /refilm)
    setStep('permanent');
  };
  
  /**
   * Step 4: Skip permanent account step - go to main
   */
  const handleSkip = async () => {
    // CRITICAL: Use sessionStorage as source of truth (state may be lost)
    const tempUscId = uscId || sessionStorage.getItem('temp_usc_id');
    const tempBarcode = sessionStorage.getItem('temp_usc_barcode');
    
    // Finalize USC card registration if card was scanned
    if (tempUscId) {
      try {
        console.log('[Onboarding] Finalizing USC card registration for:', '******' + tempUscId.slice(-4));
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'}/usc/finalize-registration`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            uscId: tempUscId,
            rawBarcodeValue: tempBarcode || tempUscId,
            barcodeFormat: 'CODABAR',
            userId,
          }),
        });
        
        if (!res.ok) {
          const errorData = await res.json();
          
          // If card already registered, show clear error and stop
          if (res.status === 409) {
            console.error('[Onboarding] ❌ USC card already registered');
            setError('This USC Card is already registered to another account. Each card can only be used once. Please contact support if this is an error.');
            setLoading(false);
            // Clean up to prevent loops
            sessionStorage.removeItem('temp_usc_id');
            sessionStorage.removeItem('temp_usc_barcode');
            sessionStorage.removeItem('onboarding_invite_code'); // Also clear invite to prevent loop
            return; // STOP - don't continue to main
          } else {
            throw new Error(errorData.error || 'Failed to register USC card');
          }
        } else {
          console.log('[Onboarding] ✅ USC card registered successfully to database');
          // NOW it's safe to store in sessionStorage (card is validated)
          sessionStorage.setItem('temp_usc_id', tempUscId);
          // Clean up temp barcode storage
          sessionStorage.removeItem('temp_usc_barcode');
        }
      } catch (err: any) {
        console.error('[Onboarding] USC card registration failed:', err);
        console.error('[Onboarding] Full error:', err.message);
        
        // Show error and stop (don't allow continuation)
        setError('Failed to register USC card: ' + err.message);
        setLoading(false);
        // Clean up to prevent loops
        sessionStorage.removeItem('temp_usc_id');
        sessionStorage.removeItem('temp_usc_barcode');  
        sessionStorage.removeItem('onboarding_invite_code');
        return;
      }
    }
    
    // Save session to localStorage now (profile is complete)
    if (sessionToken && userId) {
      console.log('[Onboarding] Saving session - profile complete');
      saveSession({
        sessionToken,
        userId,
        accountType: 'guest',
      });
    }
    
    setOnboardingComplete(true); // Mark complete to allow navigation
    router.push('/main');
  };

  /**
   * Introduction Screen: Direct match after onboarding
   */
  const handleCallTarget = () => {
    if (!targetUser) return;
    
    // Store target for direct navigation and auto-invite
    localStorage.setItem('bumpin_direct_match_target', targetUser.userId);
    localStorage.setItem('bumpin_auto_invite', 'true');
    
    setOnboardingComplete(true); // Mark complete to allow navigation
    // Navigate to main with matchmaking open
    router.push('/main?openMatchmaking=true&targetUser=' + targetUser.userId);
  };

  const handleSkipIntroduction = () => {
    setOnboardingComplete(true); // Mark complete to allow navigation
    router.push('/main');
  };

  const handleMakePermanent = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }
    
    // CRITICAL: USC card users MUST use @usc.edu email (admin QR requirement)
    const tempUscId = uscId || sessionStorage.getItem('temp_usc_id');
    if (tempUscId && !email.trim().toLowerCase().endsWith('@usc.edu')) {
      setError('USC card users must use @usc.edu email address for permanent account');
      return;
    }

    // CRITICAL SECURITY: Validate password on frontend too
    if (!passwordValid) {
      setError('Please fix password errors before continuing');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // CRITICAL: ALL users must verify email before making permanent
      // Step 1: Send verification code
      const sendRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'}/verification/send`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!sendRes.ok) {
        const error = await sendRes.json();
        throw new Error(error.error || 'Failed to send verification code');
      }

      // Step 2: Show email verification (using existing EmailVerification component)
      setShowPermanentEmailVerify(true);
      setLoading(false);
      return; // Wait for verification before proceeding
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code');
      setLoading(false);
    }
  };

  const handlePermanentEmailVerified = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Email is now verified, link password
      await linkAccount(sessionToken, email, password);
      
      // CRITICAL: Use sessionStorage as source of truth (state may be lost)
      const tempUscId = uscId || sessionStorage.getItem('temp_usc_id');
      const tempBarcode = sessionStorage.getItem('temp_usc_barcode');
      
      // Finalize USC card registration if card was scanned
      if (tempUscId) {
        try {
          console.log('[Onboarding] Finalizing USC card registration for:', '******' + tempUscId.slice(-4));
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'}/usc/finalize-registration`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({
              uscId: tempUscId,
              rawBarcodeValue: tempBarcode || tempUscId,
              barcodeFormat: 'CODABAR',
              userId,
            }),
          });
          
          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Failed to register USC card');
          }
          
          console.log('[Onboarding] USC card registered to database');
          // Clean up temp storage
          sessionStorage.removeItem('temp_usc_id');
          sessionStorage.removeItem('temp_usc_barcode');
        } catch (err: any) {
          console.error('[Onboarding] USC card registration failed:', err);
          alert('Warning: Failed to link USC card to account.');
        }
      }
      
      // Save session to localStorage (account is now permanent)
      console.log('[Onboarding] Saving permanent account session');
      saveSession({
        sessionToken,
        userId,
        accountType: 'permanent',
      });
      
      setOnboardingComplete(true); // Mark complete to allow navigation
      router.push('/main');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-start camera for selfie step and cleanup properly
  useEffect(() => {
    if (step === 'selfie') {
      // CRITICAL: Wait 500ms to ensure Quagga fully released camera
      const cameraTimeout = setTimeout(() => {
        console.log('[Onboarding] Starting selfie camera...');
      startCamera();
      }, 500);
      
      return () => clearTimeout(cameraTimeout);
    } else if (step !== 'video') {
      // Clean up camera when leaving selfie step (but not when moving to video)
      // This prevents multiple camera streams from being active
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
        console.log('[Onboarding] Cleaned up camera stream on step change');
      }
    }
    
    return () => {
      // Cleanup on unmount
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <main id="main" className="min-h-screen bg-[#0a0a0c] py-20">
      {/* Upload Progress Bar */}
      {showUploadProgress && (
        <div className="fixed top-4 right-4 z-50 bg-black/90 backdrop-blur-md rounded-xl p-4 border border-[#ffc46a]/30 shadow-2xl">
          <p className="text-sm text-[#eaeaf0] mb-2 font-medium">Uploading video...</p>
          <div className="w-48 h-2 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#ffc46a] to-[#ff7b4b] transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-xs text-[#eaeaf0]/50 mt-1">{uploadProgress}%</p>
        </div>
      )}
      
      <Container>
        <div className="mx-auto max-w-2xl">
          <AnimatePresence mode="wait">
            {/* Step 0: USC Welcome Popup (Admin QR Only) */}
            {step === 'usc-welcome' && (
              <USCWelcomePopup
                onContinue={() => setStep('usc-scan')}
              />
            )}

            {/* Step 1: USC Card Scanner (Admin QR Only) */}
            {step === 'usc-scan' && (
              <USCCardScanner
                onSuccess={(scannedUSCId, rawValue) => {
                  console.log('[Onboarding] ✅ USC Card scanned: ******' + scannedUSCId.slice(-4));
                  
                  // CRITICAL: Set all state immediately
                  setUscId(scannedUSCId);
                  setNeedsUSCEmail(false);
                  setNeedsUSCCard(false);
                  setUscEmail('');
                  
                  // CRITICAL FIX: DO NOT store in sessionStorage yet!
                  // Only store after successful registration to prevent loop
                  // If card is duplicate, we don't want it to persist
                  // Store barcode for later registration
                  sessionStorage.setItem('temp_usc_barcode', rawValue);
                  sessionStorage.setItem('usc_card_verified', 'true');
                  
                  // IMPORTANT: Keep scanned ID in component state only (not sessionStorage)
                  // This prevents reload loop if card is duplicate
                  
                  console.log('[Onboarding] ✅ STATE SET: uscId in memory only (not sessionStorage yet)');

                  setStep('name');
                }}
                onSkipToEmail={() => {
                  console.log('[Onboarding] User skipped card scanner - switching to email verification');
                  
                  // CRITICAL: Switch to email verification path
                  setNeedsUSCEmail(true);   // Email now REQUIRED
                  setNeedsUSCCard(false);   // No longer need card
                  setUscId(null);           // Clear USC ID
                  setUscEmail('');          // Clear email field
                  
                  // Clear all USC card temp data
                  sessionStorage.removeItem('temp_usc_id');
                  sessionStorage.removeItem('temp_usc_barcode');
                  sessionStorage.removeItem('usc_card_verified');
                  
                  console.log('[Onboarding] ✅ Email verification REQUIRED - needsUSCEmail=TRUE, uscId=NULL');
                  
                  setStep('name'); // Go to name page (email input will show)
                }}
              />
            )}

            {/* Step 2: Name + Gender */}
            {step === 'name' && (
              <motion.div
                key="name"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="space-y-8 motion-reduce:opacity-100 motion-reduce:translate-y-0"
              >
                {referralCode && (
                  <div className="rounded-2xl border-2 border-[#ffc46a]/30 bg-[#ffc46a]/10 p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">💝</span>
                      <h3 className="font-playfair text-xl font-bold text-[#ffc46a]">
                        Someone wants you to meet {referrerName || 'someone special'}!
                      </h3>
                    </div>
                    <p className="text-sm text-[#eaeaf0]/80">
                      After signup, click <span className="font-bold">Matchmake Now</span> to find {referrerName || 'them'} in the queue and call!
                    </p>
                  </div>
                )}
                
                {/* Guest Account Notice (USC Card Scan) */}
                {uscId && (
                  <div className="rounded-2xl border-2 border-yellow-500/30 bg-yellow-500/10 p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">⏰</span>
                      <h3 className="font-playfair text-xl font-bold text-yellow-300">
                        Guest Account - 7 Day Trial
                      </h3>
                    </div>
                    <p className="text-sm text-[#eaeaf0]/80">
                      Your account expires in 7 days. Add your USC email in Settings later to upgrade to a permanent account.
                    </p>
                  </div>
                )}
                
                <h1 className="font-playfair text-4xl font-bold text-[#eaeaf0] sm:text-5xl">
                  Let&apos;s get started
                </h1>

                <div className="space-y-6">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#eaeaf0]">
                      Your name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleNameSubmit()}
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#ffc46a]"
                      placeholder="Enter your name"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#eaeaf0]">
                      Gender
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['female', 'male', 'nonbinary', 'unspecified'] as Gender[]).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setGender(g)}
                          className={`focus-ring rounded-xl px-4 py-3 font-medium capitalize transition-all ${
                            gender === g
                              ? 'bg-[#ffc46a] text-[#0a0a0c]'
                              : 'bg-white/10 text-[#eaeaf0] hover:bg-white/20'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* USC Email (Only for Admin QR Codes WITHOUT card scan) */}
                  {needsUSCEmail && !uscId && !sessionStorage.getItem('usc_card_verified') && (
                    <div className="rounded-xl border-2 border-blue-500/30 bg-blue-500/10 p-4">
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="h-5 w-5 text-blue-300" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                          </svg>
                          <label className="text-sm font-medium text-blue-300">
                            USC Email Required
                          </label>
                        </div>
                        <input
                          type="email"
                          value={uscEmail}
                          onChange={(e) => setUscEmail(e.target.value)}
                          placeholder="your@usc.edu"
                          className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <p className="text-xs text-blue-200/80">
                        💡 This QR code is restricted to USC students. Enter your USC email to continue.
                      </p>
                    </div>
                  )}

                  {/* Legal Consent Checkbox */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                        className="mt-1 h-5 w-5 rounded border-white/20 bg-white/10 text-[#ffc46a] 
                                 focus:ring-2 focus:ring-[#ffc46a] focus:ring-offset-0"
                      />
                      <span className="text-sm text-[#eaeaf0]/80">
                        I have read and agree to the{' '}
                        <Link href="/terms-of-service" target="_blank" className="text-[#ffc46a] hover:underline">
                          Terms of Service
                        </Link>
                        ,{' '}
                        <Link href="/privacy-policy" target="_blank" className="text-[#ffc46a] hover:underline">
                          Privacy Policy
                        </Link>
                        , and{' '}
                        <Link href="/content-policy" target="_blank" className="text-[#ffc46a] hover:underline">
                          Content Policy
                        </Link>
                        . I confirm I am at least 18 years old.
                      </span>
                    </label>
                  </div>

                  {error && (
                    <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleNameSubmit}
                    disabled={loading || !agreedToTerms}
                    className="focus-ring w-full rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? 'Creating account...' : 'Continue'}
                  </button>
                  
                  {/* Login link for existing users */}
                  <div className="text-center pt-4">
                    <p className="text-sm text-[#eaeaf0]/70">
                      Already have an account?{' '}
                      <Link 
                        href={referralCode ? `/login?ref=${referralCode}` : '/login'}
                        className="font-medium text-[#ffc46a] hover:underline"
                      >
                        Login here
                      </Link>
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Email Verification (for USC admin codes) */}
            {step === 'email-verify' && (
              <motion.div
                key="email-verify"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="space-y-8 motion-reduce:opacity-100 motion-reduce:translate-y-0"
              >
                <h1 className="font-playfair text-4xl font-bold text-[#eaeaf0] sm:text-5xl">
                  Verify your USC email
                </h1>

                <p className="text-[#eaeaf0]/70">
                  We&apos;ll send a verification code to confirm your USC student status
                </p>

                <EmailVerification
                  sessionToken={sessionToken}
                  email={uscEmail}
                  onVerified={() => {
                    console.log('[Onboarding] USC email verified - proceeding to selfie');
                    setEmailVerified(true);
                    setStep('selfie');
                  }}
                />
              </motion.div>
            )}

            {/* Step 3: Selfie */}
            {step === 'selfie' && (
              <motion.div
                key="selfie"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="space-y-8 motion-reduce:opacity-100 motion-reduce:translate-y-0"
              >
                <h1 className="font-playfair text-4xl font-bold text-[#eaeaf0] sm:text-5xl">
                  Take a selfie
                </h1>

                <p className="text-[#eaeaf0]/70">
                  We need a photo to show your future matches
                </p>

                <div className="space-y-6">
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
                    {capturedPhoto ? (
                      // Show captured photo preview
                      <img
                        src={capturedPhoto}
                        alt="Captured selfie"
                        className="h-full w-full object-contain"
                        style={{ transform: 'scaleX(-1)' }}
                      />
                    ) : (
                      // Show live camera feed
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="h-full w-full object-contain"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                    )}
                  </div>
                  <canvas ref={canvasRef} className="hidden" />

                  {error && (
                    <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400">
                      {error}
                    </div>
                  )}

                  {/* Upload progress bar */}
                  {uploadingPhoto && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-[#eaeaf0]/70">
                        <span>Uploading photo...</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-[#ffc46a] transition-all duration-300 animate-pulse" style={{ width: '100%' }} />
                      </div>
                    </div>
                  )}

                  {capturedPhoto ? (
                    // Show confirm/retake buttons after capture
                    <div className="flex gap-4">
                      <button
                        onClick={retakePhoto}
                        disabled={uploadingPhoto}
                        className="focus-ring flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] hover:bg-white/20 transition-all disabled:opacity-50"
                      >
                        🔄 Retake
                      </button>
                      <button
                        onClick={confirmPhoto}
                        disabled={uploadingPhoto}
                        className="focus-ring flex-1 rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {uploadingPhoto ? 'Uploading...' : '✓ Confirm & Upload'}
                      </button>
                    </div>
                  ) : (
                    // Show capture button before taking photo
                  <button
                    onClick={captureSelfie}
                      disabled={!stream}
                    className="focus-ring w-full rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                      📸 Capture selfie
                  </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step 3: Video */}
            {step === 'video' && (
              <motion.div
                key="video"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="space-y-8 motion-reduce:opacity-100 motion-reduce:translate-y-0"
              >
                <h1 className="font-playfair text-4xl font-bold text-[#eaeaf0] sm:text-5xl">
                  Record intro video
                </h1>

                <p className="text-[#eaeaf0]/70">
                  Say something about yourself (up to 60 seconds)
                </p>

                <div className="space-y-6">
                  <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
                    {videoPreviewUrl ? (
                      // Show recorded video preview with controls
                      <video
                        key={videoPreviewUrl}
                        ref={videoPreviewRef}
                        src={videoPreviewUrl}
                        controls
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="auto"
                        className="h-full w-full object-contain bg-black"
                        style={{ display: 'block' }}
                        onLoadedMetadata={() => {
                          console.log('[Onboarding] Video preview loaded, duration:', videoPreviewRef.current?.duration);
                        }}
                        onLoadedData={() => {
                          console.log('[Onboarding] Video preview data loaded, playing...');
                        }}
                        onCanPlay={() => {
                          console.log('[Onboarding] Video preview can play');
                        }}
                        onError={(e) => {
                          console.error('[Onboarding] Video preview error:', e);
                          console.error('[Onboarding] Video src:', videoPreviewUrl);
                        }}
                      />
                    ) : (
                      // Show live camera feed
                      <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="h-full w-full object-contain"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                    {isRecording && (
                      <div className="absolute top-4 right-4 flex items-center gap-2 rounded-lg bg-black/50 px-3 py-2 backdrop-blur-sm">
                        <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
                        <span className="text-sm font-medium text-white">
                          {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')} / 1:00
                        </span>
                      </div>
                        )}
                      </>
                    )}
                  </div>

                  {error && (
                    <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400">
                      {error}
                    </div>
                  )}

                  {/* Upload progress bar */}
                  {showUploadProgress && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-[#eaeaf0]/70">
                        <span>Uploading video...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                        <div 
                          className="h-full bg-[#ffc46a] transition-all duration-300" 
                          style={{ width: `${uploadProgress}%` }} 
                        />
                      </div>
                    </div>
                  )}

                  {videoPreviewUrl ? (
                    // Show confirm/retake buttons after recording
                    <div className="space-y-4">
                      <p className="text-center text-sm text-[#eaeaf0]/70">
                        Watch your video above. Confirm to upload or retake if needed.
                      </p>
                      <div className="flex gap-4">
                        <button
                          onClick={retakeVideo}
                          disabled={uploadingVideo}
                          className="focus-ring flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] hover:bg-white/20 transition-all disabled:opacity-50"
                        >
                          🔄 Retake
                        </button>
                        <button
                          onClick={confirmVideo}
                          disabled={uploadingVideo}
                          className="focus-ring flex-1 rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {uploadingVideo ? 'Uploading...' : '✓ Confirm & Upload'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Show record/stop buttons
                    <>
                  {!isRecording && recordedChunks.length === 0 && (
                    <button
                      onClick={startVideoRecording}
                          disabled={uploadingVideo}
                      className="focus-ring w-full rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                          🎥 Start recording
                    </button>
                  )}

                  {isRecording && (
                    <button
                      onClick={stopVideoRecording}
                      disabled={recordingTime < 5}
                      className={`focus-ring w-full rounded-xl px-6 py-3 font-medium shadow-sm transition-opacity ${
                        recordingTime < 5 
                          ? 'bg-gray-500/50 text-gray-300 cursor-not-allowed opacity-50'
                          : 'bg-red-500 text-white hover:opacity-90'
                      }`}
                    >
                      {recordingTime < 5 
                        ? `Keep recording... (${5 - recordingTime}s minimum)` 
                            : '⏹ Stop recording'}
                    </button>
                  )}
                  
                      {/* Skip Video Option */}
                      {!isRecording && recordedChunks.length === 0 && !uploadingVideo && (
                        <>
                    <button
                      onClick={handleSkipVideo}
                      className="focus-ring w-full rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
                    >
                      Skip for now
                    </button>
                    <p className="text-xs text-center text-[#eaeaf0]/50">
                      You can upload an intro video later from your profile page
                    </p>
                        </>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            )}

            {/* Introduction Screen - REMOVED: Referral users follow normal flow now */}

            {/* Step 4: Make Permanent */}
            {step === 'permanent' && (() => {
              // DEBUG: Check if uscId is set
              console.log('[Onboarding/Permanent] uscId:', uscId, 'sessionStorage:', sessionStorage.getItem('temp_usc_id'));
              
              return (
              <motion.div
                key="permanent"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="space-y-8 motion-reduce:opacity-100 motion-reduce:translate-y-0"
              >
                <h1 className="font-playfair text-4xl font-bold text-[#eaeaf0] sm:text-5xl">
                  Make it permanent?
                </h1>

                {(uscId || sessionStorage.getItem('temp_usc_id')) ? (
                  <div className="space-y-4">
                    <p className="text-lg text-[#eaeaf0]/70">
                      Add your USC email to upgrade to a permanent account. Or skip to continue with your 7-day guest account.
                    </p>
                    <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 p-4">
                      <p className="text-sm text-blue-200">
                        ℹ️ Since you verified with your USC card, you must use your @usc.edu email address.
                      </p>
                    </div>
                  </div>
                ) : (
                <p className="text-lg text-[#eaeaf0]/70">
                  Link an email and password to save your account permanently. Or skip to continue as a guest.
                </p>
                )}

                <div className="space-y-6">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#eaeaf0]">
                      {(uscId || sessionStorage.getItem('temp_usc_id')) ? 'USC Email' : 'Email'}
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#ffc46a]"
                      placeholder={(uscId || sessionStorage.getItem('temp_usc_id')) ? "your@usc.edu" : "your@email.com"}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#eaeaf0]">
                      Password
                    </label>
                    <PasswordInput
                      value={password}
                      onChange={setPassword}
                      onValidationChange={(isValid, strength) => {
                        setPasswordValid(isValid);
                        setPasswordStrength(strength);
                      }}
                      placeholder="Choose a password"
                      showRequirements={true}
                    />
                  </div>

                  {/* Email Verification Step (if verification code was sent) */}
                  {showPermanentEmailVerify ? (
                    <div>
                      <h2 className="mb-4 text-2xl font-bold text-[#eaeaf0]">Verify Your Email</h2>
                      <p className="mb-6 text-[#eaeaf0]/70">
                        We sent a 6-digit code to <strong>{email}</strong>. Enter it below to complete your upgrade.
                      </p>
                      
                      <EmailVerification
                        sessionToken={sessionToken}
                        email={email}
                        onVerified={handlePermanentEmailVerified}
                      />
                    </div>
                  ) : (
                    <>
                  {error && (
                    <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400">
                      {error}
                    </div>
                  )}

                  <div className="flex gap-4">
                    <button
                      onClick={handleSkip}
                      className="focus-ring flex-1 rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
                    >
                          {(uscId || sessionStorage.getItem('temp_usc_id')) ? 'Continue as Guest (7 days)' : 'Skip for now'}
                    </button>
                    <button
                      onClick={handleMakePermanent}
                      disabled={loading}
                      className="focus-ring flex-1 rounded-xl bg-[#ffc46a] px-6 py-3 font-medium text-[#0a0a0c] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                          {loading ? 'Sending verification code...' : (uscId || sessionStorage.getItem('temp_usc_id')) ? 'Upgrade to Permanent' : 'Make permanent'}
                    </button>
                  </div>
                    </>
                  )}
                </div>
              </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>
      </Container>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0c]">
        <div className="text-center">
          <div className="mb-4 text-4xl">⏳</div>
          <p className="text-[#eaeaf0]/70">Loading...</p>
        </div>
      </div>
    }>
      <OnboardingPageContent />
    </Suspense>
  );
}

