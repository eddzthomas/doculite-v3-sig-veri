# Information Architecture

**Status:** Draft for approval  
**Owner:** Design Lead

## Primary navigation

- **Documents:** search, filters, lists, bulk actions, upload, and saved views.
- **Signing:** signature-request list, request status, and creation flow for authorized users.
- **Administration:** product settings, integration health, trust-policy status, and handoff to Paperless administration for authorized operators.
- **Account:** profile and session actions.

## Document detail structure

1. Identity and actions: title, owner/permissions indicator, upload/download, and signing action when allowed.
2. Preview and metadata: Paperless-provided preview, tags, correspondent, type, dates, and notes.
3. Verification: latest status, last-checked time, report detail, reverify action, history.
4. Related signatures: source/completed relationships and signature-request history.
5. Activity: processing, verification, signing, and audit events appropriate to the viewer.

## Visibility rules

The product obtains documents only through Paperless APIs and displays an action only when the current user is authorized. External signers do not enter the DMS; they use their DocuSeal signing experience.

