import type {
  OrganizationBranding,
  ParticipationLanguageFormat,
  ParticipationTemplateConfig,
} from '../types';
import {
  formatCertificateIssueDate,
  formatCertificateIssueDateIndonesian,
} from '../utils/dateTime';
import {
  DEFAULT_PARTICIPATION_TEMPLATE,
  formatEventLocation,
  interpolateRecognitionWording,
} from '../utils/feedbackAndRecognitionDefaults';

interface ParticipationCertificateCanvasProps {
  template: ParticipationTemplateConfig;
  branding?: OrganizationBranding | null;
  participantName: string;
  participantDepartment?: string;
  eventTitle: string;
  eventDate: string;
  eventVenue: string;
  eventTopic?: string;
  facilitators?: string;
  certificateNumber: string;
  issueDate: string;
  overrideLanguage?: ParticipationLanguageFormat;
  cityName?: string;
  overridePicPdName?: string;
  overridePicPdTitle?: string;
  overridePrincipalName?: string;
}

export default function ParticipationCertificateCanvas({
  template,
  branding,
  participantName,
  participantDepartment,
  eventTitle,
  eventDate,
  eventVenue,
  eventTopic,
  facilitators,
  certificateNumber,
  issueDate,
  overrideLanguage,
  cityName: cityNameOverride,
  overridePicPdName,
  overridePicPdTitle,
  overridePrincipalName,
}: ParticipationCertificateCanvasProps) {
  const lang: ParticipationLanguageFormat =
    overrideLanguage || template.languageFormat || 'bilingual';
  const organizerName =
    branding?.organizationName?.trim() || 'PRESENZA';
  const logoUrl =
    template.customLogoDataUrl || branding?.logoDataUrl || '';

  const dateSource = issueDate || eventDate;
  const formattedIssueEn = formatCertificateIssueDate(dateSource);
  const formattedIssueId = formatCertificateIssueDateIndonesian(dateSource);
  const formattedEventDateEn = formatCertificateIssueDate(
    eventDate || issueDate
  );
  const formattedEventDateId = formatCertificateIssueDateIndonesian(
    eventDate || issueDate
  );

  const cityName =
    cityNameOverride?.trim() || template.cityName?.trim() || 'Jakarta';
  const cityDateText =
    lang === 'bahasa'
      ? `${cityName}, ${formattedIssueId}`
      : `${cityName}, ${formattedIssueEn}`;

  const resolvedPicPdName =
    overridePicPdName?.trim() || template.picPdName.trim();
  const resolvedPicPdTitle =
    overridePicPdTitle?.trim() ||
    template.picPdTitle.trim() ||
    'PIC of Professional Development';
  const resolvedPrincipalName =
    overridePrincipalName?.trim() || template.principalName.trim();
  const resolvedVenueLabel =
    formatEventLocation(eventVenue, cityName) || eventVenue;

  const wordingEn = interpolateRecognitionWording(
    template.wordingEn || DEFAULT_PARTICIPATION_TEMPLATE.wordingEn,
    {
      participant: participantName,
      category: 'Participant',
      event: eventTitle,
      date: formattedEventDateEn,
      venue: resolvedVenueLabel,
      topic: eventTopic,
      facilitator: resolvedPicPdName || facilitators,
      organizer: organizerName,
      department: participantDepartment,
    }
  );

  const wordingId = interpolateRecognitionWording(
    template.wordingId || DEFAULT_PARTICIPATION_TEMPLATE.wordingId,
    {
      participant: participantName,
      category: 'Peserta',
      event: eventTitle,
      date: formattedEventDateId,
      venue: resolvedVenueLabel,
      topic: eventTopic,
      facilitator: resolvedPicPdName || facilitators,
      organizer: organizerName,
      department: participantDepartment,
    }
  );

  const topicDisplay =
    template.showTopic && eventTopic?.trim() ? eventTopic.trim() : '';

  const certLabel =
    lang === 'bahasa'
      ? 'No. Sertifikat'
      : lang === 'bilingual'
      ? 'No'
      : 'Certificate No';
  const issuedLabel =
    lang === 'bahasa'
      ? 'Diterbitkan'
      : lang === 'bilingual'
      ? 'Issued / Diterbitkan'
      : 'Issued';
  const issuedValue = lang === 'bahasa' ? formattedIssueId : formattedIssueEn;

  return (
    <div
      className={`w-full shadow-lg rounded-sm relative overflow-hidden flex flex-col justify-between px-5 py-3.5 sm:px-6 sm:py-4 text-center transition-all mx-auto ${
        template.orientation === 'portrait'
          ? 'max-w-[440px] aspect-[210/297]'
          : 'max-w-[680px] aspect-[297/210]'
      }`}
      style={{
        backgroundColor: template.paperColor,
        border: `4px solid ${template.primaryColor}`,
        fontFamily:
          template.fontFamily === 'times'
            ? 'Georgia, "Times New Roman", serif'
            : template.fontFamily === 'courier'
            ? 'ui-monospace, monospace'
            : 'system-ui, sans-serif',
      }}
    >
      {template.backgroundDataUrl && template.backgroundOpacity > 0 && (
        <div className="absolute inset-2 overflow-hidden pointer-events-none">
          <img
            src={template.backgroundDataUrl}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover"
            style={{
              opacity: Math.min(1, Math.max(0, template.backgroundOpacity / 100)),
            }}
          />
        </div>
      )}

      <div
        className="absolute inset-2 pointer-events-none"
        style={{ border: `1.5px solid ${template.accentColor}` }}
      />

      {/* Top Header */}
      <div className="relative z-10 w-full flex flex-col items-center">
        {template.showCertificateId && (
          <div className="w-full flex items-center justify-between gap-2 text-[9px] sm:text-[10px] text-slate-600 px-1 pb-0.5">
            <span className="font-mono-tabular font-semibold truncate">
              {certLabel}: {certificateNumber}
            </span>
            <span className="font-semibold whitespace-nowrap shrink-0">
              {issuedLabel}: {issuedValue}
            </span>
          </div>
        )}

        <div className="flex flex-col items-center space-y-0.5 pt-0.5">
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Organization logo"
              className="h-6 w-6 sm:h-7 sm:w-7 object-contain"
            />
          )}
          <div
            className="text-[9px] sm:text-[10px] font-bold tracking-widest uppercase leading-tight"
            style={{ color: template.accentColor }}
          >
            {organizerName}
          </div>

          {lang === 'bilingual' ? (
            <>
              <h4
                className="text-base sm:text-lg font-bold tracking-tight leading-tight"
                style={{ color: template.primaryColor }}
              >
                {template.titleEn}
              </h4>
              <div
                className="text-[11px] sm:text-xs font-bold italic tracking-wide leading-tight"
                style={{ color: template.accentColor }}
              >
                {template.titleId}
              </div>
              {(template.subtitleEn.trim() || template.subtitleId.trim()) && (
                <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-slate-500 leading-tight max-w-lg">
                  {[template.subtitleEn.trim(), template.subtitleId.trim()]
                    .filter(Boolean)
                    .join(' / ')}
                </p>
              )}
            </>
          ) : (
            <>
              <h4
                className="text-lg sm:text-xl font-bold tracking-tight leading-tight"
                style={{ color: template.primaryColor }}
              >
                {lang === 'bahasa' ? template.titleId : template.titleEn}
              </h4>
              {(lang === 'bahasa'
                ? template.subtitleId
                : template.subtitleEn
              ).trim() && (
                <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-500 leading-tight">
                  {lang === 'bahasa'
                    ? template.subtitleId
                    : template.subtitleEn}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Center Content */}
      <div className="relative z-10 my-auto py-1 space-y-1">
        <p className="text-[9.5px] sm:text-[10.5px] text-slate-500">
          {lang === 'bahasa'
            ? 'Dengan bangga sertifikat ini diberikan kepada'
            : lang === 'english'
            ? 'This certificate is proudly presented to'
            : 'This certificate is proudly presented to · Dengan bangga diberikan kepada'}
        </p>
        <div
          className="text-lg sm:text-2xl font-bold leading-tight"
          style={{ color: template.primaryColor }}
        >
          {participantName}
        </div>
        {participantDepartment?.trim() && (
          <div
            className="text-[10px] sm:text-[11px] font-bold leading-tight"
            style={{ color: template.accentColor }}
          >
            {participantDepartment}
          </div>
        )}
        <div className="w-36 h-px bg-slate-300 mx-auto" />

        {lang === 'bilingual' ? (
          <div className="space-y-1 max-w-lg mx-auto">
            <p className="text-[10px] sm:text-[11px] text-slate-800 leading-snug">
              {wordingEn}
            </p>
            <p className="text-[9.5px] sm:text-[10.5px] italic text-slate-600 leading-snug">
              {wordingId}
            </p>
          </div>
        ) : (
          <p className="text-[11px] sm:text-xs text-slate-700 leading-snug max-w-lg mx-auto">
            {lang === 'bahasa' ? wordingId : wordingEn}
          </p>
        )}

        {topicDisplay && (
          <div
            className="text-[9.5px] sm:text-[10.5px] font-bold pt-0.5"
            style={{ color: template.primaryColor }}
          >
            {lang === 'bahasa'
              ? `Topik: ${topicDisplay}`
              : lang === 'bilingual'
              ? `Topic / Topik: ${topicDisplay}`
              : `Topic: ${topicDisplay}`}
          </div>
        )}
      </div>

      {/* Bottom Signatories */}
      <div className="relative z-10 pb-1">
        <div className="grid grid-cols-2 gap-6 sm:gap-10 items-end text-[9px] sm:text-[10px] max-w-lg mx-auto">
          <div className="flex flex-col items-center justify-end">
            <div className="h-6 sm:h-7 flex items-end justify-center w-full mb-0.5">
              {template.picPdSignatureDataUrl && (
                <img
                  src={template.picPdSignatureDataUrl}
                  alt="PIC of Professional Development signature"
                  className="max-h-6 sm:max-h-7 object-contain"
                />
              )}
            </div>
            {resolvedPicPdName && (
              <div
                className="font-bold pb-0.5 truncate max-w-full leading-tight"
                style={{ color: template.primaryColor }}
              >
                {resolvedPicPdName}
              </div>
            )}
            <div className="w-full border-t border-slate-300 pt-0.5 text-slate-600 font-medium truncate">
              {resolvedPicPdTitle}
            </div>
          </div>

          <div className="flex flex-col items-center justify-end">
            <div className="text-[9px] sm:text-[10px] text-slate-700 mb-0.5 whitespace-nowrap leading-tight">
              {cityDateText}
            </div>
            <div className="h-6 sm:h-7 flex items-end justify-center w-full mb-0.5">
              {template.principalSignatureDataUrl && (
                <img
                  src={template.principalSignatureDataUrl}
                  alt="Principal signature"
                  className="max-h-6 sm:max-h-7 object-contain"
                />
              )}
            </div>
            {resolvedPrincipalName && (
              <div
                className="font-bold pb-0.5 truncate max-w-full leading-tight"
                style={{ color: template.primaryColor }}
              >
                {resolvedPrincipalName}
              </div>
            )}
            <div className="w-full border-t border-slate-300 pt-0.5 text-slate-600 font-medium truncate">
              {template.principalTitle.trim() || 'Principal'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
