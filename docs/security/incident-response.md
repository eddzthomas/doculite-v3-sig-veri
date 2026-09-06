# Incident Response

**Status:** Draft for operations and security review  
**Owner:** Security lead and operations lead

## Scope

Use this procedure for suspected unauthorized access, malware, credential exposure, document loss, cross-customer exposure, webhook abuse, service compromise, or signature-verification integrity defects.

## Response procedure

1. **Detect and record:** create an incident record; capture time, reporter, affected customer, systems, evidence, and initial severity.
2. **Contain:** disable or rotate affected credentials, restrict compromised accounts, isolate affected service paths, and preserve logs and artifacts. Do not destroy evidence.
3. **Assess:** determine affected data, customers, documents, time range, attacker path, integrity impact, and whether verification/signing results require re-evaluation.
4. **Eradicate and recover:** remove the cause, patch or reconfigure, restore only from verified backups where needed, and validate authorization, document integrity, queues, and webhooks.
5. **Communicate:** security lead coordinates internal updates. Customer, regulator, insurer, and law-enforcement notifications require the designated business/legal authority; engineers provide factual evidence only.
6. **Learn:** publish a blameless post-incident review, corrective actions, owners, due dates, and threat-model/document updates.

## Severity and ownership

| Severity | Example | Initial owner | Escalation |
| --- | --- | --- | --- |
| Critical | confirmed cross-customer exposure, active compromise, widespread data loss | Incident commander | executive, legal, customer authority immediately |
| High | single-customer exposure, privileged compromise, verification defect affecting decisions | Security lead | operations and product leadership |
| Medium | contained service vulnerability, failed backup drill | Operations lead | security lead |
| Low | no-impact security event or policy deviation | Service owner | security lead in regular review |

## Required readiness

- Maintain current on-call contacts, customer escalation contacts, vendor contacts, runbook links, and access-revocation procedures.
- Practice at least one access-compromise and one restore incident annually.
- Keep incident evidence protected and access-controlled.

## Approval

Security and operations leads approve this runbook. Legal counsel approves notification decision procedures; this document does not set legal notification deadlines.
