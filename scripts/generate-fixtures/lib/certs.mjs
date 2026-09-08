import forge from 'node-forge'

// Generates one self-signed root CA plus one leaf signed by it.
// Keys are generated per run (random); only cert PEMs are committed —
// fixture reproducibility comes from committed artifacts + checksums,
// not deterministic regeneration (spec: signature fixtures decision 2).
export function generateTrustPath(name) {
  const caKeys = forge.pki.rsa.generateKeyPair(2048)
  const caCert = forge.pki.createCertificate()
  caCert.publicKey = caKeys.publicKey
  caCert.serialNumber = '01'
  caCert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000)
  caCert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000)
  const caAttrs = [{ name: 'commonName', value: `Doculite Fixture Root ${name}` }]
  caCert.setSubject(caAttrs)
  caCert.setIssuer(caAttrs)
  caCert.setExtensions([{ name: 'basicConstraints', cA: true, critical: true }])
  caCert.sign(caKeys.privateKey, forge.sha256.create())

  const leafKeys = forge.pki.rsa.generateKeyPair(2048)
  const leafCert = forge.pki.createCertificate()
  leafCert.publicKey = leafKeys.publicKey
  leafCert.serialNumber = '02'
  leafCert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000)
  leafCert.validity.notAfter = new Date(Date.now() + 90 * 24 * 3600 * 1000)
  leafCert.setSubject([{ name: 'commonName', value: `Doculite Fixture Signer ${name}` }])
  leafCert.setIssuer(caCert.subject.attributes)
  leafCert.setExtensions([{ name: 'basicConstraints', cA: false }])
  leafCert.sign(caKeys.privateKey, forge.sha256.create())

  return {
    rootPem: forge.pki.certificateToPem(caCert),
    leafPem: forge.pki.certificateToPem(leafCert),
    // p12 bundles leaf + key for node-signpdf (passphrase empty by design)
    pkcs12: Buffer.from(
      forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(leafKeys.privateKey, leafCert, '', {})).getBytes(),
      'binary',
    ),
  }
}
