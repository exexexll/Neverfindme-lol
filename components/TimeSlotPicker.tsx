'use client';

import { useState } from 'react';

interface TimeSlotPickerProps {
  startTime: string; // '15:00:00'
  endTime: string;   // '18:00:00'
  selectedTime: string;
  onChange: (time: string) => void;
}

/**
 * Time Slot Picker Component
 * Generates 30-minute intervals between start and end time
 * Matches the app's theme with orange/coral accents
 */
export function TimeSlotPicker({ startTime, endTime, selectedTime, onChange }: TimeSlotPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Generate time slots in 30-minute intervals
  const generateTimeSlots = () => {
    const slots: string[] = [];
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    let currentHour = startHour;
    let currentMin = startMin;
    
    while (currentHour < endHour || (currentHour === endHour && currentMin <= endMin)) {
      const timeString = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}:00`;
      slots.push(timeString);
      
      // Add 30 minutes
      currentMin += 30;
      if (currentMin >= 60) {
        currentMin = 0;
        currentHour += 1;
      }
    }
    
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Format time for display (remove seconds)
  const formatTime = (time: string) => {
    const [hour, minute] = time.split(':');
    const h = parseInt(hour);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayHour}:${minute} ${ampm}`;
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-[#eaeaf0] mb-2">
        When will you join?
      </label>
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-left text-[#eaeaf0] hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[#fcf290]"
      >
        <div className="flex items-center justify-between">
          <span className="font-medium">
            {selectedTime ? formatTime(selectedTime) : 'Select a time'}
          </span>
          <svg
            className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="absolute z-10 mt-2 w-full rounded-xl bg-[#1a1a1c] border border-white/10 shadow-xl max-h-64 overflow-y-auto">
          {timeSlots.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => {
                onChange(slot);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3 text-left transition-colors ${
                slot === selectedTime
                  ? 'bg-[#fcf290] text-[#0a0a0c] font-medium'
                  : 'text-[#eaeaf0] hover:bg-white/5'
              }`}
            >
              {formatTime(slot)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

