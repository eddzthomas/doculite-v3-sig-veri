# Decision: Put a Buffer Between Our Product and Upstream Changes

**Status:** Draft for stakeholder review

The product will use its own small integration layer when talking to Paperless and DocuSeal. This gives us one place to test and manage changes in either external product.

If an external interface is not officially documented, we will treat it cautiously, test it against a fixed version, and require approval before using it in production.

