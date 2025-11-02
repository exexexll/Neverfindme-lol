SOCIAL SHARING IN TEXT ROOM - DEBUG
====================================

Issue: Can't send socials in text chat

Current Code (app/text-room/[roomId]/page.tsx):
================================================

Line 1093: const userSocials = localStorage.getItem('bumpin_socials');
Line 1096: const socials = JSON.parse(userSocials);
Line 1100-1103: Check if any social is set
Line 1105-1108: socketRef.current.emit('room:giveSocial', { roomId, socials });

Potential Issues:
=================

1. localStorage.getItem returns null?
   - Socials not saved properly
   - Check: Does socials page actually save?
   - Line 102 in socials/page.tsx: localStorage.setItem('bumpin_socials', ...)
   - Keys match! ✅

2. JSON.parse fails?
   - Malformed JSON in localStorage
   - Would throw error, caught by try-catch
   - Alert would show

3. hasAnySocial check fails?
   - All socials are empty strings?
   - Line 1100: Object.values(socials).some(v => v && v.trim())
   - Alert: "No socials set"

4. Socket not connected?
   - Line 1090: if (!socketRef.current) return
   - Socket might not be initialized
   - No alert, just returns silently

5. Button doesn't exist?
   - Need to find where button is rendered
   - Check if onClick is attached

Let me find the button...
