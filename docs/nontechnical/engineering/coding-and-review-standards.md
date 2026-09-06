# Coding and Review Standards: Plain-Language Version

Changes must be clear, tested, and safe. The browser never receives the passwords used to talk to Paperless or DocuSeal. Our software treats those systems as separate services and records important steps so retried work does not create duplicate signed documents.

Reviewers check that access rules are honored, sensitive information stays out of logs, new features have tests and documentation, and a release can be reversed if needed. We create our own interface and do not copy protected upstream screens or code.

Code comments should help the next engineer understand why an unusual or sensitive decision exists. They should explain topics such as document preservation, access checks, signature results, retries, duplicate-event protection, upstream compatibility, and safe recovery. Comments should not simply translate each line of code into English.

Examples in the documentation must explain what they do, where they belong, which values are placeholders, and what could fail. They use sample information only—never real credentials, customer documents, signing links, or private keys.
