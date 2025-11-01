FORGOT PASSWORD ERROR ANALYSIS
===============================

Error: 500 Internal Server Error
Endpoint: POST /auth/forgot-password

Let me trace through the code:

Line 613: router.post('/forgot-password', async (req, res) => {
Line 614: const { email } = req.body;
Line 617-619: Validate email exists
Line 622: const user = await store.getUserByEmail(email.trim().toLowerCase());

Potential Issues:
=================

1. store.getUserByEmail might not exist?
   - Check: Does store export getUserByEmail method?
   - import { store } from './store' at line 6
   - Need to verify store.ts has this method

2. Email is hlyan@usc.edu
   - User exists in database
   - Should find user successfully
   - Unless getUserByEmail is broken?

3. SendGrid API key missing?
   - Line 648: sgMail.setApiKey(process.env.SENDGRID_API_KEY)
   - If key is undefined, would crash
   - Check Railway env variables

4. updateUser failing?
   - Line 642: await store.updateUser(user.userId, {...})
   - Might not have all those fields in database?
   - verification_code, verification_code_expires_at, verification_attempts

Need to check:
- Does store.getUserByEmail exist in store.ts?
- Does database have verification_code fields?
- Is SendGrid API key set in Railway?

Checking now...
