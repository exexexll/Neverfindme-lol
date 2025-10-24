'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { PixelIcon } from './PixelIcons';

type IconType = 'football' | 'soccer' | 'music' | 'car' | 'game';

interface IconPair {
  id: number;
  type: IconType;
  left: { x: number; y: number };
  right: { x: number; y: number };
  leftVel: { x: number; y: number };
  rightVel: { x: number; y: number };
  merged: boolean;
  mergedPos?: { x: number; y: number };
  mergedVel?: { x: number; y: number };
  color: string;
}

export function MainPageIcons() {
  const [pairs, setPairs] = useState<IconPair[]>([]);
  const animRef = useRef<number>();
  
  useEffect(() => {
    const iconTypes: IconType[] = ['football', 'soccer', 'music', 'car', 'game'];
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7'];
    
    const newPairs: IconPair[] = iconTypes.map((type, i) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      const side1 = Math.floor(Math.random() * 4);
      const side2 = Math.floor(Math.random() * 4);
      
      let leftPos = { x: 0, y: 0 };
      let rightPos = { x: 0, y: 0 };
      let leftVel = { x: 0, y: 0 };
      let rightVel = { x: 0, y: 0 };
      
      if (side1 === 0) {
        leftPos = { x: Math.random() * w, y: -100 };
        leftVel = { x: (Math.random() - 0.5) * 2, y: Math.random() + 0.5 };
      } else if (side1 === 1) {
        leftPos = { x: w + 100, y: Math.random() * h };
        leftVel = { x: -(Math.random() + 0.5), y: (Math.random() - 0.5) * 2 };
      } else if (side1 === 2) {
        leftPos = { x: Math.random() * w, y: h + 100 };
        leftVel = { x: (Math.random() - 0.5) * 2, y: -(Math.random() + 0.5) };
      } else {
        leftPos = { x: -100, y: Math.random() * h };
        leftVel = { x: Math.random() + 0.5, y: (Math.random() - 0.5) * 2 };
      }
      
      if (side2 === 0) {
        rightPos = { x: Math.random() * w, y: -100 };
        rightVel = { x: (Math.random() - 0.5) * 2, y: Math.random() + 0.5 };
      } else if (side2 === 1) {
        rightPos = { x: w + 100, y: Math.random() * h };
        rightVel = { x: -(Math.random() + 0.5), y: (Math.random() - 0.5) * 2 };
      } else if (side2 === 2) {
        rightPos = { x: Math.random() * w, y: h + 100 };
        rightVel = { x: (Math.random() - 0.5) * 2, y: -(Math.random() + 0.5) };
      } else {
        rightPos = { x: -100, y: Math.random() * h };
        rightVel = { x: Math.random() + 0.5, y: (Math.random() - 0.5) * 2 };
      }
      
      return {
        id: i,
        type,
        left: leftPos,
        right: rightPos,
        leftVel,
        rightVel,
        merged: false,
        color: colors[i],
      };
    });
    
    setPairs(newPairs);
  }, []);

  useEffect(() => {
    if (pairs.length === 0) return;

    let lastTime = performance.now();
    
    const animate = (time: number) => {
      const delta = (time - lastTime) / 16.67;
      lastTime = time;
      
      setPairs(prev => prev.map(pair => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        
        if (pair.merged && pair.mergedPos && pair.mergedVel) {
          let x = pair.mergedPos.x + pair.mergedVel.x * delta;
          let y = pair.mergedPos.y + pair.mergedVel.y * delta;
          
          if (y < 0 || y > h - 60) pair.mergedVel.y *= -1;
          if (x < 0 || x > w - 60) pair.mergedVel.x *= -1;
          
          return { ...pair, mergedPos: { x, y } };
        }
        
        let lx = pair.left.x + pair.leftVel.x * delta;
        let ly = pair.left.y + pair.leftVel.y * delta;
        let rx = pair.right.x + pair.rightVel.x * delta;
        let ry = pair.right.y + pair.rightVel.y * delta;
        
        if (ly < 0 || ly > h - 60) pair.leftVel.y *= -1;
        if (lx < 0 || lx > w - 60) pair.leftVel.x *= -1;
        if (ry < 0 || ry > h - 60) pair.rightVel.y *= -1;
        if (rx < 0 || rx > w - 60) pair.rightVel.x *= -1;
        
        const dist = Math.sqrt(Math.pow(rx - lx, 2) + Math.pow(ry - ly, 2));
        
        if (dist < 50 && !pair.merged) {
          return {
            ...pair,
            merged: true,
            mergedPos: { x: (lx + rx) / 2, y: (ly + ry) / 2 },
            mergedVel: { x: (pair.leftVel.x + pair.rightVel.x) / 2, y: (pair.leftVel.y + pair.rightVel.y) / 2 },
          };
        }
        
        return { ...pair, left: { x: lx, y: ly }, right: { x: rx, y: ry } };
      }));
      
      animRef.current = requestAnimationFrame(animate);
    };
    
    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [pairs.length]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {pairs.map(pair => (
        <div key={pair.id}>
          {!pair.merged ? (
            <>
              <div style={{ position: 'absolute', left: pair.left.x, top: pair.left.y }}>
                <PixelIcon type={pair.type} half="left" color="#000000" />
              </div>
              <div style={{ position: 'absolute', left: pair.right.x, top: pair.right.y }}>
                <PixelIcon type={pair.type} half="right" color="#000000" />
              </div>
            </>
          ) : (
            <motion.div
              initial={{ scale: 0.5, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              style={{ position: 'absolute', left: pair.mergedPos!.x, top: pair.mergedPos!.y }}
            >
              <PixelIcon type={pair.type} half="complete" color={pair.color} />
            </motion.div>
          )}
        </div>
      ))}
    </div>
  );
}

