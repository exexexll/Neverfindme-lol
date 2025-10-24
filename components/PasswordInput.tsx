'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (isValid: boolean, strength: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  showRequirements?: boolean;
}

export function PasswordInput({
  value,
  onChange,
  onValidationChange,
  placeholder = 'Choose a password',
  autoFocus = false,
  showRequirements = true,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [strength, setStrength] = useState<'weak' | 'medium' | 'strong'>('weak');
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [score, setScore] = useState(0);

  // Common passwords list
  const commonPasswords = [
    'password', '123456', '12345678', 'qwerty', 'abc123',
    'password123', 'admin', 'letmein', 'welcome'
  ];

  // Real-time password validation
  useEffect(() => {
    if (!value) {
      setStrength('weak');
      setErrors([]);
      setWarnings([]);
      setScore(0);
      onValidationChange?.(false, 'weak');
      return;
    }

    const newErrors: string[] = [];
    const newWarnings: string[] = [];
    let newScore = 0;

    // Minimum 6 characters (required)
    if (value.length < 6) {
      newErrors.push('Must be at least 6 characters');
    } else {
      newScore += 20;
    }

    // Recommended 8+ characters (NIST)
    if (value.length < 8 && value.length >= 6) {
      newWarnings.push('8+ characters recommended');
    } else if (value.length >= 8) {
      newScore += 20;
    }

    // Character diversity
    const hasLower = /[a-z]/.test(value);
    const hasUpper = /[A-Z]/.test(value);
    const hasNumber = /[0-9]/.test(value);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(value);

    if (hasLower) newScore += 10;
    if (hasUpper) newScore += 10;
    if (hasNumber) newScore += 10;
    if (hasSpecial) newScore += 10;

    // Length bonuses
    if (value.length >= 10) newScore += 10;
    if (value.length >= 12) newScore += 10;

    // Common password check
    const commonPasswords = [
      'password', '123456', '12345678', 'qwerty', 'abc123',
      'password123', 'admin', 'letmein', 'welcome'
    ];
    if (commonPasswords.includes(value.toLowerCase())) {
      newErrors.push('Too common - choose a unique password');
      newScore = Math.min(newScore, 20);
    }

    // Sequential characters
    if (/012|123|234|abc|bcd/.test(value.toLowerCase())) {
      newWarnings.push('Avoid sequential characters');
      newScore -= 5;
    }

    // Repeated characters
    if (/(.)\1{2,}/.test(value)) {
      newWarnings.push('Avoid repeating characters');
      newScore -= 5;
    }

    newScore = Math.max(0, Math.min(100, newScore));

    // Determine strength
    let newStrength: 'weak' | 'medium' | 'strong';
    if (newScore >= 70) {
      newStrength = 'strong';
    } else if (newScore >= 40) {
      newStrength = 'medium';
    } else {
      newStrength = 'weak';
    }

    setErrors(newErrors);
    setWarnings(newWarnings);
    setStrength(newStrength);
    setScore(newScore);

    // Notify parent
    const isValid = newErrors.length === 0;
    onValidationChange?.(isValid, newStrength);
  }, [value, onValidationChange]);

  return (
    <div className="space-y-3">
      {/* Password Input with Toggle */}
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full rounded-xl bg-white/10 px-4 py-3 pr-12 text-[#eaeaf0] placeholder-[#eaeaf0]/50 focus:outline-none focus:ring-2 focus:ring-[#fcf290]"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#eaeaf0]/50 hover:text-[#eaeaf0] transition-colors"
        >
          {showPassword ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      </div>

      {/* Strength Indicator */}
      {value && (
        <div className="space-y-2">
          {/* Strength Bar */}
          <div className="flex gap-1">
            <div className={`h-1.5 flex-1 rounded-full transition-colors ${
              score >= 25 ? 'bg-red-500' : 'bg-gray-600'
            }`} />
            <div className={`h-1.5 flex-1 rounded-full transition-colors ${
              score >= 50 ? 'bg-yellow-500' : 'bg-gray-600'
            }`} />
            <div className={`h-1.5 flex-1 rounded-full transition-colors ${
              score >= 75 ? 'bg-green-500' : 'bg-gray-600'
            }`} />
          </div>

          {/* Strength Label */}
          <div className="flex items-center justify-between">
            <p className="text-xs">
              Strength:{' '}
              <span className={`font-medium ${
                strength === 'strong' ? 'text-green-400' :
                strength === 'medium' ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {strength.charAt(0).toUpperCase() + strength.slice(1)}
              </span>
            </p>
            <p className="text-xs text-[#eaeaf0]/50">
              Score: {score}/100
            </p>
          </div>
        </div>
      )}

      {/* Errors */}
      <AnimatePresence>
        {errors.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-1"
          >
            {errors.map((error, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="text-xs text-red-400 flex items-center gap-1"
              >
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Warnings */}
      <AnimatePresence>
        {warnings.length > 0 && errors.length === 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-1"
          >
            {warnings.map((warning, i) => (
              <motion.li
                key={i}
                className="text-xs text-yellow-400 flex items-center gap-1"
              >
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {warning}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Requirements Checklist (Optional) */}
      {showRequirements && (
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-xs font-medium text-[#eaeaf0] mb-2">Password must have:</p>
          <ul className="space-y-1 text-xs">
            <li className={`flex items-center gap-2 ${
              value.length >= 6 ? 'text-green-400' : 'text-[#eaeaf0]/50'
            }`}>
              {value.length >= 6 ? '✓' : '○'} At least 6 characters
            </li>
            <li className={`flex items-center gap-2 ${
              value && errors.length === 0 ? 'text-green-400' : 'text-[#eaeaf0]/50'
            }`}>
              {value && errors.length === 0 ? '✓' : '○'} Not a common password
            </li>
          </ul>
          <p className="text-xs text-[#eaeaf0]/40 mt-2">Recommended:</p>
          <ul className="space-y-1 text-xs">
            <li className={`flex items-center gap-2 ${
              value.length >= 8 ? 'text-green-400' : 'text-[#eaeaf0]/40'
            }`}>
              {value.length >= 8 ? '✓' : '○'} 8+ characters
            </li>
            <li className={`flex items-center gap-2 ${
              /[A-Z]/.test(value) ? 'text-green-400' : 'text-[#eaeaf0]/40'
            }`}>
              {/[A-Z]/.test(value) ? '✓' : '○'} Uppercase letter
            </li>
            <li className={`flex items-center gap-2 ${
              /[0-9]/.test(value) ? 'text-green-400' : 'text-[#eaeaf0]/40'
            }`}>
              {/[0-9]/.test(value) ? '✓' : '○'} Number
            </li>
            <li className={`flex items-center gap-2 ${
              /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(value) ? 'text-green-400' : 'text-[#eaeaf0]/40'
            }`}>
              {/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(value) ? '✓' : '○'} Special character
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

