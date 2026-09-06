# How a Customer Installation Is Arranged

**Status:** Draft for stakeholder review

Every customer gets their own isolated installation. It contains the user-facing application, the document-management service, the signing service, and the databases and storage each service needs.

The public connects to the product application. The other services communicate privately behind it. This design means one customer's documents, signing activity, settings, and backups are not mixed with another customer's.

The exact choices for encryption, monitoring, virus scanning, sign-in, and secret storage will be selected and approved during security and operations planning; they are not being assumed just because the open-source products are present.

