# SGM LIVE ATTENDANCE — Security Specification

## 1. Data Invariants
1. **Configurable Participant Login**: Unauthenticated participants may read active `/events/{eventId}` documents and create `/attendances/{attendanceId}` documents when `requireParticipantLogin` is false/unset; when an event sets `requireParticipantLogin: true`, participants must authenticate with a verified Google email matching `participantEmail`/`participantUid`. Participants may NEVER read, list, update, or delete any `/attendances` documents.
2. **Active Event Integrity**: An `/attendances` document cannot be created unless the referenced `eventId` exists in `/events/{eventId}`, has `status == 'active'`, and `eventName` matches the parent event's `title`.
3. **Consent Gate**: An `/attendances` submission is rejected unless `photoConsent == true`.
4. **Server Timestamp Enforcement**: `serverTimestamp` on `/attendances`, `createdAt`/`updatedAt` on `/events`, and `createdAt` on `/admins` must equal `request.time`.
5. **Admin-Only Management & Email Allowlist**: Only verified administrators (`email_verified == true` and either registered in `/authorizedAdmins/{emailLower}`, legacy `/admins/{uid}`, or the initial bootstrap owner `rohantmr.lover@gmail.com`) may create/update/delete events, view/export/edit attendance logs, or manage authorized administrators.
6. **Admin PII Isolation**: Ordinary authenticated Google users may only `get` their own `/authorizedAdmins/{theirLowercaseEmail}` document to verify eligibility and may NEVER `list` `/authorizedAdmins` or read other administrators' email addresses. Admins cannot delete their own active `/authorizedAdmins` entry.
7. **Size & Schema Guarding**: Strict `hasAll` and `hasOnly` key checks, string `.size()` bounds, numeric range bounds (`backgroundOpacity` 0..100, certificate element coordinates within A4 landscape `0..297` × `0..210` mm), regex ID/email guards, and bounded image data URLs (`photoDataUrl` <= 250,000, certificate background <= 340,000, PIC of Professional Development & Principal signatures <= 150,000 chars each).
8. **Admin-Only Certificate Studio & Dashboard Settings**: Only verified admins may read, list, create, update, or delete `/certificateSettings/{settingId}` and `/dashboardSettings/{settingId}`.
9. **Feedback & Evaluation Isolation**: Public participants may `get` `/feedbackConfigs/{configId}` (non-PII form definition) and `create` `/feedbackSubmissions/{submissionId}` only when the parent `/events/{eventId}` exists, `status == 'active'`, `feedbackActive != false`, and the submission falls within any configured `openTimestamp..closeTimestamp` schedule. Only verified admins may `get`, `list`, or `delete` `/feedbackSubmissions` or modify `/feedbackConfigs`. Supporting attachments (`/feedbackAttachments/{attachmentId}` and `/chunks/{chunkId}`) allow PDF, JPEG, MP4, and MOV up to 5 MB / 24 bounded chunks only when linked to an active event, open feedback window, and existing `feedbackSubmission`, with read/list/delete strictly restricted to verified admins.
10. **Recognition Certificates & Duplicate Prevention**: Only verified admins may manage `/recognitionCategories`, `/recognitionTemplates`, and `/certificates`, including Best Category Term 1–4 configuration and customizable PIC of Professional Development & Principal names/signatures. Generated certificates use deterministic document IDs keyed by `(eventId, categoryId, participant)` with `allow update: if false` to prevent duplicate issuance.
11. **Voice Announcement Settings Protection**: `/voiceSettings/{settingId}` stores non-PII voice announcement configuration (`enabled`, `engineMode`, `voiceId`, `language`, `speakingRate`, `volume`, templates). Clients may `get` `voiceSettings/default` for check-in receipt announcements, while `list`, `create`, `update`, and `delete` are strictly restricted to verified admins (`isAdmin()`).
12. **Admin-Only Live Board Settings**: `/liveBoardSettings/{settingId}` stores administrator animation, sizing, pagination, and projector display configuration; all `get`, `list`, `create`, `update`, and `delete` operations are strictly restricted to verified admins (`isAdmin()`).
13. **Primary Owner Device Control**: `/authorizedDevices/{deviceId}` stores cross-device authorization and revocation records; all `get`, `list`, `create`, `update`, and `delete` operations are strictly restricted to the verified Primary Owner (`rohantmr.lover@gmail.com`). Verification codes are generated, hashed, rate-limited, and verified exclusively server-side.

## 2. Dirty Dozen Adversarial Payloads
1. Unauthenticated read/list on `/attendances` -> PERMISSION_DENIED
2. Attendance submission with `photoConsent: false` -> PERMISSION_DENIED
3. Attendance submission referencing a non-existent `eventId` -> PERMISSION_DENIED
4. Attendance submission referencing a `closed` event -> PERMISSION_DENIED
5. Attendance submission with spoofed `eventName` not matching parent event -> PERMISSION_DENIED
6. Attendance submission with client-forged `serverTimestamp` != `request.time` -> PERMISSION_DENIED
7. Attendance submission with extra ghost field (`isVerified: true`) -> PERMISSION_DENIED
8. Attendance submission with oversized `photoDataUrl` (> 250,000 chars) or non-image data URL -> PERMISSION_DENIED
9. Unauthenticated or non-admin creation/modification of `/events/{eventId}` -> PERMISSION_DENIED
10. Admin login spoofing with `email_verified: false` -> PERMISSION_DENIED
11. Unauthenticated list of closed `/events` -> PERMISSION_DENIED
12. Update of `/attendances` trying to mutate `serverTimestamp` or `eventId` -> PERMISSION_DENIED
13. Ordinary signed-in Google user attempting to `list` `/authorizedAdmins` or `create` their own `/authorizedAdmins/{self}` document -> PERMISSION_DENIED
14. Ordinary signed-in Google user attempting to `get` another user's `/authorizedAdmins/{otherEmail}` document -> PERMISSION_DENIED
15. Unauthenticated attendance submission or spoofed `participantEmail` on an event with `requireParticipantLogin: true` -> PERMISSION_DENIED
16. Non-admin read or write on `/certificateSettings/{settingId}` or `/dashboardSettings/{settingId}` -> PERMISSION_DENIED
17. Out-of-bounds certificate coordinates (`x > 297`, `y < 0`) or invalid `themeId` -> PERMISSION_DENIED
18. Unauthenticated `list` or `get` on `/feedbackSubmissions` -> PERMISSION_DENIED
19. Feedback submission referencing a closed/non-existent event or forged `averageRating > 5` -> PERMISSION_DENIED
20. Non-admin creating or deleting `/recognitionCategories` or `/certificates` -> PERMISSION_DENIED
21. Non-admin modifying `/voiceSettings/default` or submitting out-of-range `speakingRate`/`volume` -> PERMISSION_DENIED
22. Non-admin reading/writing `/liveBoardSettings/default` or supplying invalid `animationDurationMs`/`manualColumns` -> PERMISSION_DENIED
23. Any non-owner (even a co-admin) reading, creating, revoking, or deleting `/authorizedDevices/{deviceId}` -> PERMISSION_DENIED
24. Unauthenticated `get` or `list` on `/feedbackAttachments` or `/feedbackAttachments/{attachmentId}/chunks`, or uploading disallowed MIME types/oversized chunks (> 5 MB / > 24 chunks) without a parent submission -> PERMISSION_DENIED
25. Feedback submission or attachment upload referencing an event whose `feedbackConfigs/{eventId}` has `feedbackActive: false` or is outside `openTimestamp..closeTimestamp` -> PERMISSION_DENIED

