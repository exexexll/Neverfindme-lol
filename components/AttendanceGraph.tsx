'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface AttendanceGraphProps {
  attendance: Record<string, number>; // { '15:00': 12, '15:30': 18, ... }
  startTime: string; // '15:00:00'
  endTime: string;   // '18:00:00'
}

/**
 * Attendance Bar Graph
 * Simple, elegant bar chart showing expected attendance per time slot
 * No external chart library needed - pure CSS/SVG for lightweight rendering
 */
export function AttendanceGraph({ attendance, startTime, endTime }: AttendanceGraphProps) {
  const [maxCount, setMaxCount] = useState(0);

  // Generate all time slots
  const generateTimeSlots = () => {
    const slots: string[] = [];
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    let currentHour = startHour;
    let currentMin = startMin;
    
    while (currentHour < endHour || (currentHour === endHour && currentMin <= endMin)) {
      const timeString = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;
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

  // Calculate max count for scaling
  useEffect(() => {
    const max = Math.max(...Object.values(attendance), 1);
    setMaxCount(max);
  }, [attendance]);

  // Format time for display
  const formatTime = (time: string) => {
    const [hour, minute] = time.split(':');
    const h = parseInt(hour);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayHour}:${minute}${ampm}`;
  };

  const totalRSVPs = Object.values(attendance).reduce((sum, count) => sum + count, 0);

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-6">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-[#eaeaf0]">Expected Attendance</h3>
        <p className="text-sm text-[#eaeaf0]/70">
          {totalRSVPs} {totalRSVPs === 1 ? 'person has' : 'people have'} RSVP&apos;d
        </p>
      </div>

      {totalRSVPs === 0 ? (
        <div className="text-center py-8">
          <p className="text-[#eaeaf0]/50 text-sm">No RSVPs yet. Be the first!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {timeSlots.map((slot, index) => {
            const count = attendance[slot] || 0;
            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;

            return (
              <motion.div
                key={slot}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-3"
              >
                {/* Time label */}
                <div className="w-16 text-right text-xs text-[#eaeaf0]/70 font-medium">
                  {formatTime(slot)}
                </div>

                {/* Bar */}
                <div className="flex-1 relative h-8 bg-white/5 rounded-lg overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.5, delay: index * 0.05 }}
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#fcf290] to-[#ff7a45] rounded-lg"
                  />
                  
                  {/* Count label inside bar */}
                  {count > 0 && (
                    <div className="absolute inset-0 flex items-center px-3">
                      <span className="text-xs font-bold text-white">
                        {count} {count === 1 ? 'person' : 'people'}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Peak time indicator */}
      {totalRSVPs > 0 && (() => {
        const peakTime = Object.entries(attendance).reduce((a, b) => 
          (attendance[a[0]] || 0) > (attendance[b[0]] || 0) ? a : b
        )[0];
        
        if (attendance[peakTime] > 0) {
          return (
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-xs text-[#eaeaf0]/70">
                <span className="text-[#fcf290] font-medium">Peak time:</span> {formatTime(peakTime)} with {attendance[peakTime]} {attendance[peakTime] === 1 ? 'person' : 'people'}
              </p>
            </div>
          );
        }
        return null;
      })()}
    </div>
  );
}

