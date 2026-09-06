# How the Signing Service Notifies Us

**Status:** Draft for stakeholder review

When something changes in a signing request, DocuSeal can notify the product. The product treats that notification as a prompt to check the signing service again, rather than blindly accepting it as the final answer.

This protects against repeated, delayed, or incomplete messages. It also ensures that a completed file is added only once, even if the same notification arrives more than once.

The detailed technical format and security checks will be taken from the approved version of DocuSeal before implementation.

