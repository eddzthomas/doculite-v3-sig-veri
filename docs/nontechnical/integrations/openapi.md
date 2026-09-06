# Product API in Plain Language

**Status:** Draft for stakeholder review

The product API is the agreed set of requests the custom interface can make to the product service. It supports viewing or requesting a signature check, starting or cancelling a signing request, seeing related signed documents, and receiving signing-service notifications.

The API does not expose Paperless or DocuSeal directly to browsers. The product checks whether a person is allowed to access the related document before returning information.

The precise technical contract is maintained in `docs/integrations/openapi.yaml`; this plain-language copy explains its purpose, not its programming details.

