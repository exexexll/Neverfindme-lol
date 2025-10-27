import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'everything@napalmsky.com';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  console.log('[Email] ✅ SendGrid configured');
  console.log('[Email] From email:', FROM_EMAIL);
} else {
  console.warn('[Email] ⚠️ SENDGRID_API_KEY not configured - emails will NOT send');
  console.warn('[Email] Set SENDGRID_API_KEY in Railway Variables tab');
}

export async function sendVerificationEmail(
  email: string,
  code: string,
  userName: string
): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    console.error('[Email] ❌ SENDGRID_API_KEY not set in environment variables');
    console.error('[Email] Set SENDGRID_API_KEY in Railway dashboard or .env file');
    console.error('[Email] See: SENDGRID-EMAIL-VERIFICATION-TUTORIAL.md');
    return false;
  }

  try {
    await sgMail.send({
      to: email,
      from: {
        email: FROM_EMAIL,
        name: 'BUMPIN'
      },
      subject: 'Verify your BUMPIN account',
      text: `Hi ${userName},\n\nYour verification code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you didn't request this, please ignore this email.\n\n- BUMPIN Team`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9f9f9;">
          <div style="background:white;border-radius:10px;padding:30px;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
            <h1 style="color:#ffc46a;text-align:center;margin-bottom:10px;">BUMPIN</h1>
            <h2 style="color:#333;text-align:center;margin-top:0;">Verify Your Email</h2>
            <p style="color:#666;font-size:16px;">Hi <strong>${userName}</strong>,</p>
            <p style="color:#666;font-size:16px;">Your verification code is:</p>
            <div style="background:linear-gradient(135deg,#ffc46a,#ff7b4b);padding:30px;text-align:center;margin:30px 0;border-radius:10px;">
              <div style="font-size:42px;font-weight:bold;letter-spacing:12px;color:white;text-shadow:2px 2px 4px rgba(0,0,0,0.2);">${code}</div>
            </div>
            <p style="color:#666;font-size:14px;">This code expires in <strong>15 minutes</strong>.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:30px 0;">
            <p style="color:#999;font-size:12px;text-align:center;">If you didn't request this, please ignore this email.</p>
            <p style="color:#999;font-size:12px;text-align:center;">- BUMPIN Team</p>
          </div>
        </div>
      `,
    });
    
    console.log(`[Email] ✅ Verification code sent to: ${email}`);
    return true;
  } catch (error: any) {
    console.error('[Email] ❌ SendGrid error:', error.message);
    if (error.response) {
      console.error('[Email] Response body:', JSON.stringify(error.response.body, null, 2));
    }
    return false;
  }
}

