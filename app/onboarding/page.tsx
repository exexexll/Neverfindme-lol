'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Container } from '@/components/Container';
import { createGuestAccount, uploadSelfie, uploadVideo, linkAccount, getReferralInfo } from '@/lib/api';
import { saveSession, getSession } from '@/lib/session';
import IntroductionComplete from '@/components/IntroductionComplete';
import { PasswordInput } from '@/components/PasswordInput';
import { compressImage } from '@/lib/imageCompression';

type Step = 'name' | 'selfie' | 'video' | 'permanent' | 'introduction';
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

  // Step 2: Selfie
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Step 3: Video
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Upload progress
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadProgress, setShowUploadProgress] = useState(false);

  // Step 4: Permanent
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordValid, setPasswordValid] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<string>('weak');
  
  // USC Email for admin QR codes
  const [uscEmail, setUscEmail] = useState('');
  const [needsUSCEmail, setNeedsUSCEmail] = useState(false);
  
  // Onboarding completion tracking
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  // Prevent tab closing/navigation during onboarding (un-bypassable)
  useEffect(() => {
    if (onboardingComplete) return; // Allow leaving after complete
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Prevent closing tab during onboarding
      e.preventDefault();
      const message = 'Your profile is not complete yet. Are you sure you want to leave?';
      e.returnValue = message;
      return e.returnValue;
    };
    
    // Prevent back button
    const handlePopState = (e: PopStateEvent) => {
      if (!onboardingComplete) {
        e.preventDefault();
        window.history.pushState(null, '', window.location.href);
        alert('Please complete your profile before navigating away.');
      }
    };
    
    // Add initial history entry to trap back button
    window.history.pushState(null, '', window.location.href);
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onboardingComplete]);
  
  // Check for referral code and invite code in URL
  useEffect(() => {
    const hasCheckedRef = { current: false };
    
    // CRITICAL FIX: Prevent infinite loop by only checking once
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;
    
    const ref = searchParams.get('ref');
    const invite = searchParams.get('inviteCode');
    
    // IMPORTANT: Extract invite code FIRST before any session checks
    // This ensures QR code links work even if user has an existing session
    if (invite) {
      setInviteCode(invite);
      console.log('[Onboarding] Invite code from URL:', invite);
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
          localStorage.removeItem('napalmsky_session');
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
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    
    // If USC email is needed and not provided, show error
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

    if (!agreedToTerms) {
      setError('You must agree to the Terms of Service, Privacy Policy, and Content Policy to continue');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Call API with USC email if provided
      const response = await createGuestAccount(
        name, 
        gender, 
        referralCode || undefined, 
        inviteCode || undefined,
        uscEmail || undefined // Pass USC email for admin code validation
      );
      setSessionToken(response.sessionToken);
      setUserId(response.userId);
      saveSession({
        sessionToken: response.sessionToken,
        userId: response.userId,
        accountType: response.accountType,
      });
      
      // If was referred, set target user for introduction screen later
      if (response.wasReferred) {
        console.log('[Onboarding] Successfully signed up via referral to', response.introducedTo);
        setTargetUser(response.targetUser);
        setTargetOnline(response.targetOnline);
      }
      
      // REVERTED: Payment check BEFORE profile (as originally designed)
      // Check if user needs to pay
      if (response.paidStatus === 'unpaid' && !response.inviteCodeUsed) {
        console.log('[Onboarding] User needs to pay - redirecting to paywall FIRST');
        sessionStorage.setItem('redirecting_to_paywall', 'true');
        // Store that we came from onboarding so paywall knows to return here
        sessionStorage.setItem('return_to_onboarding', 'true');
        router.push('/paywall');
        return;
      }
      
      // User is verified (invite code or will pay later) - proceed to profile
      console.log('[Onboarding] User verified or has code - proceeding to profile setup');
      setStep('selfie');
    } catch (err: any) {
      // Check if error is USC email requirement
      if (err.message?.includes('@usc.edu') || err.requiresUSCEmail) {
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
    } catch (err) {
      setError('Camera access denied. Please allow camera access to continue.');
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
      
      // Convert to blob
      canvas.toBlob(async (blob) => {
        if (blob) {
          setLoading(true);
          try {
            // PHASE 3: Advanced compression with WebP
            console.log('[Selfie] Original size:', (blob.size / 1024).toFixed(0), 'KB');
            
            const compressed = await compressImage(blob, 800, 800, 0.85);
            console.log('[Selfie] WebP compressed:',  (compressed.compressedSize / 1024).toFixed(0), 'KB',
                       `(${compressed.reductionPercent.toFixed(1)}% reduction)`);
            
            await uploadSelfie(sessionToken, compressed.blob);
            
            // Stop camera
            stream?.getTracks().forEach(track => track.stop());
            setStream(null);
            setStep('video');
          } catch (err: any) {
            setError(err.message);
          } finally {
            setLoading(false);
          }
        }
      }, 'image/jpeg', 0.95); // High quality for compression input
    }
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

  // Handle recorded video upload
  useEffect(() => {
    if (recordedChunks.length > 0 && !isRecording) {
      const blob = new Blob(recordedChunks, { 
        type: mediaRecorderRef.current?.mimeType || 'video/webm' 
      });

      console.log('[Onboarding] Video blob size:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
      
      // Check if referral user BEFORE upload to decide flow
      const storedRef = sessionStorage.getItem('onboarding_ref_code');
      const isReferralUser = targetUser || storedRef || referralCode;
      
      console.log('[Onboarding] Is referral user?', isReferralUser);
      console.log('[Onboarding] Has targetUser?', !!targetUser);
      
      setLoading(true);
      setUploadProgress(0);
      setShowUploadProgress(true); // Show immediately for better UX
      
      // OPTIMIZED: Use real progress tracking from XMLHttpRequest
      console.log('[Onboarding] 🎬 Starting video upload...');
      
      uploadVideo(sessionToken, blob, (percent) => {
        setUploadProgress(percent);
      })
        .then((data: any) => {
          console.log('[Onboarding] ✅ Video uploaded:', data.videoUrl);
          
          setUploadProgress(100);
          setTimeout(() => {
            setShowUploadProgress(false);
            setUploadProgress(0);
          }, 500);
          
          // Stop camera
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
          }
          
          // SIMPLE: Always go to permanent step for ALL users (referral same as normal)
          setStep('permanent');
          setLoading(false);
        })
        .catch((err) => {
          console.error('[Onboarding] Upload error:', err);
          setError(err.message);
          setStep('permanent');
          setLoading(false);
        });
    }
  }, [recordedChunks, isRecording, sessionToken, stream, targetUser, referralCode]); // Added missing dependencies

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
  const handleSkip = () => {
    // SIMPLIFIED: All users (referral or normal) go to main
    // Referral data is tracked in backend, will show "Introduced by X" badge in matchmaking
    console.log('[Onboarding] Skipping permanent account - going to main');
    setOnboardingComplete(true); // Mark complete to allow navigation
    router.push('/main');
  };

  /**
   * Introduction Screen: Direct match after onboarding
   */
  const handleCallTarget = () => {
    if (!targetUser) return;
    
    // Store target for direct navigation and auto-invite
    localStorage.setItem('napalmsky_direct_match_target', targetUser.userId);
    localStorage.setItem('napalmsky_auto_invite', 'true');
    
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

    // CRITICAL SECURITY: Validate password on frontend too
    if (!passwordValid) {
      setError('Please fix password errors before continuing');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await linkAccount(sessionToken, email, password);
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
      startCamera();
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
        <div className="fixed top-4 right-4 z-50 bg-black/90 backdrop-blur-md rounded-xl p-4 border border-[#ff9b6b]/30 shadow-2xl">
          <p className="text-sm text-[#eaeaf0] mb-2 font-medium">Uploading video...</p>
          <div className="w-48 h-2 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#ff9b6b] to-[#ff7b4b] transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-xs text-[#eaeaf0]/50 mt-1">{uploadProgress}%</p>
        </div>
      )}
      
      <Container>
        <div className="mx-auto max-w-2xl">
          <AnimatePresence mode="wait">
            {/* Step 1: Name + Gender */}
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
                  <div className="rounded-2xl border-2 border-[#ff9b6b]/30 bg-[#ff9b6b]/10 p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">💝</span>
                      <h3 className="font-playfair text-xl font-bold text-[#ff9b6b]">
                        Someone wants you to meet {referrerName || 'someone special'}!
                      </h3>
                    </div>
                    <p className="text-sm text-[#eaeaf0]/80">
                      After signup, click <span className="font-bold">Matchmake Now</span> to find {referrerName || 'them'} in the queue and call!
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
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#ff9b6b]"
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
                              ? 'bg-[#ff9b6b] text-[#0a0a0c]'
                              : 'bg-white/10 text-[#eaeaf0] hover:bg-white/20'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* USC Email (Only for Admin QR Codes) */}
                  {needsUSCEmail && (
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
                        className="mt-1 h-5 w-5 rounded border-white/20 bg-white/10 text-[#ff9b6b] 
                                 focus:ring-2 focus:ring-[#ff9b6b] focus:ring-offset-0"
                      />
                      <span className="text-sm text-[#eaeaf0]/80">
                        I have read and agree to the{' '}
                        <Link href="/terms-of-service" target="_blank" className="text-[#ff9b6b] hover:underline">
                          Terms of Service
                        </Link>
                        ,{' '}
                        <Link href="/privacy-policy" target="_blank" className="text-[#ff9b6b] hover:underline">
                          Privacy Policy
                        </Link>
                        , and{' '}
                        <Link href="/content-policy" target="_blank" className="text-[#ff9b6b] hover:underline">
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
                    className="focus-ring w-full rounded-xl bg-[#ff9b6b] px-6 py-3 font-medium text-[#0a0a0c] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? 'Creating account...' : 'Continue'}
                  </button>
                  
                  {/* Login link for existing users */}
                  <div className="text-center pt-4">
                    <p className="text-sm text-[#eaeaf0]/70">
                      Already have an account?{' '}
                      <Link 
                        href={referralCode ? `/login?ref=${referralCode}` : '/login'}
                        className="font-medium text-[#ff9b6b] hover:underline"
                      >
                        Login here
                      </Link>
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Selfie */}
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
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="h-full w-full object-contain"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                  </div>
                  <canvas ref={canvasRef} className="hidden" />

                  {error && (
                    <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={captureSelfie}
                    disabled={loading || !stream}
                    className="focus-ring w-full rounded-xl bg-[#ff9b6b] px-6 py-3 font-medium text-[#0a0a0c] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? 'Uploading...' : 'Capture selfie'}
                  </button>
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
                  </div>

                  {error && (
                    <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400">
                      {error}
                    </div>
                  )}

                  {!isRecording && recordedChunks.length === 0 && (
                    <button
                      onClick={startVideoRecording}
                      disabled={loading}
                      className="focus-ring w-full rounded-xl bg-[#ff9b6b] px-6 py-3 font-medium text-[#0a0a0c] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      Start recording
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
                        : 'Stop recording'}
                    </button>
                  )}
                  
                  {/* Skip Video Option - Can upload later from profile */}
                  {!isRecording && recordedChunks.length === 0 && !loading && (
                    <button
                      onClick={handleSkipVideo}
                      className="focus-ring w-full rounded-xl bg-white/10 px-6 py-3 font-medium text-[#eaeaf0] transition-all hover:bg-white/20"
                    >
                      Skip for now
                    </button>
                  )}

                  {loading && (
                    <div className="text-center text-sm text-[#eaeaf0]/70">
                      Uploading video...
                    </div>
                  )}
                  
                  {/* Helpful hint */}
                  {!isRecording && recordedChunks.length === 0 && !loading && (
                    <p className="text-xs text-center text-[#eaeaf0]/50">
                      You can upload an intro video later from your profile page
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Introduction Screen - REMOVED: Referral users follow normal flow now */}

            {/* Step 4: Make Permanent */}
            {step === 'permanent' && (
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

                <p className="text-lg text-[#eaeaf0]/70">
                  Link an email and password to save your account permanently. Or skip to continue as a guest.
                </p>

                <div className="space-y-6">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#eaeaf0]">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#ff9b6b]"
                      placeholder="your@email.com"
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
                      Skip for now
                    </button>
                    <button
                      onClick={handleMakePermanent}
                      disabled={loading}
                      className="focus-ring flex-1 rounded-xl bg-[#ff9b6b] px-6 py-3 font-medium text-[#0a0a0c] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {loading ? 'Saving...' : 'Make permanent'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
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

