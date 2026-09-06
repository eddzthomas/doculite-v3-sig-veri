# DocuSeal Integration Contract

**Status:** Draft; requires pinned-release and licensing verification  
**Owner:** Architecture team  
**Applies to:** V1

## Boundary

DocuSeal is a separately deployed signing service. The product creates and observes signing work through the approved DocuSeal API and handles webhook notifications through the product API. It does not access DocuSeal's database or persistent storage directly.

## Required capabilities to verify

| Product need | Required DocuSeal capability | Gate |
|---|---|---|
| Create signing workflow | Template/submission creation with document and recipients | Pinned API fixture |
| Present signing | Supported hosted or commercially licensed embedded flow | License and browser-flow verification |
| Track request | Submission status and recipient progress | Contract fixture and reconciliation test |
| Retrieve completed PDF | Authoritative completed-document retrieval | Hash and import fixture |
| Receive completion | Authenticated webhook/event support | Replay and duplicate delivery test |
| Verify PDF signatures | Supported verification interface or isolated compatibility adapter | Fixture suite and upgrade contract test |

## Verification adapter

The product normalizes any DocuSeal verification output into the product verification model. It records the DocuSeal version, adapter version, policy version, input hash, raw response reference, and errors. If the chosen verification interface is undocumented or not committed as a stable public API in the pinned release, it is classified as experimental: use an adapter, fixture tests, feature flag, and explicit upgrade approval.

## Commercial and attribution gate

Whether hosted/embedded signing, form building, white-labeling, or verification use requires paid terms is a legal/procurement decision. Engineering must not represent a capability as available until the applicable DocuSeal edition, terms, and attribution requirements are approved. Initial evidence: [DocuSeal API documentation](https://www.docuseal.com/docs/api) and [DocuSeal repository license](https://github.com/docusealco/docuseal/blob/master/LICENSE).

