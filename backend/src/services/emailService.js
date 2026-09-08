const nodemailer = require('nodemailer');
const { db } = require('../db');

class EmailService {
  getSmtpConfig() {
    const rows = db.prepare(`
      SELECT key, value FROM system_settings 
      WHERE key LIKE 'smtp_%'
    `).all();

    const config = {
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      user: '',
      pass: '',
      fromEmail: 'notifications@promptground.internal',
      fromName: 'PromptGround LLMOps'
    };

    rows.forEach(r => {
      if (r.key === 'smtp_host') config.host = r.value;
      if (r.key === 'smtp_port') config.port = parseInt(r.value, 10) || 587;
      if (r.key === 'smtp_secure') config.secure = r.value === 'true';
      if (r.key === 'smtp_user') config.user = r.value;
      if (r.key === 'smtp_pass') config.pass = r.value;
      if (r.key === 'smtp_from_email') config.fromEmail = r.value;
      if (r.key === 'smtp_from_name') config.fromName = r.value;
    });

    return config;
  }

  createTransporter(config) {
    const auth = (config.user || config.pass) ? {
      user: config.user,
      pass: config.pass
    } : undefined;

    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth,
      connectionTimeout: 4000
    });
  }

  async sendTestEmail(toEmail) {
    const config = this.getSmtpConfig();
    if (!toEmail) {
      throw new Error('Recipient email is required for test email');
    }

    // Check if configuration is placeholder
    const isPlaceholder = config.pass.includes('placeholder') || config.user.includes('placeholder');
    if (isPlaceholder) {
      return {
        success: true,
        message: `SMTP Test simulation passed: Message dispatch prepared for "${toEmail}" via ${config.host}:${config.port} from "${config.fromName} <${config.fromEmail}>" (Mock verification mode).`,
        simulated: true,
        recipient: toEmail
      };
    }

    try {
      const transporter = this.createTransporter(config);
      await transporter.verify();

      const info = await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: toEmail,
        subject: 'PromptGround SMTP Test Notification',
        text: 'This is a test notification confirming that PromptGround SMTP email dispatch is working correctly.',
        html: `
          <div style="font-family: sans-serif; padding: 20px; background: #0f121d; color: #f8fafc; border-radius: 8px;">
            <h2 style="color: #6366f1;">PromptGround Email Notification Test</h2>
            <p>Your SMTP integration has been verified successfully.</p>
            <p style="color: #94a3b8; font-size: 0.85rem;">Sent from PromptGround LLMOps Engine via ${config.host}:${config.port}</p>
          </div>
        `
      });

      return {
        success: true,
        messageId: info.messageId,
        message: `Test email successfully dispatched to ${toEmail}`
      };
    } catch (err) {
      throw new Error(`SMTP Dispatch Error: ${err.message}`);
    }
  }
}

module.exports = new EmailService();
