import type { AttendanceRecord, FeedbackSubmissionRecord } from '../types';

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r?\n/g, ' ');
  const safe = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function exportAttendanceCsv(
  records: AttendanceRecord[],
  filenamePrefix: string
): void {
  const headers = [
    'Full Name',
    'Class / Department',
    'Participant Email',
    'Event Name',
    'Attendance Date',
    'Check-In Time',
    'Server Timestamp (ISO)',
    'Status',
    'Late Excuse',
    'Photo Consent',
  ];

  const rows = records.map((record) => {
    const serverIso = record.serverTimestamp?.toDate
      ? record.serverTimestamp.toDate().toISOString()
      : '';
    return [
      escapeCsvCell(record.fullName),
      escapeCsvCell(record.classDepartment),
      escapeCsvCell(record.participantEmail || ''),
      escapeCsvCell(record.eventName),
      escapeCsvCell(record.attendanceDate),
      escapeCsvCell(record.checkInTime),
      escapeCsvCell(serverIso),
      escapeCsvCell(record.status),
      escapeCsvCell(record.lateExcuse || ''),
      escapeCsvCell(record.photoConsent ? 'Granted' : 'No'),
    ].join(',');
  });

  const csvContent = `\uFEFF${[headers.join(','), ...rows].join('\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = filenamePrefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  link.href = url;
  link.setAttribute(
    'download',
    `${safeName || 'presenza-attendance'}-${new Date().toISOString().slice(0, 10)}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportFeedbackCsv(
  submissions: FeedbackSubmissionRecord[],
  filenamePrefix: string
): void {
  // Collect all distinct criterion labels across included submissions for clean tabular breakdown
  const criterionLabels: string[] = [];
  const seenLabels = new Set<string>();
  for (const sub of submissions) {
    for (const r of sub.ratings) {
      if (r.label && !seenLabels.has(r.label)) {
        seenLabels.add(r.label);
        criterionLabels.push(r.label);
      }
    }
  }

  const customPrompts: string[] = [];
  const seenPrompts = new Set<string>();
  for (const sub of submissions) {
    for (const ans of sub.customAnswers ?? []) {
      if (ans.prompt && !seenPrompts.has(ans.prompt)) {
        seenPrompts.add(ans.prompt);
        customPrompts.push(ans.prompt);
      }
    }
  }

  const headers = [
    'Event Title',
    'Event Date',
    'Location / Venue',
    'Facilitator / Speaker',
    'Session / Topic',
    'Participant Name',
    'Class / Department',
    'Participant Email',
    'Average Rating (1-5)',
    ...criterionLabels.map((lbl) => `Rating: ${lbl}`),
    'Positive Feedback Selected',
    'Improvement Suggestions Selected',
    'Written Comments & Recommendations',
    'Supporting Attachment',
    ...customPrompts.map((p) => `Question: ${p}`),
    'Submitted At (ISO)',
  ];

  const rows = submissions.map((sub) => {
    const serverIso = sub.serverTimestamp?.toDate
      ? sub.serverTimestamp.toDate().toISOString()
      : '';
    const ratingMap = new Map(sub.ratings.map((r) => [r.label, r.score]));
    const customAnswerMap = new Map(
      (sub.customAnswers ?? []).map((a) => [a.prompt, a.answer])
    );
    const positiveTexts = sub.selectedStatements
      .filter((s) => s.sentiment === 'positive')
      .map((s) => s.text)
      .join(' | ');
    const improvementTexts = sub.selectedStatements
      .filter((s) => s.sentiment === 'improvement')
      .map((s) => s.text)
      .join(' | ');
    const attachmentSummary = sub.attachment
      ? `${sub.attachment.fileName} (${sub.attachment.mimeType})`
      : '';

    return [
      escapeCsvCell(sub.eventTitle),
      escapeCsvCell(sub.eventDate),
      escapeCsvCell(sub.eventVenue),
      escapeCsvCell(sub.facilitatorName || ''),
      escapeCsvCell(sub.sessionTopic || ''),
      escapeCsvCell(sub.participantName || 'Anonymous'),
      escapeCsvCell(sub.participantDepartment || ''),
      escapeCsvCell(sub.participantEmail || ''),
      escapeCsvCell(sub.averageRating.toFixed(2)),
      ...criterionLabels.map((lbl) => {
        const val = ratingMap.get(lbl);
        return escapeCsvCell(typeof val === 'number' ? String(val) : '');
      }),
      escapeCsvCell(positiveTexts),
      escapeCsvCell(improvementTexts),
      escapeCsvCell(sub.writtenComment || ''),
      escapeCsvCell(attachmentSummary),
      ...customPrompts.map((p) => escapeCsvCell(customAnswerMap.get(p) || '')),
      escapeCsvCell(serverIso),
    ].join(',');
  });

  const csvContent = `\uFEFF${[headers.join(','), ...rows].join('\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = filenamePrefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  link.href = url;
  link.setAttribute(
    'download',
    `${safeName || 'presenza-feedback'}-${new Date().toISOString().slice(0, 10)}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
