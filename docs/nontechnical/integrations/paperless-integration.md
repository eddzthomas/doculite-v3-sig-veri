# How We Use Paperless-ngx

**Status:** Draft for stakeholder review

Paperless-ngx is the home for organisational documents. The product will use its supported interfaces to upload, find, read, and organise documents, while respecting Paperless access rules.

We will not reach inside Paperless's private database or files. Before development, we will lock to a specific Paperless version and test the actions we need—uploading, processing, searching, retrieving an original file, and checking access—against that version.

This gives us a safer path for future upgrades and avoids relying on undocumented behavior.

