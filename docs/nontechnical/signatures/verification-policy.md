# What a Signature Check Means

**Status:** Draft for stakeholder review

The product will show one of five clear results: no signature found, valid and trusted, valid but not trusted by our configured policy, invalid, or unable to check. It also records when the check happened and the exact file version checked.

"Trusted" and "valid" are different ideas. A signature can be technically intact but not come from a certificate our organisation trusts. Likewise, a file that came through DocuSeal is not automatically a valid signature.

These results are technical information, not legal advice. We will not claim regulated or long-term signature compliance unless the required capabilities and legal review are in place.

## What the checker built in M0-D can and cannot claim

The first version of the checking engine is now built and tested. In plain terms, it can check whether a PDF's signature is intact — meaning the file has not been changed since it was signed — and whether the signer's certificate chain is on the approved trust list our configuration defines. What it cannot do: it cannot prove where a file really came from (it only reads a name the signer chose, which anyone can copy, and a later version will confirm origin through our own records instead), and it cannot notice every way a signature might have been removed from a file — a document whose signature was carefully stripped out can look like it was never signed. It also cannot make any legal claims: no revocation checks, no timestamp validation, no regulated-signature statements. And when the checker itself cannot finish its work — for example, on a damaged file — the result is "unable to check": a broken check is an error, never a verdict of valid or unsigned.

