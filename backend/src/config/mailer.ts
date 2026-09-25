import nodemailer, { Transporter, SentMessageInfo } from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let dynamicTransporter: Transporter | null = null;

export function createSmtpTransport(): Transporter {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
}

const isSmtp =
  process.env.MAIL_PROVIDER === 'smtp' ||
  Boolean(process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_USER.trim().length > 0);

export const transporter: Transporter = isSmtp
  ? createSmtpTransport()
  : nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: process.env.ETHEREAL_USER,
        pass: process.env.ETHEREAL_PASS,
      },
    });

export async function getTransporter(): Promise<Transporter> {
  if (isSmtp) {
    if (!dynamicTransporter) {
      dynamicTransporter = createSmtpTransport();
    }
    return dynamicTransporter;
  }

  const user = process.env.ETHEREAL_USER;
  const pass = process.env.ETHEREAL_PASS;

  const hasValidEnvCreds =
    user &&
    pass &&
    !user.includes('your-ethereal') &&
    user.trim().length > 0 &&
    pass.trim().length > 0;

  if (hasValidEnvCreds) {
    return transporter;
  }

  if (!dynamicTransporter) {
    try {
      const testAccount = await nodemailer.createTestAccount();
      dynamicTransporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    } catch (err) {
      return transporter;
    }
  }

  return dynamicTransporter;
}

export function getPreviewUrl(info: SentMessageInfo): string | false {
  return nodemailer.getTestMessageUrl(info);
}

export { nodemailer };
export default transporter;
