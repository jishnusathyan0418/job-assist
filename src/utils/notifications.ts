import type { JobApplication, NotificationSettings } from '../types';

function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

export function buildMissingSkillAlertText(params: {
  company: string;
  roleTitle: string;
  atsScore: number;
  resumeTitle: string;
  missingSkills: string[];
}): string {
  const { company, roleTitle, atsScore, resumeTitle, missingSkills } = params;
  const skillsText = missingSkills.length > 0 ? missingSkills.join(', ') : 'None';
  return [
    `JobPulse Approval Required`,
    `Role: ${roleTitle} at ${company}`,
    `Resume Used: ${resumeTitle}`,
    `ATS Match Score: ${atsScore}%`,
    `Missing / Unverified Skills: ${skillsText}`,
    ``,
    `AI has held these skills out of your tailored resume bullets. Reply or open JobPulse to approve only skills you truly possess.`,
  ].join('\n');
}

export function buildWhatsAppLink(phone: string, text: string): string {
  const cleaned = sanitizePhone(phone);
  const encoded = encodeURIComponent(text);
  return cleaned ? `https://wa.me/${cleaned}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function buildMailtoLink(email: string, subject: string, body: string): string {
  const to = encodeURIComponent(email || '');
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildApplicationAlertLinks(
  app: JobApplication,
  resumeTitle: string,
  settings: NotificationSettings,
) {
  const pendingSkills = (app.skillApprovals || [])
    .filter((item) => item.decision === 'pending')
    .map((item) => item.skill);
  const skillsToReport = pendingSkills.length > 0 ? pendingSkills : app.missingSkills;

  const messageText = buildMissingSkillAlertText({
    company: app.company,
    roleTitle: app.roleTitle,
    atsScore: app.matchScore,
    resumeTitle,
    missingSkills: skillsToReport,
  });

  const subject = `[JobPulse] Human approval needed: ${app.company} — ${app.roleTitle} (${app.matchScore}% ATS)`;

  return {
    whatsappUrl: buildWhatsAppLink(settings.whatsappNumber, messageText),
    emailUrl: buildMailtoLink(settings.email, subject, messageText),
    pendingCount: pendingSkills.length,
  };
}
