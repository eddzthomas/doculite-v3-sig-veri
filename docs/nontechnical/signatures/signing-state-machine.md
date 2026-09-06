# The Life of a Signing Request

**Status:** Draft for stakeholder review

A signing request begins as a draft, is created with the signing service, then is sent and may move into progress as people act on it. It ends as completed, declined, expired, cancelled, or failed.

The product calls a request completed only after it has checked the signing service, obtained the finished PDF, added it to the document library, and linked it to the original. A notification by itself is not enough.

If a temporary technical problem occurs, the product can retry safely. A completed or cancelled request is not reopened; a new request is used for a new signing attempt.

