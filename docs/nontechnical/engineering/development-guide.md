# Development Guide: Plain-Language Version

Developers run our web application alongside separate Paperless and DocuSeal services. Our application communicates with them through their supported interfaces; it does not reach into their private databases or file stores.

Passwords, keys, and real customer documents are not used in normal development. Teams use safe sample documents and trace a request through the web app, background worker, Paperless, and DocuSeal using reference IDs while keeping sensitive details out of logs.

